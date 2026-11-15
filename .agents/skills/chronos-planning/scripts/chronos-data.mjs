#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ACTIVE = new Set(["__inbox__", "__control__"]);
const BINS = new Set(["__archive__", "__trash__"]);
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const DATA_SCHEMA_VERSION = 1;
const UI_FIELDS = new Set([
  "dayCount",
  "collapsed",
  "todayColumnIndex",
  "theme",
  "view",
  "expandedKey",
  "filterLastEditor",
]);
const TASK_FIELDS = new Set([
  "id",
  "text",
  "comment",
  "lastEditedByAgent",
  "archivedAt",
  "deletedAt",
]);
const OPERATION_KEYS = {
  create: new Set(["op", "bucket", "text", "comment"]),
  edit: new Set(["op", "id", "text", "comment"]),
  move: new Set(["op", "id", "to", "beforeId"]),
  archive: new Set(["op", "id"]),
  trash: new Set(["op", "id"]),
  restore: new Set(["op", "id", "to"]),
};

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const command = ["--help", "-h"].includes(argv[2])
    ? "help"
    : argv[2] || "help";
  const args = {
    command,
    data: "chronos-2.0/chronos-data.json",
    apply: false,
    json: false,
  };
  for (let index = 3; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") args.apply = true;
    else if (value === "--json") args.json = true;
    else if (
      ["--data", "--plan", "--bucket", "--editor", "--query"].includes(value)
    ) {
      if (!argv[index + 1]) fail(`${value} requires a value`);
      args[value.slice(2)] = argv[index + 1];
      index += 1;
    } else fail(`unknown argument ${value}`);
  }
  return args;
}

function digest(raw) {
  return `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`;
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`cannot read ${label} ${filePath}: ${error.message}`);
  }
  try {
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function isDateKey(value) {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function pruneEmptyDateBuckets(data) {
  let removed = 0;
  for (const [key, tasks] of Object.entries(data)) {
    if (!isDateKey(key) || !Array.isArray(tasks) || tasks.length) continue;
    delete data[key];
    removed += 1;
  }
  return removed;
}

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function rejectPastDestination(destination, todayKey, operation) {
  if (isDateKey(destination) && destination < todayKey)
    fail(`${operation} target ${destination} is in the past`);
}

function isBucket(value) {
  return (
    typeof value === "string" &&
    (ACTIVE.has(value) || BINS.has(value) || isDateKey(value))
  );
}

function isActiveBucket(value) {
  return typeof value === "string" && (ACTIVE.has(value) || isDateKey(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validDimensionSymbol(value) {
  return typeof value === "string" && [...value].length === 1 &&
    /^[\p{P}\p{S}]$/u.test(value) && ![",", ";"].includes(value);
}
function validateDimensions(data) {
  if (data.__schema__ !== DATA_SCHEMA_VERSION)
    fail(data.__schema__ > DATA_SCHEMA_VERSION
      ? "File created by a newer Chronos version. Update Chronos."
      : "Unsupported data format. Convert it with the one-time migration tool.");
  if (!Array.isArray(data.__dimensions__) ||
      data.__dimensions__.some(symbol => !validDimensionSymbol(symbol)) ||
      new Set(data.__dimensions__).size !== data.__dimensions__.length)
    fail("Invalid dimensions: use unique single punctuation or symbol characters");
  if (!isPlainObject(data.__dimensionColors__) ||
      Object.entries(data.__dimensionColors__).some(([symbol, hue]) =>
        !validDimensionSymbol(symbol) || !Number.isInteger(hue) || hue < 0 || hue > 359))
    fail("Invalid dimension colors: use single symbols and integer hues from 0 to 359");
}

function validateUi(ui) {
  if (!isPlainObject(ui)) fail("__ui__ must be an object");
  const unsupportedField = Object.keys(ui).find(
    (field) => !UI_FIELDS.has(field),
  );
  if (unsupportedField) fail(`unsupported __ui__ field ${unsupportedField}`);
  const missingField = [...UI_FIELDS].find(
    (field) => !Object.hasOwn(ui, field),
  );
  if (missingField) fail(`__ui__ is missing ${missingField}`);
  const integerRanges = {
    dayCount: [1, 30],
    todayColumnIndex: [1, 30],
  };
  for (const [field, [minimum, maximum]] of Object.entries(integerRanges)) {
    if (
      !Number.isInteger(ui[field]) ||
      ui[field] < minimum ||
      ui[field] > maximum
    )
      fail(`__ui__.${field} must be an integer from ${minimum} to ${maximum}`);
  }
  if (
    !Array.isArray(ui.collapsed) ||
    ui.collapsed.some((bucket) => !isActiveBucket(bucket))
  )
    fail("__ui__.collapsed must contain only active buckets or dates");
  const choices = {
    theme: ["light", "dark"],
    view: ["board", "month"],
    filterLastEditor: ["all", "human", "agent"],
  };
  for (const [field, allowed] of Object.entries(choices)) {
    if (!allowed.includes(ui[field]))
      fail(`__ui__.${field} must be one of ${allowed.join(", ")}`);
  }
  if (
    ui.expandedKey !== null &&
    !isActiveBucket(ui.expandedKey)
  )
    fail("__ui__.expandedKey must be an active bucket, date, or null");
  if (
    Number.isInteger(ui.dayCount) &&
    Number.isInteger(ui.todayColumnIndex) &&
    ui.todayColumnIndex > ui.dayCount
  )
    fail("__ui__.todayColumnIndex cannot exceed __ui__.dayCount");
}

function validateTaskId(id, location) {
  const validNumber = typeof id === "number" && Number.isFinite(id);
  const validString = typeof id === "string" && Boolean(id.trim());
  if (!validNumber && !validString)
    fail(`${location}.id must be a finite number or non-empty string`);
}

function validateData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail("Chronos data must be an object");
  validateDimensions(data);
  const ids = new Set();
  const requiredBuckets = new Set([...ACTIVE, ...BINS]);
  let hasUi = false;
  let taskCount = 0;
  let agentCount = 0;
  for (const [bucket, items] of Object.entries(data)) {
    if (["__schema__", "__dimensions__", "__dimensionColors__"].includes(bucket)) continue;
    if (bucket === "__ui__") {
      validateUi(items);
      hasUi = true;
      continue;
    }
    if (!Array.isArray(items)) fail(`bucket ${bucket} must be an array`);
    if (!isBucket(bucket)) fail(`unsupported task bucket ${bucket}`);
    requiredBuckets.delete(bucket);
    items.forEach((task, index) => {
      if (!task || typeof task !== "object" || Array.isArray(task))
        fail(`${bucket}[${index}] must be an object`);
      const unsupportedField = Object.keys(task).find(
        (field) => !TASK_FIELDS.has(field),
      );
      if (unsupportedField)
        fail(`task ${task.id ?? `${bucket}[${index}]`} has unsupported field ${unsupportedField}`);
      if (!("id" in task)) fail(`${bucket}[${index}] has no id`);
      validateTaskId(task.id, `${bucket}[${index}]`);
      const idKey = String(task.id);
      if (ids.has(idKey)) fail(`duplicate task id ${task.id}`);
      ids.add(idKey);
      if (typeof task.text !== "string" || !task.text.trim())
        fail(`task ${task.id} has no text`);
      if (typeof task.comment !== "string")
        fail(`task ${task.id} must have a string comment`);
      if (typeof task.lastEditedByAgent !== "boolean")
        fail(`task ${task.id} must have boolean lastEditedByAgent`);
      for (const field of ["archivedAt", "deletedAt"]) {
        if (
          Object.hasOwn(task, field) &&
          (typeof task[field] !== "number" || !Number.isFinite(task[field]))
        )
          fail(`task ${task.id} must have numeric ${field}`);
      }
      if (
        bucket === "__archive__" &&
        (typeof task.archivedAt !== "number" || !Number.isFinite(task.archivedAt))
      )
        fail(`archived task ${task.id} must have archivedAt`);
      if (
        bucket === "__trash__" &&
        (typeof task.deletedAt !== "number" || !Number.isFinite(task.deletedAt))
      )
        fail(`trashed task ${task.id} must have deletedAt`);
      taskCount += 1;
      if (task.lastEditedByAgent) agentCount += 1;
    });
  }
  if (!hasUi) fail("Chronos data must contain __ui__");
  if (requiredBuckets.size)
    fail(`Chronos data is missing ${[...requiredBuckets].join(", ")}`);
  return { taskCount, agentCount, humanCount: taskCount - agentCount };
}

function findTask(data, id) {
  const idKey = String(id);
  for (const [bucket, items] of Object.entries(data)) {
    if (!isBucket(bucket)) continue;
    const index = items.findIndex((task) => String(task.id) === idKey);
    if (index !== -1) return { bucket, index, task: items[index] };
  }
  fail(`task id ${id} was not found`);
}

function clean(value, field, allowEmpty = false) {
  if (typeof value !== "string") fail(`${field} must be a string`);
  const result = value.trim();
  if (!allowEmpty && !result) fail(`${field} cannot be empty`);
  return result;
}

function target(data, bucket) {
  if (!Array.isArray(data[bucket])) data[bucket] = [];
  return data[bucket];
}

function newId(data, seed) {
  const ids = new Set(
    Object.entries(data)
      .filter(([bucket]) => isBucket(bucket))
      .flatMap(([, items]) => items)
      .map((task) => String(task.id)),
  );
  const hex = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 12);
  let candidate = 4_000_000_000_000_000 + Number.parseInt(hex, 16);
  while (ids.has(String(candidate))) candidate += 1;
  return candidate;
}

function relocate(
  data,
  located,
  destination,
  mode,
  operationTimestamp,
  beforeId,
) {
  const [task] = data[located.bucket].splice(located.index, 1);
  if (mode === "archive") {
    delete task.deletedAt;
    task.archivedAt = operationTimestamp;
  } else if (mode === "trash") {
    delete task.archivedAt;
    task.deletedAt = operationTimestamp;
  } else {
    delete task.archivedAt;
    delete task.deletedAt;
  }
  const destinationTasks = target(data, destination);
  if (beforeId === undefined) destinationTasks.unshift(task);
  else {
    const beforeKey = String(beforeId);
    const beforeIndex = destinationTasks.findIndex(
      (item) => String(item.id) === beforeKey,
    );
    if (beforeIndex === -1)
      fail(`beforeId ${beforeId} was not found in destination ${destination}`);
    destinationTasks.splice(beforeIndex, 0, task);
  }
  return task;
}

function applyOperations(data, operations, planSeed, operationTimestamp) {
  if (!Array.isArray(operations)) fail("plan.operations must be an array");
  const changes = [];
  const todayKey = localDateKey(Date.now());
  operations.forEach((operation, index) => {
    if (!operation || typeof operation !== "object" || Array.isArray(operation))
      fail(`operation ${index + 1} must be an object`);
    const op = operation.op;
    const allowedKeys = OPERATION_KEYS[op];
    if (!allowedKeys) fail(`unsupported operation ${op}`);
    for (const key of Object.keys(operation)) {
      if (!allowedKeys.has(key)) fail(`${op} has unknown field ${key}`);
    }
    if (op === "restore" && !Object.hasOwn(operation, "to"))
      fail("restore requires to");
    if (op === "create") {
      const bucket = operation.bucket || "__inbox__";
      if (!isActiveBucket(bucket))
        fail(`create target ${bucket} must be an active bucket or date`);
      rejectPastDestination(bucket, todayKey, "create");
      const task = {
        id: newId(data, `${planSeed}:${index}:${JSON.stringify(operation)}`),
        text: clean(operation.text, "create.text"),
        comment:
          operation.comment === undefined
            ? ""
            : clean(operation.comment, "create.comment", true),
        lastEditedByAgent: true,
      };
      target(data, bucket).unshift(task);
      changes.push({ op, id: task.id, to: bucket, text: task.text, contentChanged: true });
      return;
    }

    if (!("id" in operation)) fail(`${op || "operation"} requires id`);
    validateTaskId(operation.id, op || `operation ${index + 1}`);
    const located = findTask(data, operation.id);
    if (op === "edit") {
      let contentChanged = false;
      if (Object.hasOwn(operation, "text")) {
        const text = clean(operation.text, "edit.text");
        if (text !== located.task.text) {
          located.task.text = text;
          contentChanged = true;
        }
      }
      if (Object.hasOwn(operation, "comment")) {
        const comment = clean(operation.comment, "edit.comment", true);
        if (comment !== (located.task.comment || "")) {
          located.task.comment = comment;
          contentChanged = true;
        }
      }
      if (!Object.hasOwn(operation, "text") && !Object.hasOwn(operation, "comment"))
        fail("edit requires text and/or comment");
      if (contentChanged) located.task.lastEditedByAgent = true;
      if (contentChanged)
        changes.push({
          op,
          id: located.task.id,
          bucket: located.bucket,
          text: located.task.text,
          contentChanged,
        });
      return;
    }

    if (op === "move") {
      if (!isActiveBucket(operation.to))
        fail(`move target ${operation.to} must be an active bucket or date`);
      if (operation.to !== located.bucket)
        rejectPastDestination(operation.to, todayKey, "move");
      if (Object.hasOwn(operation, "beforeId"))
        validateTaskId(operation.beforeId, "move.beforeId");
      const from = located.bucket;
      const task = relocate(
        data,
        located,
        operation.to,
        "move",
        operationTimestamp,
        operation.beforeId,
      );
      changes.push({ op, id: task.id, from, to: operation.to, text: task.text, contentChanged: false });
      return;
    }
    if (op === "archive" || op === "trash") {
      const destination = op === "archive" ? "__archive__" : "__trash__";
      if (located.bucket === destination) fail(`task ${operation.id} is already in ${destination}`);
      const from = located.bucket;
      const task = relocate(data, located, destination, op, operationTimestamp);
      changes.push({ op, id: task.id, from, to: destination, text: task.text, contentChanged: false });
      return;
    }
    if (op === "restore") {
      if (!BINS.has(located.bucket))
        fail(`task ${operation.id} is not in archive or trash`);
      const destination = operation.to;
      if (!isActiveBucket(destination))
        fail(`restore target ${destination} must be an active bucket or date`);
      rejectPastDestination(destination, todayKey, "restore");
      const from = located.bucket;
      const task = relocate(data, located, destination, "restore", operationTimestamp);
      changes.push({ op, id: task.id, from, to: destination, text: task.text, contentChanged: false });
      return;
    }
  });
  return changes;
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${milliseconds}`;
}

function parsePlanTimestamp(value) {
  if (typeof value !== "string")
    fail("plan.generatedAt must be a canonical ISO date-time string");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    fail("plan.generatedAt must be a canonical ISO date-time string");
  const age = Date.now() - parsed.getTime();
  if (age > PLAN_TTL_MS)
    fail("plan is older than one hour; generate a fresh plan");
  if (age < -CLOCK_SKEW_MS)
    fail("plan.generatedAt is too far in the future; check the system clock");
  return parsed.getTime();
}

function print(result, json) {
  if (json) return console.log(JSON.stringify(result, null, 2));
  console.log(`${result.mode}: ${result.changes?.length ?? 0} change(s)`);
  if (result.sourceHash) console.log(`Source: ${result.sourceHash}`);
  if (result.newSourceHash) console.log(`Result: ${result.newSourceHash}`);
  if (result.backup) console.log(`Backup: ${result.backup}`);
  if (result.prunedEmptyDateBuckets)
    console.log(`Pruned empty date buckets: ${result.prunedEmptyDateBuckets}`);
  if (result.stats)
    console.log(
      `Tasks: ${result.stats.taskCount} (human ${result.stats.humanCount}, agent ${result.stats.agentCount})`,
    );
  for (const change of result.changes || []) {
    console.log(`- ${change.op} ${change.id}: ${change.text}`);
  }
}

const args = parseArgs(process.argv);
if (args.command === "help") {
  console.log(
    "Usage: chronos-data.mjs summary|validate [--data FILE] [--json]\n" +
      "       chronos-data.mjs list [--data FILE] [--bucket BUCKET] [--editor human|agent] [--query TEXT] [--json]\n" +
      "       chronos-data.mjs plan [--data FILE] [--json]\n" +
      "       chronos-data.mjs apply --data FILE --plan FILE [--apply] [--json]",
  );
  process.exit(0);
}

const dataPath = path.resolve(args.data);
const source = readJson(dataPath, "data file");
const sourceHash = digest(source.raw);
const sourceStats = validateData(source.value);

if (args.command === "plan") {
  console.log(
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        sourceHash,
        operations: [],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (["summary", "validate"].includes(args.command)) {
  const buckets = Object.fromEntries(
    Object.entries(source.value)
      .filter(([bucket, value]) => isBucket(bucket) && value.length)
      .map(([key, value]) => [key, value.length]),
  );
  print({ mode: args.command, sourceHash, stats: sourceStats, buckets, changes: [] }, args.json);
  process.exit(0);
}

if (args.command === "list") {
  if (args.bucket && !isBucket(args.bucket)) fail(`unsupported bucket ${args.bucket}`);
  if (args.editor && !["human", "agent"].includes(args.editor))
    fail("--editor must be human or agent");
  const query = (args.query || "").trim().toLocaleLowerCase("ru");
  const tasks = Object.entries(source.value)
    .filter(([bucket]) => isBucket(bucket))
    .flatMap(([bucket, items]) => items.map((task) => ({ bucket, ...task })))
    .filter((task) => !args.bucket || task.bucket === args.bucket)
    .filter(
      (task) =>
        !args.editor ||
        (args.editor === "agent"
          ? task.lastEditedByAgent
          : !task.lastEditedByAgent),
    )
    .filter(
      (task) =>
        !query ||
        `${task.text}\n${task.comment || ""}`.toLocaleLowerCase("ru").includes(query),
    );
  if (args.json)
    console.log(
      JSON.stringify(
        { mode: "list", sourceHash, matching: tasks.length, tasks },
        null,
        2,
      ),
    );
  else {
    console.log(`list: ${tasks.length} task(s)`);
    console.log(`Source: ${sourceHash}`);
    for (const task of tasks)
      console.log(
        `- [${task.bucket}] ${task.id} ${task.lastEditedByAgent ? "agent" : "human"}: ${task.text}`,
      );
  }
  process.exit(0);
}

if (args.command !== "apply") fail(`unknown command ${args.command}`);
if (!args.plan) fail("apply requires --plan FILE");
const plan = readJson(path.resolve(args.plan), "plan").value;
if (!isPlainObject(plan)) fail("plan must be an object");
if (plan.version !== 1) fail("plan.version must be 1");
const operationTimestamp = parsePlanTimestamp(plan.generatedAt);
if (typeof plan.sourceHash !== "string") fail("plan.sourceHash must be a string");
if (plan.sourceHash !== sourceHash)
  fail(`source hash mismatch; expected ${plan.sourceHash}, current ${sourceHash}`);

const working = structuredClone(source.value);
let changes = applyOperations(
  working,
  plan.operations,
  `${plan.sourceHash}:${plan.generatedAt}`,
  operationTimestamp,
);
const prunedEmptyDateBuckets = pruneEmptyDateBuckets(working);
const stats = validateData(working);
const semanticChange =
  JSON.stringify(working) !== JSON.stringify(source.value);
if (!semanticChange) changes = [];
const resultRaw = semanticChange ? JSON.stringify(working) : source.raw;
const newSourceHash = digest(resultRaw);

if (!args.apply) {
  print(
    {
      mode: "dry-run",
      sourceHash,
      newSourceHash,
      stats,
      changes,
      prunedEmptyDateBuckets,
    },
    args.json,
  );
  process.exit(0);
}

if (!semanticChange) {
  print(
    { mode: "no-op", sourceHash, newSourceHash, stats, changes },
    args.json,
  );
  process.exit(0);
}

const latestRaw = fs.readFileSync(dataPath, "utf8");
if (digest(latestRaw) !== sourceHash)
  fail("data file changed after validation; rebuild the plan from a new summary");
const parsed = path.parse(dataPath);
const backupDirectory = path.join(parsed.dir, "backups");
fs.mkdirSync(backupDirectory, { recursive: true });
const backupPath = path.join(
  backupDirectory,
  `${parsed.name}.backup-${timestamp()}${parsed.ext || ".json"}`,
);
fs.copyFileSync(dataPath, backupPath, fs.constants.COPYFILE_EXCL);
if (digest(fs.readFileSync(dataPath, "utf8")) !== sourceHash)
  fail("data file changed while creating the backup; original was not overwritten");
const temporaryPath = path.join(
  parsed.dir,
  `.${parsed.base}.tmp-${process.pid}-${crypto.randomUUID()}`,
);
try {
  fs.writeFileSync(temporaryPath, resultRaw, { encoding: "utf8", flag: "wx" });
} catch (error) {
  if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  fail(`cannot prepare atomic replacement: ${error.message}`);
}
if (digest(fs.readFileSync(dataPath, "utf8")) !== sourceHash) {
  fs.unlinkSync(temporaryPath);
  fail("data file changed before replacement; original was not overwritten");
}
try {
  fs.renameSync(temporaryPath, dataPath);
} catch (error) {
  if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  fail(`cannot replace data file atomically: ${error.message}`);
}
print(
  {
    mode: "applied",
    sourceHash,
    newSourceHash,
    backup: backupPath,
    stats,
    changes,
    prunedEmptyDateBuckets,
  },
  args.json,
);

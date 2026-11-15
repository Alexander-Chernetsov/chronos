import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import crypto from "node:crypto";

const repo = path.resolve(import.meta.dirname, "..");
const coreSource = fs.readFileSync(path.join(repo, "chronos-2.0/scripts/chronos.core.js"), "utf8");
const core = new Function("window", `${coreSource}
  state = seed();
  return {seed, task, validateIncomingData, parseTaskMarkers};
`)({ matchMedia: () => ({ matches: false }) });
const script = path.join(repo, ".agents/skills/chronos-planning/scripts/chronos-data.mjs");
const behavior = new Function("window", `${coreSource}
  ${fs.readFileSync(path.join(repo, "chronos-2.0/scripts/chronos.board.js"), "utf8")}
  ${fs.readFileSync(path.join(repo, "chronos-2.0/scripts/chronos.tasks.js"), "utf8")}
  return {setState(value) {state = value;}, activeTaskMarkers, taskMatchesFilter, taskFromFilter};
`)({matchMedia: () => ({matches: false})});
function fixture() {
  return {
    __schema__: 1,
    __dimensions__: ["#", "@", "!", "+"],
    __dimensionColors__: { "#": 85, "@": 305, "!": 25, "+": 190, "%": 55 },
    __inbox__: [{ id: 1, text: "Review #build @Ирина !🔥soon +home", comment: "Keep this", lastEditedByAgent: false }],
    __control__: [], __archive__: [], __trash__: [],
    __ui__: { dayCount: 7, collapsed: [], todayColumnIndex: 2, theme: "light", view: "board", expandedKey: null, filterLastEditor: "all" },
  };
}
function cli(data, args = ["summary"]) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chronos-dimensions-"));
  try {
    const file = path.join(temporary, "data.json");
    fs.writeFileSync(file, JSON.stringify(data));
    return spawnSync(process.execPath, [script, ...args, "--data", file, "--json"], { encoding: "utf8", windowsHide: true });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

test("new tasks and seed use the dimension schema without retired flags", () => {
  const seed = core.seed();
  assert.equal(seed.__schema__, 1);
  assert.deepEqual(seed.__dimensions__, ["#", "@", "!"]);
  for (const key of ["starred", "urgent", "inProgress"]) assert.equal(Object.hasOwn(core.task("Test"), key), false);
  for (const key of ["cardStyle", "filterInProgress", "filterStarred", "filterUrgent", "filterCommented"]) assert.equal(Object.hasOwn(seed.__ui__, key), false);
  core.validateIncomingData(seed);
});

test("task IDs survive a frozen clock and random source, and mix with existing IDs", () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  let tasks;
  try {
    Date.now = () => 1_794_700_000_000;
    Math.random = () => 0.5;
    tasks = Array.from({length: 500}, (_, index) => core.task(`Bulk ${index}`));
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
  assert.equal(new Set(tasks.map(item => String(item.id))).size, tasks.length);
  const data = fixture();
  data.__inbox__.push({id: "existing-string-id", text: "Existing", comment: "", lastEditedByAgent: false}, ...tasks);
  core.validateIncomingData(data);
  const result = cli(data);
  assert.equal(result.status, 0, result.stderr);
});

test("one parser recognizes enabled dimensions, preserves text, deduplicates normalized keys", () => {
  const source = "Start #Čaj #C\u030caj @Ирина !👩‍💻work +home. C++ mail@example.com готово!";
  const parsed = core.parseTaskMarkers(source, ["#", "@", "!", "+"]);
  assert.deepEqual(parsed.markers, ["#čaj", "@ирина", "!👩‍💻work", "+home"]);
  assert.equal(parsed.parts.map(part => part.type === "text" ? part.value : part.symbol + part.label).join(""), source);
  assert.deepEqual(core.parseTaskMarkers(source, ["@", "!"]).markers, ["@ирина", "!👩‍💻work"]);
  assert.deepEqual(core.parseTaskMarkers(source, []).markers, []);
  for (const symbol of ["+", "[", "]", "\\", "^", "$", ".", "?", "*"]) {
    assert.deepEqual(core.parseTaskMarkers(`${symbol}value`, [symbol]).markers, [symbol + "value"]);
  }
});

test("browser and CLI agree on accepted metadata, including disabled colors", () => {
  for (const dimensions of [["#", "@", "!", "+"], [], ["[", "\\", "^", "."]]) {
    const data = fixture();
    data.__dimensions__ = dimensions;
    dimensions.forEach(symbol => { data.__dimensionColors__[symbol] = 55; });
    assert.doesNotThrow(() => core.validateIncomingData(data));
    const result = cli(data);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).stats.taskCount, 1, "metadata arrays are not task buckets");
  }
});

test("discovery excludes history and metadata, includes Control and overdue tasks", () => {
  const data = fixture();
  data.__control__ = [{id: 2, text: "#build #Build @Ivan", comment: "", lastEditedByAgent: false}];
  data["2026-01-01"] = [{id: 3, text: "#overdue", comment: "", lastEditedByAgent: false}];
  data.__archive__ = [{id: 4, text: "#archived", comment: "", lastEditedByAgent: false, archivedAt: 1}];
  data.__trash__ = [{id: 5, text: "#deleted", comment: "", lastEditedByAgent: false, deletedAt: 1}];
  behavior.setState(data);
  const values = behavior.activeTaskMarkers();
  assert.deepEqual(values["#"], [{key: "#build", label: "build", count: 2}, {key: "#overdue", label: "overdue", count: 1}]);
  assert.deepEqual(values["@"].map(entry => entry.key), ["@ivan", "@ирина"]);
});

test("one value per dimension intersects filters and creation inherits all selections once", () => {
  const data = fixture();
  behavior.setState(data);
  const filter = {text: "", markers: {"#": "#build", "@": "@ирина"}, lastEditor: "all"};
  assert.equal(behavior.taskMatchesFilter(data.__inbox__[0], filter), true);
  assert.equal(behavior.taskMatchesFilter({...data.__inbox__[0], text: "#build @Ivan"}, filter), false);
  assert.equal(behavior.taskMatchesFilter({...data.__inbox__[0], text: "#build #other @Ирина"}, filter), true);
  assert.equal(behavior.taskFromFilter("New", filter).text, "#build @Ирина New");
  assert.equal(behavior.taskFromFilter("New #BUILD @ирина", filter).text, "New #BUILD @ирина");
  assert.equal(behavior.taskMatchesFilter(data.__inbox__[0], {...filter, lastEditor: "agent"}), false);
  assert.equal(behavior.taskMatchesFilter(data.__inbox__[0], {...filter, text: "keep"}), true);
});

test("browser and CLI reject incompatible versions, malformed metadata, retired fields", () => {
  const cases = [
    data => delete data.__schema__,
    data => { data.__schema__ = 2; }, data => { data.__schema__ = 0; },
    data => { data.__schema__ = "1"; },
    data => delete data.__dimensions__, data => delete data.__dimensionColors__,
    data => { data.__dimensions__ = ["#", "#"]; },
    ...["##", "a", "1", " ", ",", ";"].map(symbol => data => { data.__dimensions__ = [symbol]; }),
    data => { data.__dimensionColors__["#"] = 360; },
    data => { data.__dimensionColors__["#"] = 1.5; },
    data => { data.__dimensionColors__["#"] = "85"; },
    data => { data.__dimensionColors__["##"] = 25; },
    ...["starred", "urgent", "inProgress"].map(field => data => { data.__inbox__[0][field] = false; }),
    data => { data.__ui__.cardStyle = "stripe"; },
  ];
  cases.forEach((mutate, index) => {
    const data = fixture(); mutate(data);
    assert.throws(() => core.validateIncomingData(data), `browser accepted invalid case ${index}`);
    const result = cli(data);
    assert.notEqual(result.status, 0, `CLI accepted invalid case ${index}`);
  });
});

test("agent dry-run/apply preserve dimension metadata and reject retired operations", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chronos-dimensions-apply-"));
  try {
    const file = path.join(temporary, "data.json");
    const planFile = path.join(temporary, "plan.json");
    const data = fixture();
    const raw = JSON.stringify(data);
    fs.writeFileSync(file, raw);
    const plan = operations => fs.writeFileSync(planFile, JSON.stringify({
      version: 1, generatedAt: new Date().toISOString(),
      sourceHash: "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), operations,
    }));
    const run = apply => spawnSync(process.execPath, [script, "apply", "--data", file, "--plan", planFile, "--json", ...(apply ? ["--apply"] : [])], { encoding: "utf8", windowsHide: true });
    plan([{ op: "set_flags", id: 1, urgent: true }]);
    assert.notEqual(run(false).status, 0);
    plan([{ op: "create", text: "Rejected", inProgress: true }]);
    assert.notEqual(run(false).status, 0);
    plan([{ op: "edit", id: 1, text: "Changed #build" }, { op: "create", text: "New @Ирина" }]);
    const dry = run(false);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(fs.readFileSync(file, "utf8"), raw);
    const applied = run(true);
    assert.equal(applied.status, 0, applied.stderr);
    const result = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(result.__dimensions__, data.__dimensions__);
    assert.deepEqual(result.__dimensionColors__, data.__dimensionColors__);
    assert.equal(result.__inbox__.find(task => task.id === 1).lastEditedByAgent, true);
    assert.equal(result.__inbox__.length, 2);
    assert.equal(fs.readFileSync(JSON.parse(applied.stdout).backup, "utf8"), raw);
    core.validateIncomingData(result);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

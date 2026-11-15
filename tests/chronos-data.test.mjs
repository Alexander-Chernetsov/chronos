import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const script = path.join(
  repo,
  ".agents",
  "skills",
  "chronos-planning",
  "scripts",
  "chronos-data.mjs",
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chronos-data-test-"));
const dataPath = path.join(temporary, "chronos-data.json");
const planPath = path.join(temporary, "plan.json");
const backupDirectory = path.join(temporary, "backups");

const task = (id, text, agent = false) => ({
  id,
  text,
  comment: "",
  lastEditedByAgent: agent,
});
const original = {
  __schema__: 1,
  __dimensions__: ["#", "@", "!"],
  __dimensionColors__: {"#": 85, "@": 305, "!": 25, "+": 190},
  __inbox__: [
    task(1, "Human task"),
    task(2, "Agent task", true),
    task(3, "Move only"),
  ],
  __control__: [task(4, "Control anchor")],
  __archive__: [],
  __trash__: [],
  "2026-08-15": [],
  __ui__: {
    dayCount: 7,
    collapsed: [],
    todayColumnIndex: 2,
    theme: "light",
    view: "month",
    expandedKey: "2026-08-01",
            filterLastEditor: "all",
  },
};

function run(...args) {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function runFailure(...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, `command unexpectedly passed: ${args.join(" ")}`);
  return result.stderr;
}

function writePlan(sourceHash, operations, generatedAt = new Date().toISOString()) {
  const plan = { version: 1, generatedAt, sourceHash, operations };
  fs.writeFileSync(planPath, JSON.stringify(plan), "utf8");
  return plan;
}

function dateKeyAtOffset(source, dayOffset) {
  const date = new Date(source);
  date.setDate(date.getDate() + dayOffset);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => (index ? String(value).padStart(2, "0") : value))
    .join("-");
}

function summary() {
  return JSON.parse(run("summary", "--data", dataPath, "--json"));
}

try {
  const originalRaw = JSON.stringify(original);
  fs.writeFileSync(dataPath, originalRaw, "utf8");

  const initial = summary();
  assert.equal(initial.stats.taskCount, 4);
  assert.equal(initial.stats.agentCount, 1);
  const skeleton = JSON.parse(run("plan", "--data", dataPath, "--json"));
  assert.equal(skeleton.version, 1);
  assert.equal(skeleton.sourceHash, initial.sourceHash);
  assert.deepEqual(skeleton.operations, []);
  assert.equal(new Date(skeleton.generatedAt).toISOString(), skeleton.generatedAt);

  const agentTasks = JSON.parse(
    run("list", "--data", dataPath, "--editor", "agent", "--json"),
  );
  assert.deepEqual(agentTasks.tasks.map(({ id }) => id), [2]);

  writePlan(initial.sourceHash, [
    { op: "edit", id: 1, text: "Edited by agent" },
    { op: "edit", id: 2, text: "Agent task" },
    { op: "move", id: 3, to: "__control__", beforeId: 4 },
    { op: "create", bucket: "__control__", text: "Created by agent" },
  ]);

  const dryRun = JSON.parse(
    run("apply", "--data", dataPath, "--plan", planPath, "--json"),
  );
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.changes.length, 3, "no-op edit must not be reported");
  assert.equal(fs.readFileSync(dataPath, "utf8"), originalRaw);

  const applied = JSON.parse(
    run("apply", "--data", dataPath, "--plan", planPath, "--apply", "--json"),
  );
  assert.equal(applied.mode, "applied");
  assert.equal(applied.newSourceHash, dryRun.newSourceHash);
  assert.equal(applied.prunedEmptyDateBuckets, 1);
  assert.ok(fs.existsSync(applied.backup));
  assert.equal(path.dirname(applied.backup), backupDirectory);
  assert.equal(fs.readFileSync(applied.backup, "utf8"), originalRaw);
  assert.equal(
    fs.readdirSync(temporary).some((name) => name.includes(".tmp-")),
    false,
    "atomic replacement must not leave a temporary file",
  );

  let changed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  assert.equal(Object.hasOwn(changed, "2026-08-15"), false);
  assert.equal(changed.__inbox__.find(({ id }) => id === 1).lastEditedByAgent, true);
  assert.deepEqual(changed.__dimensions__, original.__dimensions__);
  assert.deepEqual(changed.__dimensionColors__, original.__dimensionColors__);
  assert.equal(Object.hasOwn(changed.__inbox__[0], "inProgress"), false);
  assert.equal(changed.__inbox__.find(({ id }) => id === 2).lastEditedByAgent, true);
  assert.equal(changed.__control__.find(({ id }) => id === 3).lastEditedByAgent, false);
  assert.equal(changed.__control__[0].lastEditedByAgent, true);
  assert.equal(Object.hasOwn(changed.__control__[0], "inProgress"), false);
  assert.ok(
    changed.__control__.findIndex(({ id }) => id === 3) <
      changed.__control__.findIndex(({ id }) => id === 4),
    "beforeId must control destination order",
  );

  const afterContent = summary();
  writePlan(afterContent.sourceHash, [
    { op: "archive", id: 3 },
    { op: "trash", id: 3 },
    { op: "restore", id: 3, to: "__control__" },
  ]);
  const lifecycle = JSON.parse(
    run("apply", "--data", dataPath, "--plan", planPath, "--apply", "--json"),
  );
  assert.equal(lifecycle.changes.length, 3);
  changed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  assert.ok(changed.__control__.some(({ id }) => id === 3));
  assert.ok(!changed.__archive__.some(({ id }) => id === 3));
  assert.ok(!changed.__trash__.some(({ id }) => id === 3));

  const beforeNoOp = fs.readFileSync(dataPath, "utf8");
  const backupCount = fs.readdirSync(backupDirectory).length;
  const beforeNoOpSummary = summary();
  writePlan(beforeNoOpSummary.sourceHash, [
    { op: "edit", id: 2, text: "Agent task" },
    { op: "edit", id: 2, text: "Agent task" },
  ]);
  const noOpDryRun = JSON.parse(
    run("apply", "--data", dataPath, "--plan", planPath, "--json"),
  );
  assert.equal(noOpDryRun.newSourceHash, beforeNoOpSummary.sourceHash);
  assert.deepEqual(noOpDryRun.changes, []);
  const noOpApply = JSON.parse(
    run("apply", "--data", dataPath, "--plan", planPath, "--apply", "--json"),
  );
  assert.equal(noOpApply.mode, "no-op");
  assert.equal(fs.readFileSync(dataPath, "utf8"), beforeNoOp);
  assert.equal(
    fs.readdirSync(backupDirectory).length,
    backupCount,
    "no-op apply must not create a backup",
  );

  const samePlaceId = changed.__control__[0].id;
  writePlan(beforeNoOpSummary.sourceHash, [
    { op: "move", id: samePlaceId, to: "__control__" },
  ]);
  const noOpMove = JSON.parse(
    run("apply", "--data", dataPath, "--plan", planPath, "--apply", "--json"),
  );
  assert.equal(noOpMove.mode, "no-op");
  assert.deepEqual(noOpMove.changes, []);
  assert.equal(fs.readFileSync(dataPath, "utf8"), beforeNoOp);
  assert.equal(fs.readdirSync(backupDirectory).length, backupCount);

  writePlan(
    beforeNoOpSummary.sourceHash,
    [],
    new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  );
  assert.match(
    runFailure("apply", "--data", dataPath, "--plan", planPath),
    /older than one hour/,
  );
  writePlan(
    beforeNoOpSummary.sourceHash,
    [],
    new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  );
  assert.match(
    runFailure("apply", "--data", dataPath, "--plan", planPath),
    /canonical ISO date-time/,
  );

  for (const [operation, message] of [
    [{ op: "create", bucket: "2026-02-31", text: "Bad date" }, /calendar date|active bucket/],
    [{ op: "create", text: "Bad flag", starred: "yes" }, /create has unknown field starred/],
    [{ op: "create", text: "Bad progress", inProgress: "yes" }, /create has unknown field inProgress/],
    [{ op: "set_flags", id: 1, urgent: "yes" }, /unsupported operation set_flags/],
    [{ op: "set_flags", id: 1, inProgress: "yes" }, /unsupported operation set_flags/],
    [{ op: "create", text: "Typo", coment: "Ignored" }, /unknown field coment/],
    [{ op: "move", id: 1, to: "__control__", beforeID: 4 }, /unknown field beforeID/],
    [{ op: "edit", id: 1, text: "Blocked", lastEditedByAgent: false }, /unknown field lastEditedByAgent/],
    [{ op: "migrate_legacy" }, /unsupported operation migrate_legacy/],
    [{ op: "restore", id: 1 }, /restore requires to|not in archive or trash/],
  ]) {
    writePlan(beforeNoOpSummary.sourceHash, [operation]);
    assert.match(
      runFailure("apply", "--data", dataPath, "--plan", planPath),
      message,
    );
  }
  const freshTimestamp = new Date().toISOString();
  const pastDate = dateKeyAtOffset(freshTimestamp, -1);
  for (const operations of [
    [{ op: "create", bucket: pastDate, text: "Past task" }],
    [{ op: "move", id: 1, to: pastDate }],
    [
      { op: "archive", id: 1 },
      { op: "restore", id: 1, to: pastDate },
    ],
  ]) {
    writePlan(beforeNoOpSummary.sourceHash, operations, freshTimestamp);
    assert.match(
      runFailure("apply", "--data", dataPath, "--plan", planPath),
      /target .* is in the past/,
    );
  }
  writePlan(beforeNoOpSummary.sourceHash, [
    { op: "archive", id: 1 },
    { op: "restore", id: 1 },
  ]);
  assert.match(
    runFailure("apply", "--data", dataPath, "--plan", planPath),
    /restore requires to/,
  );

  const validRaw = fs.readFileSync(dataPath, "utf8");
  const validData = JSON.parse(validRaw);
  const withUi = (changes) => ({
    ...validData,
    __ui__: { ...validData.__ui__, ...changes },
  });
  const withoutUi = JSON.parse(validRaw);
  delete withoutUi.__ui__;
  const withoutUiView = JSON.parse(validRaw);
  delete withoutUiView.__ui__.view;
  const withoutInbox = JSON.parse(validRaw);
  delete withoutInbox.__inbox__;
  const invalidCases = [
    [withoutUi, /must contain __ui__/],
    [withoutUiView, /__ui__ is missing view/],
    [withoutInbox, /missing __inbox__/],
    [
      { ...JSON.parse(validRaw), "2026-02-31": [] },
      /unsupported task bucket/,
    ],
    [
      withUi({ dayCount: 7, todayColumnIndex: 8 }),
      /todayColumnIndex cannot exceed/,
    ],
    [
      withUi({ retiredMode: "focus" }),
      /unsupported __ui__ field retiredMode/,
    ],
    [
      withUi({ actionsAlwaysVisible: true }),
      /unsupported __ui__ field actionsAlwaysVisible/,
    ],
    [
      withUi({ view: "timeline" }),
      /__ui__\.view must be one of board, month/,
    ],
    [
      withUi({ expandedKey: "__archive__" }),
      /expandedKey must be an active bucket/,
    ],
    [
      {
        ...JSON.parse(validRaw),
        __archive__: [task(99, "Missing lifecycle")],
      },
      /must have archivedAt/,
    ],
    [
      {
        ...JSON.parse(validRaw),
        __inbox__: [{ ...task(101, "Legacy task"), originalKey: "__inbox__" }],
      },
      /unsupported field originalKey/,
    ],
    [
      {
        ...JSON.parse(validRaw),
        __inbox__: [{ ...task(102, "Legacy done"), done: false }],
      },
      /unsupported field done/,
    ],
    [
      {
        ...JSON.parse(validRaw),
        __inbox__: [
          {
            id: 100,
            text: "Old task",
                                comment: "",
                    },
        ],
      },
      /must have boolean lastEditedByAgent/,
    ],
    [
      {
        ...JSON.parse(validRaw),
        __inbox__: [
          {
            id: 103,
            text: "Retired progress",
            inProgress: false,
                                comment: "",
            lastEditedByAgent: false,
          },
        ],
      },
      /unsupported field inProgress/,
    ],
    [
      {
        ...JSON.parse(validRaw),
        __inbox__: [task(1, "Numeric id"), task("1", "String id")],
      },
      /duplicate task id/,
    ],
  ];
  for (const [invalid, message] of invalidCases) {
    fs.writeFileSync(dataPath, JSON.stringify(invalid), "utf8");
    assert.match(runFailure("validate", "--data", dataPath), message);
  }
  fs.writeFileSync(dataPath, validRaw, "utf8");

  for (const timestamp of [null, "", true, "123"]) {
    const invalidTimestamp = {
      ...JSON.parse(validRaw),
      __archive__: [
        {
          ...task(200, "Bad timestamp"),
          archivedAt: timestamp,
        },
      ],
    };
    fs.writeFileSync(dataPath, JSON.stringify(invalidTimestamp), "utf8");
    assert.match(
      runFailure("validate", "--data", dataPath),
      /must have numeric archivedAt|must have archivedAt/,
    );
  }
  fs.writeFileSync(dataPath, validRaw, "utf8");

  writePlan("sha256:stale", []);
  const stalePlanError = runFailure(
    "apply",
    "--data",
    dataPath,
    "--plan",
    planPath,
  );
  assert.match(stalePlanError, /source hash mismatch/);
  console.log("chronos-data tests: ok");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

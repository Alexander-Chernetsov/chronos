import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const read = name => fs.readFileSync(path.join(repo, name), "utf8");
const core = read("chronos-2.0/scripts/chronos.core.js");
const version = core.match(/const CHRONOS_VERSION = "([\d.]+)"/)[1];
const guides = ["README.md", "README.ru.md", "chronos-2.0/README.md", "chronos-2.0/README.ru.md"];
for (const name of guides) {
  const content = read(name);
  assert.ok(content.startsWith(`# Chronos ${version}`), `stale version: ${name}`);
  assert.ok(content.includes(name.endsWith(".ru.md") ? "[English](README.md)" : "[Русский](README.ru.md)"), `missing language switch: ${name}`);
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue;
    const target = path.resolve(repo, path.dirname(name), decodeURIComponent(match[1].split("#")[0]));
    assert.ok(fs.existsSync(target), `broken link in ${name}: ${match[1]}`);
  }
}
for (const [name, clauses] of [
  ["README.md", ["seven days", "no fallback file", "no automatic", "low-maintenance", "tmp/plan.json", "one hour", "best-effort"]],
  ["README.ru.md", ["семь дней", "запасного файлового", "без автоматической миграции", "low maintenance", "tmp/plan.json", "один час", "best-effort"]],
  ["chronos-2.0/README.md", ["seven days", "recovery", "before", "AND", "257 keys", "__schema__: 1", "not automatically migrated"]],
  ["chronos-2.0/README.ru.md", ["семь дней", "recovery", "приостановлены", "AND", "257 ключей", "__schema__: 1", "автоматически не преобразуются"]]
]) {
  const content = read(name).replace(/\s+/g, " ");
  for (const clause of clauses) assert.ok(content.includes(clause), `${name} lost a material contract: ${clause}`);
}
const html = read("chronos-2.0/chronos.html");
for (const id of ["viewToggle", "helpLayer", "activeCount", "dimensionManagerToggle", "newDimensionSymbol"]) {
  assert.ok(html.includes(`id="${id}"`));
}
for (const id of ["cardStyleToggle", "dimensionSymbols", "actionsToggle"]) assert.ok(!html.includes(`id="${id}"`));
assert.ok(!html.includes("data-help-tab"));
const skill = read(".agents/skills/chronos-planning/SKILL.md");
for (const contract of ["rejects plans older than one hour", "stores backups in `chronos-2.0/backups/`",
  "do not carry a hidden restore destination", "best-effort concurrency check", "`restore.to` is required",
  "unknown fields and likely typos are errors", "atomically replace the JSON",
  "obsolete `done` or `originalKey` fields are rejected", "Task markers are ordinary tokens inside `text`"])
  assert.ok(skill.includes(contract), `skill lost: ${contract}`);
const script = read(".agents/skills/chronos-planning/scripts/chronos-data.mjs");
for (const contract of ['if (args.command === "plan")', 'data: "chronos-2.0/chronos-data.json"', "PLAN_TTL_MS", 'mode: "no-op"', "OPERATION_KEYS", "fs.renameSync(temporaryPath, dataPath)"])
  assert.ok(script.includes(contract));
assert.ok(!script.includes('"actionsAlwaysVisible"') && !script.includes("migrate_legacy"));
assert.ok(read("AGENTS.md").includes("Do not invent IDs"));
assert.ok(read(".github/workflows/checks.yml").includes("branches: [main]"));
assert.ok(read(".github/workflows/checks.yml").includes("chronos-demo.browser.py"));
assert.ok(read("LICENSE").startsWith("MIT License"));
for (const excluded of ["chronos-1.0", "docs/plans", "DESIGN.md", "PRODUCT.md", ".impeccable"])
  assert.equal(fs.existsSync(path.join(repo, excluded)), false, `private/history artifact exported: ${excluded}`);
console.log("public documentation, links, language parity and safety contracts: ok");

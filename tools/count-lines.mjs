#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const listed = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: repoRoot },
);

if (listed.error || listed.status !== 0) {
  const reason = listed.error?.message || listed.stderr.toString().trim();
  console.error(`Could not list project files: ${reason || "git failed"}`);
  process.exit(1);
}

const typeByExtension = new Map([
  [".css", "CSS"],
  [".html", "HTML"],
  [".js", "JavaScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".json", "JSON"],
  [".md", "Markdown"],
  [".ps1", "PowerShell"],
  [".py", "Python"],
  [".svg", "SVG"],
  [".txt", "Text"],
  [".yaml", "YAML"],
  [".yml", "YAML"],
]);

function fileType(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (typeByExtension.has(extension)) return typeByExtension.get(extension);
  if (!extension && basename(filePath).startsWith(".")) return "Config";
  if (!extension) return "Text";
  return extension.slice(1).toUpperCase();
}

function physicalLineCount(content) {
  if (!content.length) return 0;
  const text = content.toString("utf8");
  const lines = text.split(/\r\n|\n|\r/).length;
  return /(?:\r\n|\n|\r)$/.test(text) ? lines - 1 : lines;
}

const files = listed.stdout.toString("utf8").split("\0").filter(Boolean);
const totals = new Map();
let binaryFiles = 0;

for (const filePath of files) {
  const content = readFileSync(resolve(repoRoot, filePath));
  if (content.includes(0)) {
    binaryFiles += 1;
    continue;
  }
  const type = fileType(filePath);
  const current = totals.get(type) || { files: 0, lines: 0 };
  current.files += 1;
  current.lines += physicalLineCount(content);
  totals.set(type, current);
}

const rows = [...totals.entries()]
  .map(([type, counts]) => ({ type, ...counts }))
  .sort((left, right) => right.lines - left.lines || left.type.localeCompare(right.type));
const totalFiles = rows.reduce((sum, row) => sum + row.files, 0);
const totalLines = rows.reduce((sum, row) => sum + row.lines, 0);
const typeWidth = Math.max("Type".length, ...rows.map((row) => row.type.length));
const fileWidth = Math.max("Files".length, String(totalFiles).length);
const lineWidth = Math.max("Lines".length, String(totalLines).length);
const formatRow = (type, fileCount, lineCount) =>
  `${type.padEnd(typeWidth)}  ${String(fileCount).padStart(fileWidth)}  ${String(lineCount).padStart(lineWidth)}`;

console.log("Chronos project lines (Git files, physical lines)\n");
console.log(formatRow("Type", "Files", "Lines"));
console.log(formatRow("-".repeat(typeWidth), "-".repeat(fileWidth), "-".repeat(lineWidth)));
for (const row of rows) console.log(formatRow(row.type, row.files, row.lines));
console.log(formatRow("-".repeat(typeWidth), "-".repeat(fileWidth), "-".repeat(lineWidth)));
console.log(formatRow("Total", totalFiles, totalLines));
if (binaryFiles) console.log(`\nSkipped binary files: ${binaryFiles}`);

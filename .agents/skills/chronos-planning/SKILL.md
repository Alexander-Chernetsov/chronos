---
name: chronos-planning
description: Safely inspect, plan, create, edit, schedule, edit inline markers, archive, trash, or restore tasks in this repository's chronos-2.0/chronos-data.json file. Use for any request to work with Chronos tasks, dates, priorities, progress, comments, inbox, control, archive, or trash. Always use the bundled script instead of editing the JSON directly so agent authorship, dry-run review, backups, strict validation, best-effort concurrency checks, and atomic replacement are preserved.
---

# Chronos Planning

Work with Chronos through `scripts/chronos-data.mjs`. Never patch or rewrite
`chronos-2.0/chronos-data.json` directly. The script uses that file by default;
keep `--data` explicit in reviewable commands.

## Workflow

1. Inspect the current file:

   ```powershell
   node .agents/skills/chronos-planning/scripts/chronos-data.mjs summary --data chronos-2.0/chronos-data.json
   ```

2. Read the relevant tasks. Use `list --json`; narrow it with `--bucket`, `--editor human|agent`, or `--query` when useful.
3. Generate a plan skeleton with the current hash and timestamp:

   ```powershell
   node .agents/skills/chronos-planning/scripts/chronos-data.mjs plan --data chronos-2.0/chronos-data.json --json
   ```

   Save the output as a temporary plan JSON and fill its `operations` array. Keep the generated `sourceHash` and `generatedAt` unchanged. Apply or regenerate the plan within one hour.
4. Run the plan without `--apply`. Dry-run is the default:

   ```powershell
   node .agents/skills/chronos-planning/scripts/chronos-data.mjs apply --data chronos-2.0/chronos-data.json --plan path/to/plan.json
   ```

5. Explain the proposed changes. Apply only when the user has authorized those task changes:

   ```powershell
   node .agents/skills/chronos-planning/scripts/chronos-data.mjs apply --data chronos-2.0/chronos-data.json --plan path/to/plan.json --apply
   ```

6. Report the backup path, new source hash, and changed tasks. The script stores backups in `chronos-2.0/backups/` next to the standard data file. A no-op apply does not rewrite the file or create a backup. If Chronos already has the same JSON connected, its open page will reload the external change automatically.

The browser and agent script remove empty calendar-date buckets during an
ordinary save or apply. Required service buckets remain present even when
empty; this normalization does not change tasks or their authorship.

## Plan format

```json
{
  "version": 1,
  "generatedAt": "2026-08-01T12:00:00.000Z",
  "sourceHash": "sha256:...",
  "operations": [
    { "op": "create", "bucket": "__inbox__", "text": "Новая задача", "comment": "" },
    { "op": "edit", "id": 123, "text": "Новое название", "comment": "Новый комментарий" },
    { "op": "move", "id": 123, "to": "2026-08-03", "beforeId": 456 },
    { "op": "archive", "id": 123 },
    { "op": "trash", "id": 123 },
    { "op": "restore", "id": 123, "to": "__inbox__" }
  ]
}
```

Valid buckets are `__inbox__`, `__control__`, `__archive__`, `__trash__`, or a real calendar date in `YYYY-MM-DD` form. `move` accepts active buckets and dates. `restore.to` is required and accepts `__inbox__`, `__control__`, or a date; never rely on an implicit restore destination.

Do not create, move, or restore an active task to a date before the current
local date at dry-run or apply time. Existing overdue tasks remain valid and
may be edited, archived, trashed, moved forward, or reordered within their
current past date.

`beforeId` is optional. Use it to place a moved task before another task already in the destination; without it, the task goes to the top.

Generate `generatedAt` once with the `plan` command. The script accepts only its canonical ISO form and rejects plans older than one hour. It uses the timestamp for deterministic task IDs and lifecycle timestamps, so dry-run and apply produce the same result without allowing a stale plan to shorten seven-day retention materially.

For `edit`, omit fields that must stay unchanged. A real change to `text` or `comment` sets `lastEditedByAgent: true`. Creating a task also sets it to `true`. Moves, ordering, archive, trash, and restore preserve the existing value. Do not add `lastEditedByAgent` to a plan; the script owns it.

Task markers are ordinary tokens inside `text`. The enabled symbols are stored
in `__dimensions__`; `__dimensionColors__` stores one hue per symbol, including
disabled dimensions. The current data schema is `__schema__: 1`. Preserve these
settings in all task operations. Do not invent separate marker arrays or people
registries. Preserve requested names, spelling and marker positions when editing.
Use `edit` to add or remove a marker; this is a real text change and sets agent
authorship. Confirm ambiguous identities instead of merging names by guesswork.

The retired `set_flags` operation and `inProgress`, `starred`, `urgent` parameters
are rejected. Use only the documented fields for each operation: unknown fields and likely typos are errors.
Every restore plan must name its destination explicitly; archived and trashed tasks
do not carry a hidden restore destination.

## Safety rules

- Treat the source hash as a best-effort concurrency check, not a shared lock with the browser. Re-inspect and rebuild the plan if it no longer matches.
- Regenerate a plan after one hour even when its source hash still matches.
- Keep dry-run output and user authorization separate unless the current request already authorizes the exact changes.
- Do not use `--apply` for analysis-only, discussion-only, or dry-run requests.
- Let the script create `backups/` and place its timestamped backup there. Do not disable or delete it.
- Let the script write a sibling temporary file and atomically replace the JSON. Do not bypass that path with direct writes.
- Prefer a small set of explicit operations. Do not silently rewrite unrelated tasks. Files with obsolete `done` or `originalKey` fields are rejected as unsupported rather than migrated implicitly.
- Never plan an active task into the past. Keep overdue tasks where they are unless the user explicitly asks to move, complete, or remove them.
- If validation fails, stop and report the exact issue instead of bypassing the script.

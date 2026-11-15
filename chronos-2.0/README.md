# Chronos 2.2.29

English · [Русский](README.ru.md)

A local planner with no app server or installation. Open [`chronos.html`](chronos.html)
with its folders intact, or use the release standalone. The app version and data
format `__schema__: 1` have separate numbering.

## User reference

**Tasks.** Press `+`, enter a title and finish with Enter. Done, Bin and `⋯`
appear at the right of a card on hover or keyboard focus. On touch screens `⋯`
is always available; Done is its first menu item. The robot before a title marks
the last text edit by an agent and enables the author filter. It is not part of
the title. Click the first comment line, or press Shift+Enter in the title, to
open the comment editor.

**Markers.** For example: `!soon Call @Irene #project`. The marker-types button
immediately left of settings manages enabled symbols. Add one symbol with `+`
or Enter, choose a color or disable it with Bin. Disabling keeps the source text
and color. Multi-symbol prefixes are not supported. Each type has one selected
filter value; a new value replaces the previous one. Types, search and author
combine with AND. The cross clears a filter.

**Data.** Without a file, tasks stay only in this browser. The indicator beside
Save opens the working-JSON connection. Once connected, changes save to disk
automatically. Ctrl+S saves the file or offers export. Concurrent external edits
produce a conflict dialog where you choose the version. Do not open one working
file in both old and new app versions at the same time.

**Clearing.** Save and clear exports a copy first. Clear without saving needs
confirmation and clears the local task snapshot, including Done and Bin, while
keeping marker types. It disconnects the JSON; it does not send an empty
snapshot to that file. An already-started write of earlier edits may finish.
Changing the data or connection while confirmation is pending cancels clearing.

**Done and Bin.** Tasks are retained for seven days and then automatically
deleted. Clearing Done moves its tasks to Bin. Permanent deletion from Bin needs
confirmation; before that, a task can be restored. Markers in these views use
the same chips and colors, but are passive and do not enable filters.

**Errors.** If the local snapshot fails validation, Chronos attempts to save
its original bytes to recovery. Replacement and import remain blocked until
that copy succeeds. An unsupported JSON version is not silently converted.
Reconnect theme/language folders in settings if browser access has expired.

| Shortcut | Action |
|---|---|
| N | New task today |
| Shift+N | Bulk entry today |
| I | New Inbox task |
| C | New Control task |
| Ctrl+F | Search |
| T | Today |
| [ / ] | Previous / next range |
| Shift+T | Move overdue tasks after confirmation |
| Enter | Save title; insert the selected autocomplete item first, if any |
| Shift+Enter | Open the comment from the title |
| Ctrl+Enter | Save the current editor |
| Ctrl+S | Save file or export |
| Esc | Close the top layer / finish editing |
| ? | Open the quick reference |

Letter shortcuts do not run inside inputs or modal dialogs. On Mac, use Cmd
instead of Ctrl. The built-in reference works offline even if this guide is
not beside a copied standalone.

## Files and build

Keep `chronos.html`, `scripts/`, `styles/`, `themes/` and `locales/` together.
Eight ordinary scripts load in a fixed order without ES modules or a framework:

| File under `scripts/` | Responsibility |
|---|---|
| `chronos.core.js` | State, model and validation |
| `chronos.storage.js` | localStorage, connected JSON and directory handles |
| `chronos.customization.js` | Locales and visual themes |
| `chronos.board.js` | Board, columns and filters |
| `chronos.month.js` | Month view |
| `chronos.tasks.js` | Cards and task operations |
| `chronos.dialogs.js` | Dialogs and quick reference |
| `chronos.js` | Events and startup |

Six `styles/chronos.*.css` files cover base/header, board, month, dialogs, views
and help. Theme tokens own palette, fonts, radii and effects. `themes/focus.css`
offers neutral light/dark surfaces without decorative shadows, gradients or
blur, preserving semantic and marker colors. Load it like Graphite & Moss and
other optional themes.

Run from the repository root:

```sh
node tools/build-standalone.mjs
```

The dependency-free builder creates `output/chronos-2.0-standalone.html` with
the required styles, eight scripts, canonical theme, canonical locale and MIT
notice. User tasks, backups and optional catalogs are not embedded. Connect
their folders with the same settings buttons. Generated files are ignored and
must not be edited manually; canonical app sources remain in `chronos-2.0/`.

`node tools/build-standalone.mjs --demo` creates `output/site/index.html` from
the same sources with all 23 themes and four locales preloaded. First visit uses
Graphite & Moss, the system light/dark setting and the next seven days starting
today. Eight active examples are spread across the range; Done and Bin each have
one example dated yesterday. Later choices persist in
the separate `chronos-planner-demo-v2` namespace, including recovery, preferences
and IndexedDB. Existing empty or invalid data is never replaced with examples.
Changing language translates the interface, not task text.
Reset needs confirmation and is blocked while a JSON file is connected.
A selected folder can replace a bundled package by semantic identity or filename;
denied access leaves the bundled catalog available.

## Views, filtering and editing

The view switch beside date navigation shows the view it will open: calendar
on Board, columns in Month. Hover does not change card height. Month has seven
days per row, including adjacent-month tasks; each day's list scrolls separately.
Adjacent months are muted; today has a stronger contour and the same header fill
in all views. Add appears in free space under Board tasks, the first free expanded
grid cell, or an available empty Month day. Past dates do not accept new or moved
active tasks. Existing overdue tasks remain editable, completable, removable and
movable forward.

Click a day header to expand its column. Clicking the expanded header returns
to the selected base view. From Month it returns to the expanded day's month,
including after Today, arrows or date-picker navigation. Esc does the same only
when no menu or task editor is open. Board keeps its original range while the
expanded day fits; otherwise that date takes Today's numerical position.

Header time controls run from problems to range settings: overdue tasks, active
tasks before the visible range, day count, range and today's position. The same
controls wrap to two rows on narrow screens. A separate neutral counter before
Done and Bin shows all active tasks.

Markers are standalone words anywhere in a title, such as
`!soon Discuss the tiles @Irene #renovation`. An enabled symbol defines a type;
every value of that type shares one color and chip shape. Chips display the
value, keeping the prefix in the source text. Emoji can be part of a value.
Words have no built-in special meanings.

Type filters follow Search. Each selects one value; a new selection replaces
it, and clicking it again clears it. Tasks may contain several values of a type.
Filters intersect with search and author. Choices come from active tasks,
including Control and overdue days; Done and Bin are excluded. A button shows
the symbol and a selected dot; the full value is in its tooltip and dropdown.
The selected heading beside the reset cross may use ellipsis. Dropdowns open
below their buttons and shift inside the viewport. With wrapped controls they
open below the whole header; other header menus align at the right edge.
Lists scroll and escape toolbar clipping. Empty buttons are disabled. Type-filter
selections are not saved in JSON.

Typing an enabled symbol suggests existing values in cards, task dialogs and
bulk entry. The list sizes to its longest item, wraps within the viewport and
scrolls when long. Arrows select, Enter inserts, Esc closes. With no selected
suggestion, Enter saves the title. New names can be typed freely. Single and bulk
creation inherit selected filters without duplicates.

Disabling a type removes its chips, autocomplete and filter while preserving text
and hue. Re-enabling restores them. The robot marks the last text edit by an
agent, not ownership; any human text edit clears it. Clicking it filters author.
The cross at the end of filters resets search and every active filter.

Search or Ctrl/Cmd+F opens a separate field below its button without moving the
header. Toggle, Escape or outside click closes it while retaining the query and
filtering. The active icon and tooltip show that a query remains.

Done/Bin keep the same dialog size across tabs and empty lists, with internal
scrolling and height up to 640px and at most 88% of the viewport. The solid card
action drawer follows theme shape like buttons and markers. Settings show app
version and standalone source SHA; `+modified` marks changed build inputs.
Source `chronos.html` does not display an invented SHA. Version rules are in the
[root README](../README.md).

The reference button or `?` opens a short offline panel at the right, at most
half the desktop width or available phone width, from header to an 8px bottom
margin. It contains storage/conflict/recovery/retention rules and all shortcuts.
Escape closes it and restores focus.

The task dialog saves title and comment together. Clear affects only the
comment; an empty title cannot be saved. Discarding unsaved edits and moving
a task to Bin are confirmed inside that same dialog. Moving a Done task to Bin
uses the same pattern; Delete means permanent deletion from Bin.

## Default and additional themes

To change the default, copy a complete file from [`themes/`](themes/) over
[`themes/chronos.theme.css`](themes/chronos.theme.css). No HTML or JavaScript
change is required. Each theme declares metadata and tokens, for example:

```css
:root {
  --chronos-theme-id: "notebook";
  --chronos-theme-name: "Notebook";
  --chronos-theme-icon-path: "M4 3H20V21H4ZM8 3V21";
  --task-text-size: 0.8rem;
  --marker-l: 47%;
  --marker-c: 0.13;
}
:root[data-theme="dark"] {
  --marker-l: 80%;
  --marker-c: 0.13;
}
```

This is a fragment, not a complete theme. Icon metadata contains only SVG path
commands for `viewBox="0 0 24 24"`. Chronos validates the commands and nonzero
geometry, then builds SVG through DOM; it does not execute theme HTML/SVG.
A theme and icon therefore live in one CSS file.

`--marker-l` / `--marker-c` control chip lightness/chroma for each scheme.
The hue belongs to a marker type in JSON; background and border are derived.
`--task-text-size` controls title size on Board, filters, Done and Bin. Month
intentionally uses a separate compact size. Each complete theme declares the
token and can tune it for its font metrics.

Settings has language/folder/close controls in its first row and scheme/theme/
theme-folder in its second. Marker types use their separate button left of the
gear. A selected optional theme overrides the root theme. Select the root icon
to see a new default. `chronos.theme.css` is the sole canonical default; its
metadata ID prevents a duplicate catalog entry. Adding/removing a theme needs
only adding/removing its CSS file.

## Default and additional languages

The canonical locale is English (`en-GB`). Russian is
[`locales/russian.locale.js`](locales/russian.locale.js). To change the default,
copy a full locale over [`locales/chronos.locale.js`](locales/chronos.locale.js).
Both default and additional locales use the same format. A structure fragment:

```js
window.CHRONOS_LOCALE_PACK = {
  "chronosLocale": 1,
  "locale": "en-GB",
  "name": "English",
  "shortLabel": "EN",
  "messages": { "help.guide.title": "Quick reference" }
};
```

The object must be strict JSON inside the fixed assignment. Folder files are
read as text and parsed as data, never executed. A selected additional locale
overrides the default. All locales must have the exact same complete semantic
key and interpolation-parameter sets; old numeric-key packs are unsupported.
Start from a full existing locale and translate values. Name, button label,
date locale and complete messages live in each file; no app registry is needed.
The canonical locale is recognized by language code and not duplicated.

## Recovery and compatibility

- Missing/invalid canonical theme or locale produces a neutral error message.
- A bad optional package is skipped without rejecting other files.
- Ordinary tasks use `chronos-planner-v2`. Strict validation rejects old fields
  such as `done` and `originalKey`. Connect a current-format JSON. A bad local
  snapshot is copied to recovery without changing its original data; it is not
  allowed to replace a valid connected file.
- Empty date buckets disappear on ordinary save; required service buckets remain.

With `file:///`, browsers cannot enumerate arbitrary sibling files. Default slots
therefore have fixed names; users grant File System Access API access to optional
folders in supported browsers. There is no fallback file import/export if that
API is unavailable.

Locales currently have 257 keys. The 34 unused legacy-interface/full-help keys
were removed from all four packs; older packs with extra keys are rejected.
Replace shipped locale folders when upgrading, update custom packs against
`chronos.locale.js`, and reload the new standalone so code and dictionaries match.

## Data format

The working JSON contains `__schema__: 1`, enabled symbols `__dimensions__` and
the hue map `__dimensionColors__`. Disabling a type keeps its hue. Tasks contain
ID, title, comment, author flag and lifecycle timestamps. Code generates IDs:
the browser uses UUIDs; the CLI generates deterministic, collision-checked IDs
so dry-run matches apply. Agents omit `id` in `create` and read existing IDs
with `list` for other operations. Numeric and string IDs are accepted unchanged.

`starred`, `urgent`, `inProgress` and `cardStyle` are rejected. Agents edit markers
through `edit`, preserving type settings. Only the current schema is accepted;
older JSON is rejected with an explanation, not automatically migrated. When
the local snapshot is invalid, saving its recovery copy must succeed before
replacement or import can continue.

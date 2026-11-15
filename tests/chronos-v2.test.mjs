import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const app = path.join(repo, "chronos-2.0");
const read = (...parts) => fs.readFileSync(path.join(app, ...parts), "utf8");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const scriptPaths = [
  "scripts/chronos.core.js",
  "scripts/chronos.storage.js",
  "scripts/chronos.customization.js",
  "scripts/chronos.board.js",
  "scripts/chronos.month.js",
  "scripts/chronos.tasks.js",
  "scripts/chronos.dialogs.js",
  "scripts/chronos.js",
];
const stylePaths = [
  "styles/chronos.base.css",
  "styles/chronos.board.css",
  "styles/chronos.month.css",
  "styles/chronos.dialogs.css",
  "styles/chronos.views.css",
  "styles/chronos.help.css",
];
const required = [
  "chronos.html",
  ...scriptPaths,
  ...stylePaths,
  "themes/chronos.theme.css",
  "locales/chronos.locale.js",
  "README.md",
];
for (const name of required)
  assert.ok(fs.existsSync(path.join(app, name)), `missing Chronos 2 file: ${name}`);

const html = read("chronos.html");
const scriptSources = scriptPaths.map((fileName) => read(...fileName.split("/")));
const js = scriptSources.join("\n");
const styleSources = stylePaths.map((fileName) => read(...fileName.split("/")));
const [baseCss, boardCss, monthCss] = styleSources;
const structureCss = styleSources.join("\n");
const defaultThemeCss = read("themes", "chronos.theme.css");
const graphiteMossCss = read("themes", "graphite-moss.css");
const localeSources = [
  "chronos.locale.js",
  "russian.locale.js",
  "czech.locale.js",
  "german.locale.js",
].map((fileName) => read("locales", fileName));
const agentDataScript = fs.readFileSync(
  path.join(repo, ".agents", "skills", "chronos-planning", "scripts", "chronos-data.mjs"),
  "utf8",
);

function declaredSet(source, name) {
  const body = source.match(
    new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`),
  )?.[1];
  assert.ok(body, `missing ${name}`);
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}
function functionDeclaration(source, name) {
  const declaration = source.match(
    new RegExp(`function ${name}\\([\\s\\S]*?^\\}`, "m"),
  )?.[0];
  assert.ok(declaration, `missing function ${name}`);
  return declaration;
}

scriptSources.forEach((source, index) => {
  assert.doesNotThrow(
    () => new Function(source),
    `external Chronos script must parse: ${scriptPaths[index]}`,
  );
});
assert.doesNotThrow(() => new Function(js), "combined Chronos scripts must parse");
for (const name of ["UI_FIELDS", "TASK_FIELDS"]) {
  assert.deepEqual(
    declaredSet(scriptSources[0], name),
    declaredSet(agentDataScript, name),
    `${name} must match between the browser and agent data tool`,
  );
}
const { foldForSearch } = new Function(
  `${scriptSources[3]}\nreturn { foldForSearch };`,
)();

const dateKeyPatternDeclaration = scriptSources[0].match(
  /const DATE_KEY_RE = [^;]+;/,
)?.[0];
assert.ok(dateKeyPatternDeclaration, "missing DATE_KEY_RE");
const pruneEmptyDateBuckets = new Function(`
  ${dateKeyPatternDeclaration}
  ${functionDeclaration(scriptSources[0], "isDateKey")}
  ${functionDeclaration(scriptSources[0], "pruneEmptyDateBuckets")}
  return pruneEmptyDateBuckets;
`)();
const emptyDateFixture = {
  __inbox__: [],
  "2026-08-31": [],
  "2026-09-01": [{ id: 1 }],
  "2026-02-30": [],
};
assert.equal(pruneEmptyDateBuckets(emptyDateFixture), 1);
assert.deepEqual(emptyDateFixture, {
  __inbox__: [],
  "2026-09-01": [{ id: 1 }],
  "2026-02-30": [],
});
assert.match(
  functionDeclaration(scriptSources[1], "serializeState"),
  /pruneEmptyDateBuckets\(state\)[\s\S]*?JSON\.stringify\(state\)/,
  "every ordinary browser save must prune empty calendar dates",
);
assert.match(
  functionDeclaration(scriptSources[1], "hasUncommittedInput"),
  /querySelector\(["']\.task\.dragging["']\)/,
  "background refreshes must not replace an active drag",
);
assert.equal(foldForSearch("Ёлка"), "елка");
assert.equal(foldForSearch("Müller"), "muller");
assert.equal(foldForSearch("café"), "cafe");
assert.notEqual(foldForSearch("мой"), foldForSearch("мои"));
assert.equal(foldForSearch("мой").includes(foldForSearch("мои")), false);
assert.equal(foldForSearch("cafe\u0301"), "cafe");
const functionNames = [
  ...js.matchAll(/^(?:async )?function\s+([a-zA-Z0-9_]+)\s*\(/gm),
].map((match) => match[1]);
assert.equal(
  new Set(functionNames).size,
  functionNames.length,
  "function declarations must be unique across the eight scripts",
);
[
  [0, /function validateIncomingData\(/, /function dateKey\(/, /function normalizeLocalePack\(/],
  [1, /function load\(/, /function writeLinkedSnapshot\(/, /function readStoredDirectory\(/],
  [2, /function parseLocalePack\(/, /function applyVisualTheme\(/],
  [3, /function render\(/, /function activeFilter\(/, /function column\(/],
  [4, /function renderMonth\(/, /function monthDay\(/, /function toggleView\(/],
  [5, /function newTaskPanel\(/, /function taskEl\(/, /function startDrag\(/],
  [6, /function renderBin\(/, /function openDatePopover\(/, /function openHelp\(/],
  [7, /application bootstrap/, /document\.addEventListener\("click"/],
].forEach(([scriptIndex, ...patterns]) => {
  patterns.forEach((pattern) =>
    assert.match(scriptSources[scriptIndex], pattern, `wrong script boundary: ${pattern}`),
  );
});
assert.deepEqual(
  fs.readdirSync(app).filter((name) => /\.(?:css|js)$/i.test(name)),
  [],
  "runtime CSS and JS must not remain in the Chronos 2 root",
);
assert.doesNotMatch(html, /<style(?:\s|>)/i, "HTML must not contain inline CSS");
assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, "HTML must not contain inline JS");
const runtimeStylePositions = stylePaths.map((source) =>
  html.indexOf(`href="${source}"`),
);
assert.ok(runtimeStylePositions.every((position) => position >= 0));
assert.deepEqual(
  runtimeStylePositions,
  [...runtimeStylePositions].sort((a, b) => a - b),
  "application styles must keep their source order",
);
assert.ok(
  runtimeStylePositions.at(-1) < html.indexOf('href="themes/chronos.theme.css"') &&
    html.indexOf('href="themes/chronos.theme.css"') <
      html.indexOf('id="visualThemeStylesheet"'),
  "application styles, root theme and selected theme must keep their order",
);
const runtimeSources = ["locales/chronos.locale.js", ...scriptPaths];
const runtimeSourcePositions = runtimeSources.map((source) =>
  html.indexOf(`src="${source}"`),
);
assert.ok(runtimeSourcePositions.every((position) => position >= 0));
assert.deepEqual(
  runtimeSourcePositions,
  [...runtimeSourcePositions].sort((a, b) => a - b),
  "the root locale and eight application scripts must keep their load order",
);
assert.match(html, /<title>Chronos<\/title>/);
assert.equal(
  html.match(/\bid="themeToggle"/g)?.length,
  1,
  "the color scheme toggle must have one owner",
);
assert.equal(html.match(/\bid="settingsToggle"/g)?.length, 1);
assert.doesNotMatch(html, /\bid="(?:locale|visualTheme)Toggle"/);
assert.match(
  html,
  /id="settingsPopover"[^>]*>[\s\S]*?id="localePopoverActions"[\s\S]*?settings-popover-separator[\s\S]*?id="visualThemePopoverActions"[\s\S]*?id="themeToggle"[\s\S]*?id="settingsVersion"[\s\S]*?<\/div>\s*<\/div>\s*<button[^>]*data-action="help"/,
  "language and appearance must share one flat settings popover",
);
assert.match(
  structureCss,
  /\.visual-theme-popover-divider\s*\{[^}]*width:\s*1px;[^}]*height:\s*18px;/s,
  "appearance groups must use a compact vertical divider",
);
assert.match(html, /class="brand-version" id="brandVersion"/);
assert.match(html, /class="settings-version" id="settingsVersion"/);
assert.doesNotMatch(html, /\bid="helpVersion"/);
assert.match(js, /const CHRONOS_VERSION = "2\.2\.29"/);
assert.match(
  js,
  /brandVersion"\)\.textContent = CHRONOS_VERSION\.split\("\."\)\[0\]/,
);
assert.match(
  js,
  /settingsVersion"\)\.textContent = `Chronos \$\{CHRONOS_VERSION\}`/,
);
assert.match(js, /const STORAGE_KEY = globalThis\.CHRONOS_DEMO === true\s*\? "chronos-planner-demo-v2"\s*: "chronos-planner-v2"/);
assert.doesNotMatch(scriptSources[0], /"filterInProgress"/);
assert.doesNotMatch(scriptSources[0], /"inProgress"/);
assert.doesNotMatch(js, /chronos-locales-demo-v1/);
assert.doesNotMatch(js, /\bBUILTIN_LOCALE\b/);
assert.doesNotMatch(js, /endsWith\("\.json"\)/);
assert.doesNotMatch(js, /\beval\s*\(/);
assert.doesNotMatch(html, /[А-Яа-яЁё]/, "core HTML must not contain Russian UI text");
assert.doesNotMatch(js, /[А-Яа-яЁё]/, "core JS must not contain Russian UI text");
assert.match(js, /function normalizeLocalePack\(/);
assert.match(js, /function messagePlaceholders\(/);
assert.match(js, /function parseLocalePack\(/);
assert.doesNotMatch(
  `${html}\n${js}`,
  /\b(?:attr|static|dynamic|template|fragment)\.\d+\b/,
  "numeric locale keys must not remain",
);
assert.match(js, /endsWith\("\.locale\.js"\)/);
assert.match(js, /function defaultVisualTheme\(/);
assert.match(js, /function addDimension\(/);
assert.doesNotMatch(`${html}\n${js}`, /ui\.indicators_stripe/);
assert.doesNotMatch(js, /tr\(\s*["']ui\.failed["']/);

const messagePlaceholdersSource = scriptSources[0].match(
  /function messagePlaceholders\([\s\S]*?\n\}/,
)?.[0];
const normalizeLocalePackSource = scriptSources[0].match(
  /function normalizeLocalePack\([\s\S]*?\n\}/,
)?.[0];
assert.ok(messagePlaceholdersSource && normalizeLocalePackSource);
const normalizeLocalePackHarness = new Function(`
  ${messagePlaceholdersSource}
  ${normalizeLocalePackSource}
  return normalizeLocalePack;
`)();
const localeTemplate = {
  chronosLocale: 1,
  locale: "en",
  name: "Template",
  shortLabel: "TT",
  messages: { "ui.test": "Hello {name}" },
};
assert.ok(
  normalizeLocalePackHarness(
    { ...localeTemplate, messages: { "ui.test": "Hi {name}" } },
    "valid.locale.js",
    localeTemplate.messages,
  ),
);
assert.equal(
  normalizeLocalePackHarness(
    { ...localeTemplate, messages: { "ui.test": "Hi {wrong}" } },
    "wrong.locale.js",
    localeTemplate.messages,
  ),
  null,
);
assert.equal(
  normalizeLocalePackHarness(
    { ...localeTemplate, messages: { "ui.test": "Hi" } },
    "missing.locale.js",
    localeTemplate.messages,
  ),
  null,
);
assert.match(
  scriptSources[5],
  /flashCopyButton\(button, tr\("ui\.could_not_copy", ""\), true\)/,
);
assert.match(
  scriptSources[6],
  /const t = findTask\(key, id\);\s*if \(!t\) return;\s*taskEditorTarget = \{ key, id \};/,
);
const updateTaskEditorStatusSource = scriptSources[6].match(
  /function updateTaskEditorStatus\([^)]*\)\s*\{[\s\S]*?\n\}/,
)?.[0];
assert.ok(updateTaskEditorStatusSource);
const editorStatus = { classList: { toggle() {} }, textContent: "" };
const editorModal = { querySelector: () => ({}) };
const updateTaskEditorStatusHarness = new Function(
  "document",
  "taskCommentValue",
  "taskTitleValue",
  "taskEditorIsDirty",
  "tr",
  "commentStats",
  `${updateTaskEditorStatusSource}; return updateTaskEditorStatus;`,
)(
  { getElementById: (id) => (id === "taskEditorModal" ? editorModal : editorStatus) },
  () => "Comment",
  () => "Task",
  () => true,
  (key) => key,
  () => "Stats",
);
updateTaskEditorStatusHarness({ type: "input" });
assert.equal(editorStatus.textContent, "ui.unsaved_changes");
assert.match(
  functionDeclaration(scriptSources[5], "taskStatusFilterMark"),
  /onpointerdown[\s\S]*?preventDefault\(\)[\s\S]*?stopPropagation\(\)[\s\S]*?onclick[\s\S]*?activateFilter\(\)/,
  "status marks must filter without opening or dragging their task",
);
assert.match(
  functionDeclaration(scriptSources[5], "lastEditorMark"),
  /filterLastEditor === "agent" \? "all" : "agent"/,
  "the robot mark must toggle the existing agent filter",
);
assert.doesNotMatch(
  functionDeclaration(scriptSources[4], "monthTask"),
  /insertAdjacentHTML\("beforeend", icons\.robot\)/,
);
assert.match(boardCss, /\.task-status-mark\s*\{[^}]*cursor:\s*pointer/s);
assert.doesNotMatch(
  boardCss,
  /\.task\.in-progress::before/,
  "work-in-progress must not become a third side-marker state",
);
assert.doesNotMatch(
  `${html}\n${scriptSources[5]}`,
  /filter-progress|["']in-progress["']/,
  "work-in-progress must use its visible mark without unused CSS hooks",
);
assert.match(scriptSources[7], /function checkDayBoundary\(/);
const checkDayBoundarySource = scriptSources[7].match(
  /function checkDayBoundary\(\) \{[\s\S]*?\n\}/,
)?.[0];
assert.ok(checkDayBoundarySource, "day-boundary function must be extractable");
const dayBoundaryHarness = new Function(`
  let mockedToday = "2026-08-09";
  let renderedTodayKey = "2026-08-08";
  let dayOffset = 10;
  let renderCount = 0;
  const dateKey = (value) => value;
  const todayStart = () => mockedToday;
  const parseDateKey = (key) => new Date(key + "T00:00:00Z");
  const hasUncommittedInput = () => false;
  const render = () => { renderCount += 1; };
  ${checkDayBoundarySource}
  return {
    run: checkDayBoundary,
    result: () => ({ dayOffset, renderedTodayKey, renderCount }),
  };
`)();
dayBoundaryHarness.run();
assert.deepEqual(dayBoundaryHarness.result(), {
  dayOffset: 9,
  renderedTodayKey: "2026-08-09",
  renderCount: 1,
});
assert.match(
  scriptSources[7],
  /if \(hasUncommittedInput\(\)\) return;\s*if \(cleanupExpired\(\)\) render\(\);/,
);
assert.match(js, /--chronos-theme-id/);
assert.match(js, /--chronos-theme-name/);
assert.match(js, /--chronos-theme-icon-path/);
assert.match(js, /function normalizeThemeIconPath\(/);
assert.match(js, /function setVisualThemeIcon\(/);
assert.match(js, /getTotalLength\(\) > 0/);
assert.doesNotMatch(js, /icons\[theme\.icon\]|icons\[activeTheme\.icon\]/);

const normalizeThemeMetadataSource = scriptSources[2].match(
  /function normalizeThemeMetadata\([\s\S]*?\n\}/,
)?.[0];
const normalizeThemeIconPathSource = scriptSources[2].match(
  /function normalizeThemeIconPath\([\s\S]*?\n\}/,
)?.[0];
assert.ok(normalizeThemeMetadataSource && normalizeThemeIconPathSource);
const normalizeThemeIconPathHarness = new Function(`
  const document = {
    createElementNS() {
      return {
        value: "",
        setAttribute(_name, value) { this.value = value; },
        getTotalLength() {
          if (this.value === "M0,0L1,1") return 1;
          if (this.value === "M0,0L") throw new Error("invalid path");
          return 0;
        },
      };
    },
  };
  ${normalizeThemeMetadataSource}
  ${normalizeThemeIconPathSource}
  return normalizeThemeIconPath;
`)();
assert.equal(normalizeThemeIconPathHarness('"M0,0L1,1"'), "M0,0L1,1");
assert.equal(normalizeThemeIconPathHarness('"M0,0L"'), "");
assert.equal(normalizeThemeIconPathHarness('"M"'), "");
assert.match(js, /parsed\.themeId !== rootTheme\.themeId/);
assert.match(js, /parsed\.locale\.toLowerCase\(\) !== DEFAULT_LOCALE_PACK\.locale\.toLowerCase\(\)/);
assert.match(html, /id="localeBootError"/);
assert.match(html, /id="themeBootError"/);

assert.doesNotMatch(structureCss, /--chronos-theme-(?:id|name|icon-path)\s*:/);
assert.doesNotMatch(structureCss, /--body-bg\s*:/);
// The shared action policy may select the theme's red; actual dark palettes stay in theme files.
const derivedDarkActionRule = /:root\[data-theme="dark"\]\s*\{\s*--action-danger:\s*var\(--red\);\s*\}/g;
assert.equal([...structureCss.matchAll(derivedDarkActionRule)].length, 1);
assert.doesNotMatch(structureCss.replace(derivedDarkActionRule, ""), /:root\[data-theme="dark"\]/);
assert.doesNotMatch(
  structureCss,
  /#[0-9a-f]{3,8}\b|\brgba?\(|\boklch\(\s*[0-9]/i,
  "base CSS must not contain a hidden palette",
);
assert.match(structureCss, /font-family:\s*var\(--ui-font-family\)/);
assert.match(structureCss, /border-radius:\s*var\(--radius-/);
assert.match(structureCss, /backdrop-filter:\s*var\(--backdrop-/);
assert.match(
  baseCss,
  /\.app-header \.file-save\s*{\s*color:\s*var\(--muted\);\s*}/,
  "header actions must remain monochrome at rest",
);

assert.match(
  html,
  /class="week-nav"[\s\S]*?id="viewToggle"[\s\S]*?data-action="toggle-view"[\s\S]*?<\/div>/,
  "the Board and Month switch must stay with date navigation",
);
const viewToggleButton =
  html.match(/<button[^>]*id="viewToggle"[^>]*>/)?.[0] || "";
assert.doesNotMatch(
  viewToggleButton,
  /aria-pressed/,
  "viewToggle is a destination action, not a pressed-state toggle",
);
assert.match(
  html,
  /class="header-center"[\s\S]*?id="overdueAction"[\s\S]*?id="leftOverflowCount"[\s\S]*?id="dayCountKind"[\s\S]*?class="week-nav"[\s\S]*?id="todayPositionControl"/,
  "time controls must run from overdue work to earlier tasks, days, range and today",
);
assert.doesNotMatch(
  html.match(/<div class="header-actions">([\s\S]*?)<div class="settings-control">/)?.[1] || "",
  /id="overdueAction"/,
  "overdue work must not remain among lifecycle and file actions",
);
assert.match(
  structureCss,
  /grid-template-areas:\s*"week week week week week"\s*"overdue overflow \. days today"/,
  "the mobile header must keep one responsive owner for every time control",
);
assert.doesNotMatch(
  structureCss,
  /\.header-center\s*>\s*\.range-overflow-count\s*\{[^}]*display:\s*none/s,
  "the earlier-task count must remain available in the mobile time group",
);
assert.match(
  baseCss,
  /\.header-total,\s*\.range-overflow-count\s*\{[^}]*min-width:\s*30px;[^}]*height:\s*30px;/s,
  "the interactive earlier-task count must match the 30px header-total geometry",
);
assert.match(
  baseCss,
  /\.range-overflow-count\.show\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
  "the earlier-task count must center its value like the active total",
);
assert.match(
  baseCss,
  /\.range-overflow-count:focus-visible,[\s\S]*?outline:\s*2px solid var\(--accent-focus\)/,
  "the interactive earlier-task count must retain visible keyboard focus",
);
assert.doesNotMatch(html, /id="actionsToggle"|data-action="toggle-actions"/);
assert.doesNotMatch(js, /actionsAlwaysVisible|actions-hidden|activeTaskCount/);
assert.match(
  scriptSources[5],
  /el\.oncontextmenu = \(event\) =>\s*showMenu\(event, key, t\.id, menuButton\)/,
  "right-click must open the same task menu as the visible trigger",
);
assert.doesNotMatch(js, /window\.confirm\s*\(/);
assert.match(html, /id="confirmationModal"[\s\S]*?id="confirmationCancel"[\s\S]*?id="confirmationConfirm"/);
assert.match(
  scriptSources[1],
  /await requestConfirmation\(\{[\s\S]*?file\.conflict_title[\s\S]*?dismissible:\s*false/,
  "linked-file conflicts must require an explicit choice",
);
assert.doesNotMatch(
  scriptSources[6],
  /requestConfirmation\(\{[\s\S]*?task_editor\.discard_confirmation/,
  "task-editor confirmation must remain inside the task editor",
);
assert.match(
  scriptSources[6],
  /function closeTaskEditor\([\s\S]*?setTaskEditorConfirmation\("discard"\)/,
  "closing a dirty task editor must reveal its inline confirmation",
);
assert.match(html, /id="taskTitleInput"[\s\S]*?id="taskCommentText"/);
assert.match(html, /class="task-editor-discard-confirm"[\s\S]*?data-action="confirm-task-editor-discard"/);
assert.match(html, /id="taskEditorTrashAction"[\s\S]*?data-action="confirm-task-editor-trash"/);
assert.doesNotMatch(
  html + js + structureCss,
  /commentModal|commentTarget|commentInitialValue|openComment|saveComment|closeComment|comment-foot-default|comment-discard-confirm/,
  "the retired comment-only modal must not leave a second owner",
);
assert.match(
  scriptSources[5],
  /function requestMoveOverdue\(\)[\s\S]*?requestConfirmation\(\{[\s\S]*?ui\.move_overdue_tasks/,
  "overdue moves must reuse the shared binary confirmation",
);
assert.doesNotMatch(
  html + js + structureCss,
  /overdueModal|confirm-move-overdue|cancel-move-overdue|closeOverdueModal|overdue-modal/,
  "the retired dedicated overdue modal must not return",
);
assert.doesNotMatch(structureCss, /actions-hidden/);
assert.match(
  html,
  /id="activeCount"[\s\S]*?data-action="archive"[\s\S]*?data-action="trash"/,
  "the active total must precede Done and Bin",
);
assert.doesNotMatch(
  localeSources.join("\n"),
  /ui\.card_icons_(?:always|on_hover)|ui\.toggle_card_icons/,
);
assert.match(
  scriptSources[1],
  /async function openDataFile\(\)\s*\{\s*if \(focusPendingTaskDraft\(\)\) return;/,
  "opening another JSON must preserve a pending task draft",
);
assert.match(
  scriptSources[6],
  /const navigation = datePicker\.kind === "navigate";[\s\S]*?anchorRect\.bottom[\s\S]*?headerBottom/,
  "the navigation calendar must open below the header trigger",
);
assert.match(
  scriptSources[1],
  /function clearLocalTasks\(\)\s*\{\s*if \(focusPendingTaskDraft\(\)\) return false;/,
  "clearing local data must preserve a pending task draft",
);
assert.match(
  scriptSources[1],
  /async function clearAfterExport\(\)\s*\{\s*if \(focusPendingTaskDraft\(\)\) return;/,
  "save-and-clear must preserve a pending task draft",
);
assert.match(
  scriptSources[2],
  /async function toggleSettingsPopover\(\)[\s\S]*?if \(settingsPopoverOpen\(\)\)[\s\S]*?if \(focusPendingTaskDraft\(\)\) return;[\s\S]*?showHeaderPopover\([\s\S]*?syncSettingsToggle\(\);[\s\S]*?await refreshLocales\(\);[\s\S]*?await refreshVisualThemes\(\);/,
  "Settings must guard drafts and open before refreshing optional folders",
);
assert.match(
  html,
  /id="helpLayer"[\s\S]*?id="helpTitle"[\s\S]*?class="help-article"[\s\S]*?class="shortcut-list"/,
  "help must remain an offline reference with one scrollable article",
);
assert.match(
  html,
  /data-action="help"[^>]*data-i18n-title="help\.guide\.title"/,
  "the Help trigger must describe the full guide rather than one section",
);
const helpSectionIds = new Set(
  [...html.matchAll(/<section class="help-section" id="([^"]+)"/g)].map(
    (match) => match[1],
  ),
);
assert.deepEqual([...helpSectionIds], ['help-data', 'help-lifecycle', 'help-troubleshooting', 'help-shortcuts']);
assert.doesNotMatch(html, /class="help-toc"|id="helpContentsSelect"/, 'compact reference has no contents navigation');
assert.equal(
  [...html.matchAll(/class="shortcut-key"/g)].length,
  14,
  "quick reference must list global and title-editor shortcut groups",
);
assert.doesNotMatch(
  html,
  /data-help-(?:tab|panel|icon)|helpPanel-|helpTab-/,
  "obsolete help navigation and interface replicas must not return",
);
assert.match(scriptSources[4], /function viewToggleState\(\)/);
assert.doesNotMatch(
  scriptSources[0] + scriptSources[2] + scriptSources[6] + scriptSources[7],
  /HELP_SAMPLE_TASKS|syncHelpMini|setHelpTab|localizedHelpSampleTasks|helpTaskClone/,
  "help-only demo machinery must not return",
);
assert.match(scriptSources[0], /"view",[\s\S]*?view:\s*"board"/);
assert.match(scriptSources[0], /view:\s*\["board", "month"\]/);
assert.match(scriptSources[0], /Chronos data must contain \$\{UI\}/);
assert.match(scriptSources[0], /Chronos data is missing/);
assert.match(scriptSources[0], /\$\{UI\} is missing \$\{missingField\}/);
assert.doesNotMatch(scriptSources[0], /function normalize\(/);
assert.match(
  scriptSources[3],
  /if \(ui\(\)\.view === "month"\) \{\s*renderMonth\(board, filter\)/,
);
assert.match(
  scriptSources[4],
  /header\(key, "day", date, tasks\)/,
);
assert.match(scriptSources[4], /openExpandedColumn\(key\)/);
assert.match(
  scriptSources[3],
  /function bindColumnTitleToggle\([\s\S]*?toggleExpandedColumn\(key\)/,
  "column headings must share one expand and return action",
);
assert.match(
  boardCss,
  /\.col-title\[role="button"\][\s\S]*?cursor:\s*pointer/,
  "interactive column headings must remain visibly interactive",
);
assert.doesNotMatch(js, /^\s*(?:expandColumn|collapseColumn):/m);
assert.doesNotMatch(html, /data-help-icon="(?:expandColumn|collapseColumn)"/);
assert.match(
  scriptSources[7],
  /const taskText = activeEditor[\s\S]*?taskText\.blur\(\);[\s\S]*?const newTaskInput = activeEditor[\s\S]*?\.btn-ghost/,
  "Esc must leave active task editors before it leaves an expanded column",
);
assert.match(
  scriptSources[7],
  /if \(searchControlOpen\(\)\)[\s\S]*?closeSearch\(true\)[\s\S]*?return;/,
  "Esc must close search before leaving an expanded column",
);
assert.match(
  scriptSources[0],
  /function isPastTaskDate\([\s\S]*?function canAddTaskTo\([\s\S]*?function canMoveTaskTo\(/,
  "task placement rules must share one past-date guard",
);
assert.match(
  scriptSources[3],
  /function quickTaskAddControl\([\s\S]*?icons\.plus[\s\S]*?openNewTask\(key\)/,
  "board and month sections must share one quick-add control",
);
assert.match(scriptSources[3], /canAddTaskTo\(context\.key\)/);
assert.match(scriptSources[5], /function openNewTask\([\s\S]*?!canAddTaskTo\(key\)/);
assert.match(scriptSources[5], /function moveTask\([\s\S]*?!canMoveTaskTo\(from, to\)/);
assert.match(
  scriptSources[5],
  /from === to && beforeId === undefined[\s\S]*?return false/,
  "a menu move to the current section must be a no-op",
);
assert.match(
  scriptSources[5],
  /function reorderTask\([\s\S]*?if \(filterActive\(\)\) return false/,
  "filters must protect the hidden task order",
);
assert.match(
  scriptSources[5],
  /function startDrag\([\s\S]*?if \(filterActive\(\)\) return;/,
  "filters must disable ambiguous drag ordering",
);
assert.match(
  scriptSources[6],
  /datePicker\.kind === "move"[\s\S]*?!canAddTaskTo\(dateKey\(d\)\)[\s\S]*?b\.disabled = true/,
  "past dates must be disabled in the move calendar",
);
assert.doesNotMatch(js, /month\.no_tasks/);
assert.doesNotMatch(scriptSources[4], /ui\.no_results/);
assert.match(monthCss, /grid-template-columns:\s*repeat\(7,/);
assert.match(scriptSources[3], /"column column-surface "/);
assert.match(scriptSources[4], /`month-day column-surface /);
assert.match(
  scriptSources[3],
  /if \(isToday\) el\.setAttribute\("aria-current", "date"\)/,
);
assert.match(
  boardCss,
  /\.column-surface:not\(\.collapsed\) > \.col-header/,
);
assert.match(boardCss, /\.column\s*\{[\s\S]*?border-radius:\s*var\(--radius-xl\)/);
assert.match(monthCss, /\.month-day\s*\{[\s\S]*?border-radius:\s*var\(--radius-xl\)/);
assert.match(graphiteMossCss, /--radius-xl:\s*3px/);
assert.doesNotMatch(
  graphiteMossCss,
  /\.column[^\{]*\{[^}]*border-radius:/,
  "Graphite Moss geometry must flow through shared radius tokens",
);
assert.match(
  monthCss,
  /grid-template-rows:\s*repeat\(var\(--month-week-count\)/,
);
assert.match(monthCss, /\.month-day\.adjacent-month:not\(\.today\)[\s\S]*?opacity:/);
assert.match(
  monthCss,
  /\.month-day\.adjacent-month:not\(\.today\) > \.col-header\s*\{[\s\S]*?opacity:/,
  "adjacent-month tasks must keep full text contrast",
);
assert.doesNotMatch(
  monthCss,
  /\.month-day\.today \.day-num/,
  "today must not gain a month-only number treatment",
);
assert.match(
  scriptSources[3],
  /if \(canAddTaskTo\(key\)\) list\.append\(quickTaskAddControl\(key\)\)/,
);
assert.match(boardCss, /\.quick-task-add:hover/);
assert.match(
  styleSources[4],
  /\.expanded-column \.quick-task-add\s*\{[\s\S]*?min-height:\s*72px[\s\S]*?align-items:\s*center/,
);
assert.match(scriptSources[4], /quickTaskAddControl\(key, "month-empty-add"\)/);
assert.match(monthCss, /\.month-task-list\.is-empty:hover > \.quick-task-add/);
assert.match(scriptSources[4], /const listItem = div\("month-task-item"\)/);
assert.doesNotMatch(
  scriptSources[4],
  /button\.setAttribute\("role", "listitem"\)/,
  "month task buttons must keep their native button semantics",
);
assert.match(
  scriptSources[3],
  /ui\(\)\.view === "month" && isDateKey\(selectedKey\)[\s\S]*?selectedDate\.setDate\(selectedDate\.getDate\(\) \+ delta\)/,
  "expanded month navigation must move through adjacent dates",
);
assert.match(
  scriptSources[3],
  /ui\(\)\.view === "month" && \[INBOX, CONTROL\]\.includes\(selectedKey\)[\s\S]*?return;/,
  "month service columns must not enter a hidden Board range",
);
const goTodaySource = scriptSources[3].slice(
  scriptSources[3].indexOf("function goToday("),
  scriptSources[3].indexOf("function stepVisibleDay("),
);
assert.match(goTodaySource, /expandedViewActive\(\)[\s\S]*?render\(\)/);
assert.doesNotMatch(
  goTodaySource,
  /commit\(\)/,
  "view-only Today navigation must not write the task file",
);
const stepVisibleDaySource = scriptSources[3].slice(
  scriptSources[3].indexOf("function stepVisibleDay("),
  scriptSources[3].indexOf("function openShortcutTask("),
);
assert.doesNotMatch(
  stepVisibleDaySource,
  /commit\(\)/,
  "view-only arrow navigation must not write the task file",
);
const jumpToLeftOverflowSource = scriptSources[3].slice(
  scriptSources[3].indexOf("function jumpToLeftOverflow("),
  scriptSources[3].indexOf("function column("),
);
assert.doesNotMatch(
  jumpToLeftOverflowSource,
  /expandedViewActive\(\)[\s\S]*?commit\(\)/,
  "view-only overflow navigation must not write the task file",
);
const chooseDateSource = scriptSources[6].slice(
  scriptSources[6].indexOf("function chooseDate("),
  scriptSources[6].indexOf("function hideDatePopover("),
);
assert.match(chooseDateSource, /expandedViewActive\(\)[\s\S]*?render\(\)/);
assert.doesNotMatch(
  chooseDateSource,
  /commit\(\)/,
  "view-only calendar navigation must not write the task file",
);
assert.match(
  scriptSources[1],
  /function pendingTaskDraftInput\([\s\S]*?function focusPendingTaskDraft\(/,
  "bulk drafts must share one rerender guard",
);
assert.match(scriptSources[6], /hasUnsavedTaskInput\(\)/);
assert.match(
  scriptSources[3],
  /function openSearch\([\s\S]*?closeSettingsPopover\(\)/,
);
assert.match(
  scriptSources[3],
  /function clearAllFilters\([\s\S]*?persistentFilterActive[\s\S]*?else render\(\)/,
  "clearing runtime-only filters must not write the task file",
);
const clearAllFiltersHarness = new Function(`
  let searchQuery;
  let taskMarkerFilters;
  let filterColumnWidth;
  let currentUi;
  let commits;
  let renders;
  function ui() { return currentUi; }
  function focusPendingTaskDraft() { return false; }
  function commit() { commits += 1; }
  function render() { renders += 1; }
  ${functionDeclaration(scriptSources[3], "clearAllFilters")}
  return (input) => {
    searchQuery = input.searchQuery;
    taskMarkerFilters = { ...input.taskMarkerFilters };
    filterColumnWidth = 238;
    currentUi = { ...input.ui };
    commits = 0;
    renders = 0;
    clearAllFilters();
    return {
      searchQuery,
      taskMarkerFilters,
      filterColumnWidth,
      ui: currentUi,
      commits,
      renders,
    };
  };
`)();
assert.deepEqual(
  clearAllFiltersHarness({
    searchQuery: "котёл",
    taskMarkerFilters: { "#": "#стройка", "@": "@алексей" },
    ui: {
      filterLastEditor: "agent",
    },
  }),
  {
    searchQuery: "",
    taskMarkerFilters: {},
    filterColumnWidth: null,
    ui: {
      filterLastEditor: "all",
    },
    commits: 1,
    renders: 0,
  },
  "clear-all must reset search, markers and every persistent task filter",
);
assert.equal(
  clearAllFiltersHarness({
    searchQuery: "котёл",
    taskMarkerFilters: { "#": "#стройка" },
    ui: {
      filterLastEditor: "all",
    },
  }).renders,
  1,
  "clearing only runtime filters must render without committing",
);
assert.match(
  html,
  /class="editor-filter-control"[\s\S]*?id="clearFiltersButton"[\s\S]*?data-action="clear-filters"/,
  "the clear-all action must stay last in the stable filter group",
);
assert.match(
  functionDeclaration(scriptSources[3], "syncTaskFilters"),
  /clearFiltersButton"\)\.disabled = !filterActive\(\)/,
  "the clear-all action must be disabled when no filter is active",
);
assert.match(scriptSources[7], /case "clear-filters":[\s\S]*?clearAllFilters\(\)/);
assert.doesNotMatch(html + js + baseCss, /clear-search|clearSearch\(|search-clear|has-query/);
assert.match(
  functionDeclaration(scriptSources[3], "lockFilterColumnWidth"),
  /\.board:not\(\.expanded-board-host\) \.column:not\(\.collapsed\)/,
  "filters opened from an expanded column must retain normal board width",
);
assert.match(
  scriptSources[3],
  /function closeExpandedColumn\([\s\S]*?ui\(\)\.view === "month" && isDateKey\(closingKey\)[\s\S]*?setMonthCursor\(keyDate\(closingKey\)\)/,
  "an expanded day must collapse into the month that contains it",
);
assert.doesNotMatch(
  scriptSources[3],
  /!saved && ui\(\)\.view === "month"/,
  "the original month must not override navigation inside an expanded day",
);
const closeExpandedSource = scriptSources[3].slice(
  scriptSources[3].indexOf("function closeExpandedColumn("),
  scriptSources[3].indexOf("function toggleExpandedColumn("),
);
const closeExpandedHarness = new Function(`
  let monthCursor = new Date(2026, 11, 1);
  let expandedReturnState = { view: "month", dayOffset: 0 };
  let dayOffset = 0;
  const model = { view: "month", expandedKey: "2026-08-13" };
  const ui = () => model;
  const expandedViewActive = () => Boolean(model.expandedKey);
  const isDateKey = (value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value);
  const keyDate = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const setMonthCursor = (date) => {
    monthCursor = new Date(date.getFullYear(), date.getMonth(), 1);
  };
  const save = () => {};
  const render = () => {};
  const requestAnimationFrame = () => {};
  ${closeExpandedSource}
  closeExpandedColumn();
  return { month: monthCursor.getMonth(), expandedKey: model.expandedKey };
`)();
assert.deepEqual(
  closeExpandedHarness,
  { month: 7, expandedKey: null },
  "Today inside an expanded foreign month must collapse into the current month",
);
const closeBoardExpandedHarness = new Function(`
  return (expandedKey) => {
    let expandedReturnState = { view: "board", dayOffset: 0 };
    let dayOffset = 0;
    const model = {
      view: "board",
      expandedKey,
      dayCount: 5,
      todayColumnIndex: 2,
    };
    const ui = () => model;
    const expandedViewActive = () => Boolean(model.expandedKey);
    const isDateKey = (value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value);
    const keyDate = (value) => {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(year, month - 1, day);
    };
    const dateKey = (date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const todayStart = () => new Date(2026, 7, 10);
    const addDays = (offset) => {
      const date = todayStart();
      date.setDate(date.getDate() + offset);
      return date;
    };
    const preferredTodayIndex = () => model.todayColumnIndex - 1;
    const focusDate = (date) => {
      dayOffset = Math.round((date - todayStart()) / 86400000) - preferredTodayIndex();
    };
    const viewDates = () => Array.from(
      { length: model.dayCount },
      (_, index) => addDays(dayOffset + index),
    );
    const save = () => {};
    const render = () => {};
    const requestAnimationFrame = () => {};
    ${closeExpandedSource}
    closeExpandedColumn();
    return dayOffset;
  };
`)();
assert.equal(
  closeBoardExpandedHarness("2026-08-12"),
  0,
  "a still-visible expanded day must preserve the original Board range",
);
assert.equal(
  closeBoardExpandedHarness("2026-08-25"),
  14,
  "an expanded day outside the original range must take the second Today slot",
);
assert.match(
  styleSources[4],
  /@media \(max-width: 640px\)[\s\S]*?\.header-actions\s*\{[\s\S]*?overflow-x:\s*auto/,
  "mobile header actions must remain reachable",
);
const monthHarness = new Function(`
  let monthCursor = null;
  const todayStart = () => new Date(2026, 7, 12);
  ${scriptSources[4]}
  return { setMonthCursor, monthDates };
`)();
monthHarness.setMonthCursor(new Date(2026, 7, 1));
const augustDates = monthHarness.monthDates();
assert.equal(augustDates.length, 42);
assert.deepEqual(
  [augustDates[0], augustDates.at(-1)].map((date) =>
    [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-"),
  ),
  ["2026-7-27", "2026-9-6"],
);

function parseLocaleSource(source, fileName) {
  const match = source.match(
    /^\s*(?:window\.)?CHRONOS_LOCALE_PACK\s*=\s*([\s\S]*?)\s*;?\s*$/,
  );
  assert.ok(match, `invalid locale wrapper: ${fileName}`);
  const pack = JSON.parse(match[1]);
  assert.equal(pack.chronosLocale, 1, `invalid locale version: ${fileName}`);
  assert.equal(typeof pack.locale, "string");
  assert.equal(typeof pack.name, "string");
  assert.match(pack.shortLabel, /^[A-Z]{2,4}$/);
  assert.equal(typeof pack.messages, "object");
  return pack;
}

const rootLocale = parseLocaleSource(
  read("locales", "chronos.locale.js"),
  "chronos.locale.js",
);
const localeDirectory = path.join(app, "locales");
const localeFiles = fs
  .readdirSync(localeDirectory)
  .filter((name) => name.endsWith(".locale.js"));
assert.ok(localeFiles.includes("chronos.locale.js"));
assert.equal(rootLocale.locale, "en-GB");
assert.ok(localeFiles.includes("russian.locale.js"));
assert.ok(!localeFiles.includes("english.locale.js"));
const catalogLocaleFiles = localeFiles.filter((name) => name !== "chronos.locale.js");
for (const fileName of catalogLocaleFiles) {
  assert.doesNotMatch(
    `${html}\n${js}`,
    new RegExp(escapeRegExp(fileName), "i"),
    `locale must not require an application registry entry: ${fileName}`,
  );
}

const staticKeys = new Set([
  ...html.matchAll(/<!--i18n:([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)-->/g),
  ...html.matchAll(/data-i18n-(?:title|aria-label|placeholder|value)="([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)"/g),
].map((match) => match[1]));
const runtimeKeys = new Set(
  [...js.matchAll(/\btr(?:Html)?\(\s*"([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)"/g)].map(
    (match) => match[1],
  ),
);
// Fixture for the previous locale contract; none of these keys has a UI consumer.
const obsoleteLocaleKeys = [
  "ui.delete",
  "dimensions.remove",
  "dimensions.help",
  "help.data.agent",
  "help.data.management",
  "help.data.status",
  "help.filters.combine",
  "help.filters.drag",
  "help.filters.shortcuts",
  "help.filters.title",
  "help.guide.introduction",
  "help.guide.nav_label",
  "help.lifecycle.destinations",
  "help.quick_start.capture",
  "help.quick_start.clarify",
  "help.quick_start.finish",
  "help.quick_start.introduction",
  "help.quick_start.plan",
  "help.quick_start.title",
  "help.settings.appearance",
  "help.settings.extensions",
  "help.settings.title",
  "help.task_card.drag",
  "help.task_card.editor",
  "help.task_card.markers",
  "help.task_card.signals",
  "help.task_card.title",
  "help.troubleshooting.extension",
  "help.troubleshooting.permission",
  "help.views.board_month",
  "help.views.creation",
  "help.views.expanded",
  "help.views.range",
  "help.views.title"
];
const expectedLocaleKeys = new Set([...staticKeys, ...runtimeKeys]);
assert.ok(expectedLocaleKeys.size > 0);
assert.deepEqual(new Set(Object.keys(rootLocale.messages)), expectedLocaleKeys);
assert.ok(normalizeLocalePackHarness(rootLocale, "current.locale.js", rootLocale.messages));
const previousLocale = {
  ...rootLocale,
  messages: {
    ...rootLocale.messages,
    ...Object.fromEntries(obsoleteLocaleKeys.map((key) => [key, "Retired message"])),
  },
};
assert.ok(normalizeLocalePackHarness(previousLocale, "previous.locale.js", previousLocale.messages));
assert.equal(normalizeLocalePackHarness(previousLocale, "previous.locale.js", rootLocale.messages), null,
  "the strict current contract must reject a previous pack with retired keys");
for (const key of expectedLocaleKeys) {
  assert.match(
    key,
    /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/,
    `locale key must be semantic: ${key}`,
  );
}
const catalogLocales = [];
for (const fileName of catalogLocaleFiles) {
  const pack = parseLocaleSource(read("locales", fileName), fileName);
  catalogLocales.push({ fileName, pack });
  assert.ok(
    normalizeLocalePackHarness(pack, fileName, rootLocale.messages),
    `the runtime validator must accept the shipped locale: ${fileName}`,
  );
  assert.deepEqual(
    new Set(Object.keys(pack.messages)),
    expectedLocaleKeys,
    `locale keys differ from the interface: ${fileName}`,
  );
  for (const value of Object.values(pack.messages)) {
    assert.equal(typeof value, "string");
    assert.notEqual(value.trim(), "", `empty locale value: ${fileName}`);
  }
  for (const key of expectedLocaleKeys) {
    const placeholders = (value) =>
      [...value.matchAll(/\{([a-z0-9_]+)\}/gi)].map((match) => match[1]).sort();
    assert.deepEqual(
      placeholders(pack.messages[key]),
      placeholders(rootLocale.messages[key]),
      `locale placeholders differ for ${key}: ${fileName}`,
    );
  }
}
const rootLocaleCatalogEntry = catalogLocales.find(
  ({ pack }) => pack.locale.toLowerCase() === rootLocale.locale.toLowerCase(),
);
assert.equal(
  rootLocaleCatalogEntry,
  undefined,
  "the root locale must not be duplicated in the catalog",
);

function themeMetadata(css, fileName) {
  assert.doesNotMatch(css, /\/\*\s*chronos-theme\b/i, `legacy metadata remains: ${fileName}`);
  const id = css.match(/--chronos-theme-id\s*:\s*["'](.+?)["']\s*;/i)?.[1];
  const name = css.match(/--chronos-theme-name\s*:\s*["'](.+?)["']\s*;/i)?.[1];
  const iconPath = css.match(/--chronos-theme-icon-path\s*:\s*["'](.+?)["']\s*;/i)?.[1];
  assert.ok(id, `theme id is missing: ${fileName}`);
  assert.ok(name, `theme name is missing: ${fileName}`);
  assert.ok(iconPath, `theme icon path is missing: ${fileName}`);
  assert.ok(iconPath.length <= 2048, `theme icon path is too long: ${fileName}`);
  assert.match(
    iconPath,
    /^[MmLlHhVvCcSsQqTtAaZzEe0-9+.,\s-]+$/,
    `theme icon path is invalid: ${fileName}`,
  );
  assert.doesNotMatch(css, /--chronos-theme-icon\s*:/i, `legacy theme icon remains: ${fileName}`);
  return { id, name, iconPath };
}

const rootTheme = themeMetadata(defaultThemeCss, "chronos.theme.css");
const themeDirectory = path.join(app, "themes");
const themeFiles = fs.readdirSync(themeDirectory).filter((name) => name.endsWith(".css"));
assert.ok(themeFiles.includes("chronos.theme.css"));
assert.ok(!themeFiles.includes("chronos.css"));
const catalogThemeFiles = themeFiles.filter((name) => name !== "chronos.theme.css");
for (const fileName of catalogThemeFiles) {
  assert.doesNotMatch(
    `${html}\n${js}`,
    new RegExp(escapeRegExp(fileName), "i"),
    `theme must not require an application registry entry: ${fileName}`,
  );
}
const themeRecords = catalogThemeFiles.map((name) =>
  themeMetadata(read("themes", name), name),
);
assert.equal(
  new Set([rootTheme.id, ...themeRecords.map(({ id }) => id)]).size,
  themeRecords.length + 1,
);
assert.equal(
  new Set([rootTheme.name, ...themeRecords.map(({ name }) => name)]).size,
  themeRecords.length + 1,
);
assert.equal(
  new Set([rootTheme.iconPath, ...themeRecords.map(({ iconPath }) => iconPath)]).size,
  themeRecords.length + 1,
);

const rootThemeCatalogIndex = themeRecords.findIndex(({ id }) => id === rootTheme.id);
assert.equal(
  rootThemeCatalogIndex,
  -1,
  "the root theme must not be duplicated in the catalog",
);

const themeVariableNames = (css) =>
  new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
const themeVariableUses = (css) =>
  new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((match) => match[1]));
const metadataVariables = new Set([
  "--chronos-theme-id",
  "--chronos-theme-name",
  "--chronos-theme-icon-path",
]);
const requiredThemeVariables = new Set(
  [...themeVariableNames(defaultThemeCss)].filter((name) => !metadataVariables.has(name)),
);
const availableBaseVariables = new Set([
  ...themeVariableNames(structureCss),
  ...requiredThemeVariables,
  ...[...structureCss.matchAll(/var\(\s*(--[a-z0-9-]+)\s*,/gi)].map(
    (match) => match[1],
  ),
  ...[...js.matchAll(/\.setProperty\(\s*["'](--[a-z0-9-]+)["']/gi)].map(
    (match) => match[1],
  ),
]);
assert.deepEqual(
  new Set([...themeVariableUses(structureCss)].filter((name) => !availableBaseVariables.has(name))),
  new Set(),
  "base CSS references variables missing from the base/theme contract",
);
const taskFrameDeclaration =
  /(?:^|;)\s*border(?:-width|-(?:top|right|bottom|left)(?:-width)?|-(?:block|inline)(?:-(?:start|end))?(?:-width)?)?\s*:/;
for (const fileName of themeFiles) {
  const themeCss = read("themes", fileName);
  assert.equal(
    [...themeCss.matchAll(/--marker-l\s*:/g)].length,
    2,
    `marker lightness must cover light and dark schemes: ${fileName}`,
  );
  assert.equal(
    [...themeCss.matchAll(/--marker-c\s*:/g)].length,
    2,
    `marker chroma must cover light and dark schemes: ${fileName}`,
  );
  assert.doesNotMatch(
    themeCss,
    /\.column(?:\.today|:not\(\.collapsed\)|:nth-child)/,
    `theme must target the shared column surface: ${fileName}`,
  );
  const variables = themeVariableNames(themeCss);
  assert.deepEqual(
    new Set([...requiredThemeVariables].filter((name) => !variables.has(name))),
    new Set(),
    `theme token contract is incomplete: ${fileName}`,
  );
  assert.match(themeCss, /color-scheme:\s*light/);
  assert.match(themeCss, /color-scheme:\s*dark/);
  assert.doesNotMatch(
    themeCss,
    /\.task\.(?:starred|urgent)(?:\.urgent)?::before/,
    `theme must not override the base marker geometry: ${fileName}`,
  );
  assert.doesNotMatch(
    themeCss,
    /\.task-list\s*\{[^}]*\bpadding(?:-top|-block(?:-(?:start|end))?)?\s*:/s,
    `theme must not override the task lift reserve: ${fileName}`,
  );
  assert.doesNotMatch(
    themeCss,
    /\.task-text\s*\{[^}]*font-size\s*:/s,
    `theme task size must use --task-text-size: ${fileName}`,
  );
  assert.doesNotMatch(
    themeCss,
    /\.(?:help-tab|slice-title)(?:\s|,|\{)/,
    `removed help selectors must not remain in themes: ${fileName}`,
  );
  assert.doesNotMatch(
    themeCss,
    /--(?:radius-xs|chrome-bg)\s*:/,
    `removed help tokens must not remain in themes: ${fileName}`,
  );
  const cardRadius = Number(themeCss.match(/--radius-card:\s*([\d.]+)(?:px)?;/)?.[1]);
  const pillRadius = Number(themeCss.match(/--radius-pill:\s*([\d.]+)(?:px)?;/)?.[1]);
  if (cardRadius <= 4) {
    assert.ok(
      pillRadius <= 4,
      `angular themes must apply their geometry to controls: ${fileName}`,
    );
  }
  for (const [, selectors, declarations] of themeCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      selectors.includes(".visual-theme-popover") &&
      /\.(?:file-popover|context-menu)/.test(selectors)
    ) {
      assert.match(
        selectors,
        /\.task-marker-filter-popover/,
        `shared popover styling must include task markers: ${fileName}`,
      );
    }
    if (!/\.task\.(?:starred|urgent)/.test(selectors)) continue;
    assert.doesNotMatch(
      declarations,
      taskFrameDeclaration,
      `task status must not change the frame width: ${fileName}`,
    );
  }
}

assert.match(
  baseCss,
  /\.file-status\s*\{[^}]*border-radius:\s*50%;/s,
  "the file connection status must remain a circular indicator",
);

assert.match(
  boardCss,
  /\.task-list\s*\{[^}]*margin-top:\s*calc\(var\(--task-list-air\) - 4px\);[^}]*padding:\s*4px 0 var\(--task-list-air\);/s,
  "task lists must reserve hover space without changing the header gap",
);
assert.match(
  structureCss,
  /\.expanded-column \.task-list\s*\{[^}]*padding:\s*4px 0 var\(--task-list-air\);/s,
  "expanded task lists must keep the hover reserve",
);

const neoThemeCss = read("themes", "neo-brutalism.css");
assert.match(
  neoThemeCss,
  /\.column-surface:not\(\.collapsed\) > \.col-header\s*\{[^}]*background:\s*var\(--header-bg\);[^}]*color:\s*var\(--accent\);/s,
  "Neo Brutalism must keep regular day headers dark with yellow text",
);
assert.match(
  neoThemeCss,
  /\.column-surface\.today:not\(\.collapsed\) > \.col-header\s*\{[^}]*background:\s*var\(--accent\);[^}]*color:\s*var\(--header-bg\);/s,
  "Neo Brutalism must invert the current day header",
);
assert.match(
  neoThemeCss,
  /\.col-header \.day-name,[\s\S]*\.col-header \.day-month\s*\{\s*color:\s*inherit;/,
  "Neo Brutalism date labels must inherit the accessible header color",
);

const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, "HTML ids must be unique");
const htmlIdSet = new Set(htmlIds);
const literalDomIds = new Set(
  [...js.matchAll(/getElementById\(\s*"([^"]+)"\s*\)/g)].map(
    (match) => match[1],
  ),
);
assert.deepEqual(
  new Set([...literalDomIds].filter((id) => !htmlIdSet.has(id))),
  new Set(),
  "literal getElementById references must exist in HTML",
);

const staticActions = new Set(
  [...html.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]),
);
const handledActions = new Set(
  [...js.matchAll(/case\s+"([^"]+)"\s*:/g)].map((match) => match[1]),
);
assert.deepEqual(
  new Set([...staticActions].filter((action) => !handledActions.has(action))),
  new Set(),
  "static data-actions must be handled by the click router",
);
assert.doesNotMatch(html, /<svg class="icon"/, "static icons must use data-icon");
assert.doesNotMatch(html, /data-help-demo/);
assert.match(js, /!el\.closest\("\[inert\]"\)/);
assert.doesNotMatch(scriptSources[0], /^\s*pencil\s*:/m);
assert.match(
  styleSources[5],
  /\.help-panel\s*\{[^}]*width:\s*min\([^,]+, 50vw\)[^}]*height:\s*100%/s,
  "the guide must fit within half the desktop viewport and fill the available height",
);
assert.doesNotMatch(styleSources[5], /\.help-toc|\.help-contents-select|\.help-wiki/, 'removed guide navigation has no stylesheet');
assert.match(
  styleSources[5],
  /\.shortcut-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*[^;]+ minmax\(0, 1fr\);[^}]*border-bottom:\s*1px solid var\(--border\)/s,
  "shortcuts must read as a two-column reference table",
);
assert.match(
  styleSources[5],
  /@media \(max-width: \d+px\)[\s\S]*?\.help-panel\s*\{[^}]*width:\s*100%/s,
  "the guide must use the available panel width on small screens",
);
assert.doesNotMatch(
  styleSources[5],
  /\.shortcut-key\s*\{[^}]*(?:background|border|box-shadow)\s*:/s,
  "shortcut keys must not look like interactive buttons",
);
assert.match(baseCss, /\.icon-btn\.danger:not\(:disabled\),[\s\S]*?color:\s*var\(--action-danger\)/, 'permanent deletion uses the shared destructive foreground');
assert.match(baseCss, /danger-on-interaction[\s\S]*?background:\s*var\(--action-danger-soft\)/, 'destructive interaction uses the shared danger background');
assert.match(
  html,
  /class="icon-btn"[^>]*data-action="trash"/,
  "the header Bin button opens a view and must use neutral navigation styling",
);
assert.match(scriptSources[5], /\bdanger-on-interaction\b/);
assert.match(scriptSources[6], /kind === ARCHIVE \? " danger-on-interaction" : ""/);
assert.match(scriptSources[6], /menu-item danger-on-interaction[^>]*data-delete/);
assert.match(scriptSources[6], /classList\.toggle\("danger", kind === TRASH\)/);
assert.match(
  scriptSources[6],
  /confirmClear\.classList\.toggle\("danger", kind === TRASH\)[\s\S]*?confirmClear\.classList\.toggle\("danger-on-interaction", kind === ARCHIVE\)/,
  "bulk confirmation must distinguish reversible moves from permanent deletion",
);
assert.match(
  scriptSources[6],
  /class="icon-btn danger" data-purge/,
  "permanent deletion must keep its visible danger state",
);
assert.match(
  scriptSources[6],
  /kind === ARCHIVE[\s\S]*?setBinRowConfirm\(row, true\)[\s\S]*?data-confirm-row/,
  "moving a completed task to the bin must use the row-level confirmation",
);
assert.doesNotMatch(
  scriptSources[6] + structureCss,
  /confirming-purge|bin-purge-confirm|data-confirm-purge/,
  "the trash-only row confirmation must not survive the shared inline pattern",
);
assert.match(
  html,
  /class="icon-btn danger-on-interaction"\s+id="clearDataBtn"[\s\S]*?aria-expanded="false"/,
  "the file clear submenu trigger must be neutral until interaction",
);
assert.doesNotMatch(
  structureCss,
  /\.bin-tab\[data-bin="trash"\]\[aria-selected="true"\]/,
  "the selected Bin tab must use the common navigation state",
);
assert.doesNotMatch(
  structureCss,
  /\.menu-item\.danger(?:\s|:|\{)/,
  "unused permanent-danger menu styling must not return",
);
assert.match(
  baseCss,
  /button\.file-status\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s,
  "the clickable file status must provide a 24px target",
);
assert.match(
  baseCss,
  /button\.file-status::before\s*\{[^}]*width:\s*9px;[^}]*height:\s*9px;/s,
  "the visible file status dot must remain 9px",
);
assert.match(
  baseCss,
  /\.file-status\.saving\s*\{[^}]*--file-status-color:\s*var\(--amber\);[^}]*--file-status-ring:\s*color-mix\(in srgb, var\(--amber\)/s,
  "saving must use an amber dot and ring",
);
assert.match(html, /id="editorFilterPopover"\s+role="radiogroup"/);
assert.match(html, /role="radio"[\s\S]*?data-editor-filter="human"/);
assert.doesNotMatch(
  html.match(/<button[^>]*id="saveNote"[^>]*>/)?.[0] || "",
  /aria-haspopup/,
);
assert.match(html, /id="filePopover" role="group"[^>]*ui\.file_actions/);
assert.doesNotMatch(
  html.match(/<button[^>]*id="settingsToggle"[^>]*>/)?.[0] || "",
  /aria-haspopup/,
);
assert.match(html, /id="settingsPopover"\s+role="group"/);
assert.match(scriptSources[2], /close\.className = "icon-btn settings-close neutral-action"/);
assert.match(
  scriptSources[2],
  /function renderLocaleMenu\(\)[\s\S]*?close\.dataset\.action = "close-settings-popover";[\s\S]*?actions\.replaceChildren\([\s\S]*?connect,\s*close,/,
  "Settings close must stay at the right edge of the locale row",
);
assert.doesNotMatch(
  scriptSources[2].match(/function renderVisualThemeMenu\(\)[\s\S]*?\n\}/)?.[0] || "",
  /close-settings-popover/,
  "the theme row must not own the Settings close button",
);
assert.match(
  scriptSources[2],
  /button\.classList\.toggle\("active-toggle", settingsPopoverOpen\(\)\);/,
  "the Settings trigger must show its open state",
);

const notebookCss = read("themes", "notebook.css");
const warmIndigoCss = read("themes", "warm-indigo.css");
const controlPanelCss = read("themes", "control-panel.css");
assert.match(baseCss, /\.header-badge\s*\{/);
assert.match(baseCss, /border: 2px solid var\(--header-bg\)/);
assert.doesNotMatch(graphiteMossCss, /\.app-header \.header-badge/);
assert.match(graphiteMossCss, /\.app-header\s*\{[^}]*--amber:[^}]*--urgent:[^}]*--red:/s);
assert.match(
  graphiteMossCss,
  /\.app-header \.icon-btn:where\(:not\(:disabled\)\):hover/,
  "Graphite hover must protect disabled controls without outranking semantic states",
);
assert.doesNotMatch(
  graphiteMossCss,
  /\.app-header \.icon-btn:not\(:disabled\):hover/,
  "Graphite hover must not raise specificity above semantic states",
);
assert.doesNotMatch(graphiteMossCss, /\.app-header \.file-status\s*\{/);
assert.match(graphiteMossCss, /\.app-header \.file-status\.local[\s\S]*?--file-status-color:\s*var\(--header-muted\)/);
assert.match(controlPanelCss, /\.app-header button\.file-status::before/);
assert.match(warmIndigoCss, /--radius-lg:\s*14px/);
assert.match(warmIndigoCss, /--radius-modal:\s*20px/);
assert.doesNotMatch(warmIndigoCss, /\.visual-theme-popover|\.submenu\s*\{/);

// Dimension behavior is covered by chronos-dimensions.test.mjs and the isolated browser checks.
assert.match(scriptSources[4], /renderTaskMarkerParts\(text, parseTaskMarkers\(item\.text\)/);
assert.match(scriptSources[7], /case "set-task-marker-filter"/);
assert.match(scriptSources[7], /const openMarkerFilter = openTaskMarkerFilterKind\(\)/);
assert.equal(declaredSet(scriptSources[0], "TASK_FIELDS").includes("tags"), false);
assert.equal(declaredSet(scriptSources[0], "TASK_FIELDS").includes("mentions"), false);
assert.equal(declaredSet(scriptSources[0], "UI_FIELDS").includes("filterTag"), false);
assert.match(defaultThemeCss, /--marker-l\s*:/);
assert.match(defaultThemeCss, /--marker-c\s*:/);
assert.match(defaultThemeCss, /--task-text-size:\s*0\.84rem/);
assert.match(structureCss, /max-width:\s*min\(50vw, calc\(100vw - 16px\)\)/);
assert.match(boardCss, /\.task-marker\s*\{[^}]*var\(--task-marker-accent\)[^}]*var\(--radius-pill\)[^}]*var\(--card\)/s);
assert.match(boardCss, /\.task-marker\s*\{[^}]*font-size:\s*inherit/s);
assert.match(boardCss, /\.task-text\s*\{[^}]*font-size:\s*var\(--task-text-size\)/s);
assert.match(boardCss, /\.task-marker\s*\{[^}]*vertical-align:\s*baseline/s);
const monthMarkerRule = monthCss.match(/\.month-task-marker\s*\{([^}]*)\}/)?.[1];
assert.ok(monthMarkerRule, "month marker sizing rule must exist");
assert.match(monthMarkerRule, /max-width:\s*76px/);
assert.doesNotMatch(
  monthMarkerRule,
  /(?:^|;)\s*(?:display|align-items|border(?:-[\w-]+)?|border-radius|background|color|font-size|font-weight|vertical-align)\s*:/,
  "month markers must inherit the shared visual skin",
);
assert.match(boardCss, /\.task-marker\s*\{[^}]*cursor:\s*pointer/s);
assert.doesNotMatch(
  styleSources[5],
  /\.help-heading\s*\{[^}]*(?:display|align-items|gap)\s*:/s,
  "help heading must not retain layout for a removed version label",
);
assert.match(
  functionDeclaration(scriptSources[0], "taskMarkerElement"),
  /onpointerdown[\s\S]*?preventDefault\(\)[\s\S]*?stopPropagation\(\)[\s\S]*?onclick[\s\S]*?setTaskMarkerFilter\(part\.symbol, part\.key\)/,
  "clicking a rendered task marker must toggle its existing filter without opening the task",
);
assert.match(
  baseCss,
  /\.task-marker-filter-option\s*\{[^}]*min-height:\s*28px;[^}]*font-size:\s*var\(--task-text-size\)/s,
);
assert.match(
  styleSources[3],
  /\.bin-text\s*\{[^}]*font-size:\s*var\(--task-text-size\)/s,
);
assert.doesNotMatch(html + js, /help\.eyebrow|data-help-color-scheme/);
assert.doesNotMatch(functionDeclaration(scriptSources[0], "taskMarkerElement"), /icons\.human/);
assert.doesNotMatch(functionDeclaration(scriptSources[3], "syncTaskMarkerFilterControl"), /icons\.human/);

assert.match(js, /const DEFAULT_COLUMN_WIDTH = 238/);
assert.match(js, /const MIN_COLUMN_WIDTH = 170/);
assert.match(js, /const COMPACT_BOARD_MAX_WIDTH = 860/);
assert.match(js, /const MOBILE_MEDIA_QUERY = "\(max-width: 640px\)"/);
for (const value of [238, 860, 640]) assert.match(structureCss, new RegExp(`${value}px`));

console.log("chronos 2 tests: ok");

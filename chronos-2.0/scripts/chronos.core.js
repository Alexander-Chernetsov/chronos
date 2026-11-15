// Constants and state
const CHRONOS_VERSION = "2.2.29";
const DATA_SCHEMA_VERSION = 1;
const DIMENSIONS = "__dimensions__";
const DIMENSION_COLORS = "__dimensionColors__";
const DEFAULT_DIMENSIONS = ["#", "@", "!"];
const DIMENSION_HUES = [25, 55, 85, 150, 190, 230, 265, 305, 345];
// UI choices expand independently of the default color assignment order.
const DIMENSION_COLOR_PRESETS = [5, 25, 40, 55, 70, 85, 115, 150, 170, 190, 210, 230, 250, 265, 285, 305, 325, 345];
const STORAGE_KEY = globalThis.CHRONOS_DEMO === true
  ? "chronos-planner-demo-v2"
  : "chronos-planner-v2";
const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;
const VISUAL_THEME_KEY = `${STORAGE_KEY}-visual-theme`;
const LOCALE_KEY = `${STORAGE_KEY}-locale`;
const DIRECTORY_HANDLE_DB = `${STORAGE_KEY}-handles`;
const DIRECTORY_HANDLE_STORE = "handles";
const THEME_DIRECTORY_KEY = "themes-directory";
const LOCALE_DIRECTORY_KEY = "locales-directory";
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_COLUMN_WIDTH = 238;
const MIN_COLUMN_WIDTH = 170;
const COMPACT_BOARD_MAX_WIDTH = 860;
const MOBILE_MEDIA_QUERY = "(max-width: 640px)";
const EXPANDED_SINGLE_COLUMN_QUERY = window.matchMedia(
  MOBILE_MEDIA_QUERY,
);
const REDUCED_MOTION_QUERY = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);
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
const FALLBACK_LOCALE_PACK = {
  id: "default",
  locale: "en",
  name: "Locale error",
  shortLabel: "!",
  messages: {},
};
const ROOT_LOCALE_PACK = normalizeLocalePack(
  globalThis.CHRONOS_LOCALE_PACK,
  "default",
);
const ROOT_LOCALE_VALID = Boolean(ROOT_LOCALE_PACK);
const DEFAULT_LOCALE_PACK = ROOT_LOCALE_PACK || FALLBACK_LOCALE_PACK;
let APP_LOCALE = DEFAULT_LOCALE_PACK.locale;
function createDateFormatters(locale) {
  return {
  weekdayShort: new Intl.DateTimeFormat(locale, {
    weekday: "short",
  }),
  weekdayLong: new Intl.DateTimeFormat(locale, {
    weekday: "long",
  }),
  dayMonthShort: new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }),
  dayMonthLong: new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
  }),
  dayTitle: new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }),
  fullDate: new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
  monthYear: new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }),
  range: new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }),
  };
}
let dateFormatters = createDateFormatters(APP_LOCALE);
const INBOX = "__inbox__",
  CONTROL = "__control__",
  ARCHIVE = "__archive__",
  TRASH = "__trash__",
  UI = "__ui__";
const icons = {
  layers:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2 1 8l11 6 11-6-11-6zm0 2.3L18.8 8 12 11.7 5.2 8 12 4.3zM3.1 11.2 1 12.4l11 6 11-6-2.1-1.2L12 16l-8.9-4.8zm0 4.4L1 16.8l11 6 11-6-2.1-1.2L12 20.4l-8.9-4.8z"/></svg>',
  calendar:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M19,4H18V2H16V4H8V2H6V4H5C3.89,4 3,4.9 3,6V20C3,21.1 3.89,22 5,22H19C20.1,22 21,21.1 21,20V6C21,4.9 20.1,4 19,4M19,20H5V10H19V20M19,8H5V6H19V8Z"/></svg>',
  inbox:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M19,15H15C15,16.66 13.66,18 12,18C10.34,18 9,16.66 9,15H5V5H19V15M19,3H5C3.9,3 3,3.9 3,5V19C3,20.1 3.9,21 5,21H19C20.1,21 21,20.1 21,19V5C21,3.9 20.1,3 19,3Z"/></svg>',
  control:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M14.4,6L14,4H5V21H7V14H12.6L13,16H20V6H14.4Z"/></svg>',
  search:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L20.5,19L19,20.5L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7.01,5 5,7.01 5,9.5C5,11.99 7.01,14 9.5,14C11.99,14 14,11.99 14,9.5C14,7.01 11.99,5 9.5,5Z"/></svg>',
  sun:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12,18A6,6 0 0,1 12,6A6,6 0 0,1 12,18M12,20A8,8 0 0,0 12,4A8,8 0 0,0 12,20M12,2V0H10V2H12M12,24V22H10V24H12M4.93,4.93L3.52,3.52L2.1,4.93L3.52,6.34L4.93,4.93M21.9,19.07L20.48,17.66L19.07,19.07L20.48,20.48L21.9,19.07M2,13H0V11H2V13M24,13H22V11H24V13M4.93,19.07L3.52,20.48L2.1,19.07L3.52,17.66L4.93,19.07M21.9,4.93L20.48,6.34L19.07,4.93L20.48,3.52L21.9,4.93Z"/></svg>',
  moon:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M20.1,14.8A8.3,8.3 0 0,1 9.2,3.9A8.6,8.6 0 1,0 20.1,14.8Z"/></svg>',
  settings:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M19.14,12.94C19.18,12.63 19.2,12.32 19.2,12C19.2,11.68 19.18,11.36 19.13,11.06L21.16,9.48L19.24,6.16L16.85,7.12C16.35,6.74 15.8,6.42 15.2,6.18L14.84,3.65H11L10.64,6.18C10.04,6.42 9.5,6.74 9,7.12L6.6,6.16L4.68,9.48L6.71,11.06C6.66,11.36 6.64,11.69 6.64,12C6.64,12.31 6.66,12.64 6.71,12.94L4.68,14.52L6.6,17.84L9,16.88C9.5,17.26 10.04,17.58 10.64,17.82L11,20.35H14.84L15.2,17.82C15.8,17.58 16.35,17.26 16.85,16.88L19.24,17.84L21.16,14.52L19.14,12.94M12.92,15.2A3.2,3.2 0 1,1 12.92,8.8A3.2,3.2 0 0,1 12.92,15.2Z"/></svg>',
  save:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M17,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3M12,19A2.5,2.5 0 0,1 9.5,16.5A2.5,2.5 0 0,1 12,14A2.5,2.5 0 0,1 14.5,16.5A2.5,2.5 0 0,1 12,19M6,5H15V9H6V5Z"/></svg>',
  folder:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M10,4L12,6H20A2,2 0 0,1 22,8V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18L2,6A2,2 0 0,1 4,4H10M4,8V18H20V8H4Z"/></svg>',
  unlink:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M2.39,1.73L1.11,3L5.84,7.73L5.59,8A5,5 0 0,0 5.59,15.07L8.42,17.9A5,5 0 0,0 15.49,17.9L16.2,17.19L20.84,21.83L22.11,20.56L2.39,1.73M9.83,16.49L7,13.66A3,3 0 0,1 7,9.41L7.25,9.16L14.78,16.69L14.07,17.4A3,3 0 0,1 9.83,16.49M11.54,6.46L13.66,4.34A5,5 0 0,1 20.73,11.41L19.31,12.83L17.9,11.41L19.31,10A3,3 0 0,0 15.07,5.76L12.95,7.88L11.54,6.46M8.71,13.66L7.29,12.24L10.83,8.71L12.24,10.12L8.71,13.66Z"/></svg>',
  archive:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M20,21H4V10H6V19H18V10H20V21M3,3H21V9H3V3M9.5,12H14.5V14H9.5V12M5,5V7H19V5H5Z"/></svg>',
  check:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z"/></svg>',
  comment:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>',
  human:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/></svg>',
  robot:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12,2A2,2 0 0,1 14,4C14,4.74 13.6,5.39 13,5.73V7H17A3,3 0 0,1 20,10V17A3,3 0 0,1 17,20H7A3,3 0 0,1 4,17V10A3,3 0 0,1 7,7H11V5.73C10.4,5.39 10,4.74 10,4A2,2 0 0,1 12,2M8,11A1.5,1.5 0 1,0 8,14A1.5,1.5 0 0,0 8,11M16,11A1.5,1.5 0 1,0 16,14A1.5,1.5 0 0,0 16,11M8,16V18H16V16H8Z"/></svg>',
  copy:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M19,21H8A2,2 0 0,1 6,19V7H8V19H19V21M16,3H4A2,2 0 0,0 2,5V16H4V5H16V3M20,7H11A2,2 0 0,0 9,9V15A2,2 0 0,0 11,17H20A2,2 0 0,0 22,15V9A2,2 0 0,0 20,7Z"/></svg>',
  plus:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M11,5H13V11H19V13H13V19H11V13H5V11H11V5Z"/></svg>',
  more:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M6,10A2,2 0 1,1 6,14A2,2 0 0,1 6,10M12,10A2,2 0 1,1 12,14A2,2 0 0,1 12,10M18,10A2,2 0 1,1 18,14A2,2 0 0,1 18,10Z"/></svg>',
  collapseRail:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M15.41,7.41L14,6L8,12L14,18L15.41,16.59L10.83,12L15.41,7.41Z"/></svg>',
  actions:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M4,5H20V7H4V5M4,11H20V13H4V11M4,17H20V19H4V17Z"/></svg>',
  info:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M11,17H13V11H11V17M12,7A1.25,1.25 0 0,0 10.75,8.25A1.25,1.25 0 0,0 12,9.5A1.25,1.25 0 0,0 13.25,8.25A1.25,1.25 0 0,0 12,7M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z"/></svg>',
  palette:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12,3A9,9 0 0,0 3,12C3,16.42 6.58,20 11,20H12.5A1.5,1.5 0 0,0 14,18.5C14,18.1 13.84,17.72 13.56,17.44C13.28,17.16 13.1,16.78 13.1,16.35C13.1,15.61 13.71,15 14.45,15H16A5,5 0 0,0 21,10C21,6.13 16.97,3 12,3M6.5,13A1.5,1.5 0 1,1 6.5,10A1.5,1.5 0 0,1 6.5,13M9,8.5A1.5,1.5 0 1,1 9,5.5A1.5,1.5 0 0,1 9,8.5M14,8A1.5,1.5 0 1,1 14,5A1.5,1.5 0 0,1 14,8M17.5,12A1.5,1.5 0 1,1 17.5,9A1.5,1.5 0 0,1 17.5,12Z"/></svg>',
  viewBoard:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M3,4H8V20H3V4M10,4H15V20H10V4M17,4H22V20H17V4Z"/></svg>',
  viewMonth:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M19,4H18V2H16V4H8V2H6V4H5C3.9,4 3,4.9 3,6V20C3,21.1 3.9,22 5,22H19C20.1,22 21,21.1 21,20V6C21,4.9 20.1,4 19,4M19,20H5V9H19V20M7,11H11V15H7V11M13,11H17V15H13V11M7,17H11V19H7V17M13,17H17V19H13V17Z"/></svg>',
  overdue:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M13.5,8H12V13L16.28,15.54L17,14.33L13.5,12.25V8M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 1,1 13,19A6.9,6.9 0 0,1 8.05,16.95L6.63,18.37A9,9 0 1,0 13,3Z"/></svg>',
  trash:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19V4M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>',
};

// Shared DOM and date primitives
function div(cls, text = "") {
  const element = document.createElement("div");
  element.className = cls;
  element.textContent = text;
  return element;
}
function span(cls, text = "") {
  const element = document.createElement("span");
  element.className = cls;
  element.textContent = text;
  return element;
}
function normalizeTaskMarker(value) {
  return String(value || "").normalize("NFC").toLowerCase();
}
function validDimensionSymbol(value) {
  return typeof value === "string" && [...value].length === 1 &&
    /^[\p{P}\p{S}]$/u.test(value) && ![",", ";"].includes(value);
}
function validateDimensions(data) {
  if (data.__schema__ !== DATA_SCHEMA_VERSION) {
    const error = new Error(data.__schema__ > DATA_SCHEMA_VERSION
      ? "File created by a newer Chronos version. Update Chronos."
      : "Unsupported data format. Convert it with the one-time migration tool.");
    error.code = data.__schema__ > DATA_SCHEMA_VERSION ? "schema_newer" : "schema_old";
    throw error;
  }
  if (!Array.isArray(data[DIMENSIONS]) ||
      data[DIMENSIONS].some(symbol => !validDimensionSymbol(symbol)) ||
      new Set(data[DIMENSIONS]).size !== data[DIMENSIONS].length)
    throw new Error("Invalid dimensions: use unique single punctuation or symbol characters");
  if (!isPlainObject(data[DIMENSION_COLORS]) ||
      Object.entries(data[DIMENSION_COLORS]).some(([symbol, hue]) =>
        !validDimensionSymbol(symbol) || !Number.isInteger(hue) || hue < 0 || hue > 359))
    throw new Error("Invalid dimension colors: use single symbols and integer hues from 0 to 359");
}
function activeDimensions() {
  return state?.[DIMENSIONS] || DEFAULT_DIMENSIONS;
}
function dimensionHue(symbol) {
  return state?.[DIMENSION_COLORS]?.[symbol] ??
    DIMENSION_HUES[Math.max(0, activeDimensions().indexOf(symbol)) % DIMENSION_HUES.length];
}
function parseTaskMarkers(value, dimensions = activeDimensions()) {
  const source = String(value || "");
  const parsed = { parts: [], markers: [] };
  const symbols = dimensions.map(symbol => symbol.replace(/[\\\]\[\-^]/g, "\\$&")).join("");
  if (!symbols) {
    if (source) parsed.parts.push({ type: "text", value: source });
    return parsed;
  }
  const expression = new RegExp(`(^|\\s)([${symbols}])([\\p{L}\\p{N}\\p{S}][\\p{L}\\p{N}\\p{M}\\p{S}_\\-\\u200D\\uFE0F]*)(?=$|[\\s,.;:!?])`, "gu");
  const seen = new Set();
  let cursor = 0;
  for (const match of source.matchAll(expression)) {
    const prefixEnd = match.index + match[1].length;
    if (prefixEnd > cursor)
      parsed.parts.push({ type: "text", value: source.slice(cursor, prefixEnd) });
    const symbol = match[2];
    const key = symbol + normalizeTaskMarker(match[3]);
    parsed.parts.push({ type: "marker", symbol, key, label: match[3] });
    if (!seen.has(key)) {
      seen.add(key);
      parsed.markers.push(key);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length)
    parsed.parts.push({ type: "text", value: source.slice(cursor) });
  return parsed;
}
function taskMarkerElement(part, className = "", interactive = true) {
  const element = document.createElement(!interactive || className === "month-task-marker" ? "span" : "button");
  if (element.tagName === "BUTTON") element.type = "button";
  element.contentEditable = "false";
  element.className = ["task-marker", className].filter(Boolean).join(" ");
  element.style.setProperty("--marker-hue", dimensionHue(part.symbol));
  element.append(span("task-marker-label", part.label));
  if (!interactive) {
    element.prepend(span("sr-only", part.symbol));
    element.title = part.symbol + part.label;
    return element;
  }
  element.setAttribute("aria-label", tr("dimensions.filter", "", {0: part.symbol, 1: part.label}));
  element.onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  element.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setTaskMarkerFilter(part.symbol, part.key);
  };
  return element;
}
function renderTaskMarkerParts(container, parsed, className = "", interactive = true) {
  container.replaceChildren(
    ...parsed.parts.map((part) =>
      part.type === "text"
        ? document.createTextNode(part.value)
        : taskMarkerElement(part, className, interactive),
    ),
  );
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function isDateKey(value) {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
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
function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
function isPastTaskDate(key) {
  return isDateKey(key) && key < dateKey(todayStart());
}
function canAddTaskTo(key) {
  return !isPastTaskDate(key);
}
function canMoveTaskTo(from, to) {
  return from === to || canAddTaskTo(to);
}
function addDays(days) {
  const date = todayStart();
  date.setDate(date.getDate() + days);
  return date;
}
Object.keys(icons).forEach((name) => {
  icons[name] = icons[name].replace(
    "<svg ",
    '<svg aria-hidden="true" ',
  );
});
let state,
  dataFileHandle = null,
  visualThemeDirectoryHandle = null,
  visualThemeDirectoryAuthorized = false,
  availableVisualThemes = [],
  bundledVisualThemes = [],
  activeVisualThemeUrl = null,
  activeVisualThemeId = "default",
  selectedVisualThemeId = "default",
  rootVisualThemeMetadata = null,
  localeDirectoryHandle = null,
  localeDirectoryAuthorized = false,
  availableLocales = [],
  bundledLocales = [],
  activeLocaleId = "default",
  selectedLocaleId = "default",
  activeLocaleMessages = DEFAULT_LOCALE_PACK.messages,
  staticTextBindings = [],
  staticAttributeBindings = [],
  linkedFileSnapshot = null,
  linkedStateDirty = false,
  ignoredExternalSnapshot = null,
  externalFileCheckRunning = false,
  linkedWriteActive = false,
  linkedWriteRevision = 0,
  saveTimer = null,
  pendingFileWrite = null,
  fileWritePromise = Promise.resolve(),
  dropCue = null,
  taskEditorTarget = null,
  taskEditorInitialTitle = "",
  taskEditorInitialComment = "",
  currentBin = null,
  datePicker = null,
  datePickerMonth = null,
  monthCursor = null,
  dayOffset = -1,
  searchQuery = "",
  taskMarkerFilters = {},
  filterColumnWidth = null,
  modalReturnFocus = null,
  confirmationQueue = [],
  activeConfirmation = null,
  menuReturnFocus = null,
  loadRecoveryState = null,
  pendingRecoverySnapshot = null,
  loadSchemaError = null,
  expandedReturnState = null,
  columnActionsTrigger = null;

// Data model
function seed() {
  return {
    __schema__: DATA_SCHEMA_VERSION,
    [DIMENSIONS]: [...DEFAULT_DIMENSIONS],
    [DIMENSION_COLORS]: { "#": 85, "@": 305, "!": 25 },
    [UI]: {
      dayCount: 7,
      collapsed: [],
      todayColumnIndex: 2,
      theme: "light",
      view: "board",
      expandedKey: null,
      filterLastEditor: "all",
    },
    [INBOX]: [],
    [CONTROL]: [],
    [dateKey(new Date())]: [],
    [ARCHIVE]: [],
    [TRASH]: [],
  };
}
function task(text, comment = "") {
  return {
    id: crypto.randomUUID(),
    text,
    comment,
    lastEditedByAgent: false,
  };
}
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validateIncomingUi(value) {
  if (!isPlainObject(value)) throw new Error(`${UI} must be an object`);
  const unsupportedField = Object.keys(value).find(
    (field) => !UI_FIELDS.has(field),
  );
  if (unsupportedField)
    throw new Error(`Unsupported ${UI} field ${unsupportedField}`);
  const missingField = [...UI_FIELDS].find(
    (field) => !Object.hasOwn(value, field),
  );
  if (missingField) throw new Error(`${UI} is missing ${missingField}`);
  for (const [field, maximum] of [
    ["dayCount", 30],
    ["todayColumnIndex", 30],
  ]) {
    if (
      !Number.isInteger(value[field]) ||
      value[field] < 1 ||
      value[field] > maximum
    )
      throw new Error(`${UI}.${field} must be an integer from 1 to ${maximum}`);
  }
  if (
    !Array.isArray(value.collapsed) ||
    value.collapsed.some(
      (key) => ![INBOX, CONTROL].includes(key) && !isDateKey(key),
    )
  )
    throw new Error(`${UI}.collapsed contains an unsupported bucket`);
  for (const [field, allowed] of Object.entries({
    theme: ["light", "dark"],
    view: ["board", "month"],
    filterLastEditor: ["all", "human", "agent"],
  })) {
    if (!allowed.includes(value[field]))
      throw new Error(`${UI}.${field} must be one of ${allowed.join(", ")}`);
  }
  if (
    value.expandedKey !== null &&
    ![INBOX, CONTROL].includes(value.expandedKey) &&
    !isDateKey(value.expandedKey)
  )
    throw new Error(`${UI}.expandedKey is invalid`);
  if (
    Number.isInteger(value.dayCount) &&
    Number.isInteger(value.todayColumnIndex) &&
    value.todayColumnIndex > value.dayCount
  )
    throw new Error(`${UI}.todayColumnIndex cannot exceed ${UI}.dayCount`);
}
function validateIncomingData(data) {
  if (!isPlainObject(data)) throw new Error("Chronos data must be an object");
  validateDimensions(data);
  const ids = new Set();
  const requiredBuckets = new Set([INBOX, CONTROL, ARCHIVE, TRASH]);
  let hasUi = false;
  for (const [key, value] of Object.entries(data)) {
    if (["__schema__", DIMENSIONS, DIMENSION_COLORS].includes(key)) continue;
    if (key === UI) {
      validateIncomingUi(value);
      hasUi = true;
      continue;
    }
    if (![INBOX, CONTROL, ARCHIVE, TRASH].includes(key) && !isDateKey(key))
      throw new Error(`Unsupported task bucket ${key}`);
    if (!Array.isArray(value)) throw new Error(`Bucket ${key} must be an array`);
    requiredBuckets.delete(key);
    value.forEach((item, index) => {
      const location = `${key}[${index}]`;
      if (!isPlainObject(item)) throw new Error(`${location} must be an object`);
      const unsupportedField = Object.keys(item).find(
        (field) => !TASK_FIELDS.has(field),
      );
      if (unsupportedField)
        throw new Error(`${location} has unsupported field ${unsupportedField}`);
      const validId =
        (typeof item.id === "number" && Number.isFinite(item.id)) ||
        (typeof item.id === "string" && Boolean(item.id.trim()));
      if (!validId) throw new Error(`${location}.id is invalid`);
      const idKey = String(item.id);
      if (ids.has(idKey)) throw new Error(`Duplicate task id ${item.id}`);
      ids.add(idKey);
      if (typeof item.text !== "string" || !item.text.trim())
        throw new Error(`${location}.text must be a non-empty string`);
      if (typeof item.comment !== "string")
        throw new Error(`${location}.comment must be a string`);
      if (typeof item.lastEditedByAgent !== "boolean")
        throw new Error(`${location}.lastEditedByAgent must be boolean`);
      for (const field of ["archivedAt", "deletedAt"]) {
        if (
          Object.hasOwn(item, field) &&
          (typeof item[field] !== "number" || !Number.isFinite(item[field]))
        )
          throw new Error(`${location}.${field} must be a finite number`);
      }
      if (key === ARCHIVE && !Number.isFinite(item.archivedAt))
        throw new Error(`${location}.archivedAt is required`);
      if (key === TRASH && !Number.isFinite(item.deletedAt))
        throw new Error(`${location}.deletedAt is required`);
    });
  }
  if (!hasUi) throw new Error(`Chronos data must contain ${UI}`);
  if (requiredBuckets.size)
    throw new Error(
      `Chronos data is missing ${[...requiredBuckets].join(", ")}`,
    );
  return data;
}
function parseDataSnapshot(snapshot) {
  return validateIncomingData(JSON.parse(snapshot));
}
function ui() {
  return state[UI];
}
function messagePlaceholders(value) {
  return [...String(value).matchAll(/\{([a-z0-9_]+)\}/gi)]
    .map((match) => match[1])
    .sort();
}
function normalizeLocalePack(parsed, id, requiredMessages = null) {
  if (
    parsed?.chronosLocale !== 1 ||
    typeof parsed.locale !== "string" ||
    typeof parsed.name !== "string" ||
    typeof parsed.shortLabel !== "string" ||
    !parsed.messages ||
    typeof parsed.messages !== "object" ||
    Array.isArray(parsed.messages)
  )
    return null;
  const messages = {};
  for (const [key, value] of Object.entries(parsed.messages)) {
    if (
      !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(key) ||
      typeof value !== "string" ||
      !value.trim()
    )
      return null;
    messages[key] = value;
  }
  const messageKeys = Object.keys(messages);
  if (!messageKeys.length) return null;
  if (requiredMessages) {
    const requiredKeys = Object.keys(requiredMessages);
    if (
      messageKeys.length !== requiredKeys.length ||
      requiredKeys.some((key) => !Object.hasOwn(messages, key))
    )
      return null;
    for (const key of requiredKeys) {
      if (
        JSON.stringify(messagePlaceholders(messages[key])) !==
        JSON.stringify(messagePlaceholders(requiredMessages[key]))
      )
        return null;
    }
  }
  const locale = parsed.locale.trim();
  const name = parsed.name.trim();
  const shortLabel = parsed.shortLabel.trim().toUpperCase().slice(0, 4);
  if (!locale || !name || !shortLabel) return null;
  try {
    new Intl.DateTimeFormat(locale).format(new Date());
  } catch (_) {
    return null;
  }
  return { id, locale, name, shortLabel, messages };
}

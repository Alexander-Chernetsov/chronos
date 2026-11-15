// Date and view helpers
function datePart(formatter, date, type) {
  return (
    formatter.formatToParts(date).find((part) => part.type === type)
      ?.value || ""
  ).replace(/\.$/, "");
}
function titleCase(value) {
  return value
    ? value[0].toLocaleUpperCase(APP_LOCALE) + value.slice(1)
    : value;
}
function shortWeekday(date) {
  return titleCase(dateFormatters.weekdayShort.format(date).replace(/\.$/, ""));
}
function shortMonth(date) {
  return datePart(dateFormatters.dayMonthShort, date, "month");
}
function longMonth(date) {
  return datePart(dateFormatters.dayMonthLong, date, "month");
}
function formatDateRange(first, last) {
  if (typeof dateFormatters.range.formatRange === "function")
    return dateFormatters.range.formatRange(first, last);
  return `${dateFormatters.range.format(first)} – ${dateFormatters.range.format(last)}`;
}
function calendarWeekdays() {
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return shortWeekday(date);
  });
}
function expandedViewActive() {
  return (
    [INBOX, CONTROL].includes(ui().expandedKey) ||
    isDateKey(ui().expandedKey)
  );
}
function preferredTodayIndex() {
  ui().todayColumnIndex = Math.max(
    1,
    Math.min(ui().dayCount, ui().todayColumnIndex || 2),
  );
  return ui().todayColumnIndex - 1;
}
function focusDate(d) {
  dayOffset =
    Math.round((d - todayStart()) / 86400000) - preferredTodayIndex();
}
function viewDates() {
  return Array.from({ length: ui().dayCount }, (_, i) =>
    addDays(dayOffset + i),
  );
}
function colTasks(key) {
  return state[key] || [];
}
function ensureColTasks(key) {
  return state[key] || (state[key] = []);
}
function isCollapsed(key) {
  return ui().collapsed.includes(key);
}
function setCollapsed(key, on) {
  ui().collapsed = on
    ? [...new Set([...ui().collapsed, key])]
    : ui().collapsed.filter((k) => k !== key);
  commit();
  requestAnimationFrame(() => {
    const column = findRenderedColumn(key);
    (on
      ? column
      : column?.querySelector(".col-header button.icon-btn"))?.focus({
      preventScroll: true,
    });
  });
}

function findRenderedTask(key, id) {
  return [...document.querySelectorAll(".task")].find(
    (node) =>
      node.dataset.key === key && String(node.dataset.id) === String(id),
  );
}
function findRenderedColumn(key) {
  return [...document.querySelectorAll(".column, .month-day")].find(
    (node) => node.dataset.key === key,
  );
}
// Rendering and layout
function captureTaskListScroll(board) {
  const positions = new Map();
  board
    .querySelectorAll(".column[data-key], .month-day[data-key]")
    .forEach((column) => {
      const list = column.querySelector(".task-list, .month-task-list");
      if (list) positions.set(column.dataset.key, list.scrollTop);
    });
  return positions;
}
function restoreTaskListScroll(board, positions) {
  board
    .querySelectorAll(".column[data-key], .month-day[data-key]")
    .forEach((column) => {
      if (!positions.has(column.dataset.key)) return;
      const list = column.querySelector(".task-list, .month-task-list");
      if (list) list.scrollTop = positions.get(column.dataset.key);
    });
}
function headerState(dates = viewDates()) {
  const expandedMode = expandedViewActive();
  const monthBase = ui().view === "month";
  const monthMode = !expandedMode && monthBase;
  const singleColumnExpanded =
    expandedMode && EXPANDED_SINGLE_COLUMN_QUERY.matches;
  const expandedKey = ui().expandedKey;
  const expandedDate = keyDate(expandedKey);
  return {
    expandedMode,
    dayCountKind: expandedMode
      ? tr("ui.cols", "")
      : monthMode
        ? tr("ui.month", "")
        : tr("ui.days", ""),
    dayCountValue: expandedMode
      ? singleColumnExpanded
        ? 1
        : ui().dayCount + 2
      : monthMode
        ? 1
        : ui().dayCount,
    dayCountLocked: singleColumnExpanded || monthMode,
    dayCountTitle: singleColumnExpanded
      ? tr("ui.one_column_on_narrow_screens", "")
      : expandedMode
        ? tr("ui.number_of_columns", "")
        : monthMode
          ? tr("ui.month_view", "")
          : tr("ui.number_of_days", ""),
    dayCountDecreaseLabel: expandedMode
      ? tr("ui.show_fewer_columns", "")
      : monthMode
        ? tr("ui.month_view_fixed", "")
        : tr("ui.show_fewer_days", ""),
    dayCountIncreaseLabel: expandedMode
      ? tr("ui.show_more_columns", "")
      : monthMode
        ? tr("ui.month_view_fixed", "")
        : tr("ui.show_more_days", ""),
    todayPositionValue: expandedMode || monthMode ? 1 : ui().todayColumnIndex,
    todayPositionLocked: expandedMode || monthMode,
    todayPositionTitle: expandedMode || monthMode
      ? tr("expanded.today_position_fixed", "")
      : tr("ui.todays_position", ""),
    previousDisabled:
      expandedMode &&
      (expandedKey === INBOX || (monthBase && expandedKey === CONTROL)),
    nextDisabled:
      expandedMode &&
      (expandedKey === CONTROL || (monthBase && expandedKey === INBOX)),
    previousLabel: expandedMode
      ? tr("ui.previous_column", "")
      : monthMode
        ? tr("ui.previous_month", "")
        : tr("ui.previous_day", ""),
    nextLabel: expandedMode
      ? tr("ui.next_column", "")
      : monthMode
        ? tr("ui.next_month", "")
        : tr("ui.next_day", ""),
    rangeLabel: expandedMode
      ? expandedKey === INBOX
        ? tr("ui.inbox", "")
        : expandedKey === CONTROL
          ? tr("ui.control", "")
          : dateFormatters.range.format(expandedDate)
      : monthMode
        ? titleCase(dateFormatters.monthYear.format(monthAnchor()))
        : formatDateRange(dates[0], dates.at(-1)),
  };
}
function syncHeaderView(header) {
  document.getElementById("dayCountLabel").textContent =
    header.dayCountValue;
  document.getElementById("todayPosLabel").textContent =
    header.todayPositionValue;
  const dayCountControl = document.getElementById("dayCountKind");
  dayCountControl.textContent = header.dayCountKind;
  dayCountControl.parentElement.title = header.dayCountTitle;
  const dayCountMinus = dayCountControl.parentElement.querySelector(
    '[data-action="days-minus"]',
  );
  const dayCountPlus = dayCountControl.parentElement.querySelector(
    '[data-action="days-plus"]',
  );
  dayCountMinus.disabled = header.dayCountLocked;
  dayCountPlus.disabled = header.dayCountLocked;
  dayCountMinus.setAttribute("aria-label", header.dayCountDecreaseLabel);
  dayCountPlus.setAttribute("aria-label", header.dayCountIncreaseLabel);
  const todayPositionControl = document.getElementById(
    "todayPositionControl",
  );
  todayPositionControl.title = header.todayPositionTitle;
  todayPositionControl.querySelector(
    '[data-action="today-pos-minus"]',
  ).disabled = header.todayPositionLocked;
  todayPositionControl.querySelector(
    '[data-action="today-pos-plus"]',
  ).disabled = header.todayPositionLocked;
  const previousButton = document.querySelector('[data-action="prev"]');
  const nextButton = document.querySelector('[data-action="next"]');
  previousButton.disabled = header.previousDisabled;
  nextButton.disabled = header.nextDisabled;
  previousButton.setAttribute("aria-label", header.previousLabel);
  nextButton.setAttribute("aria-label", header.nextLabel);
  document.getElementById("rangeLabel").textContent = header.rangeLabel;
}
function render() {
  closeColumnActionsPopover();
  const dates = viewDates();
  const markers = activeTaskMarkers();
  Object.entries(markers).forEach(([kind, entries]) => {
    const filter = taskMarkerFilters[kind];
    if (!filter || entries.some(({ key }) => key === filter)) return;
    taskMarkerFilters[kind] = "";
    if (!filterActive()) filterColumnWidth = null;
  });
  const filter = activeFilter();
  const header = headerState(dates);
  const { expandedMode } = header;
  syncHeaderView(header);
  syncColorSchemeToggle();
  syncHeaderCounters();
  syncSearchControl();
  syncTaskFilters();
  syncDimensionFilters(markers);
  syncViewToggle();
  syncLeftOverflowCount(dates[0], filter);
  updateHeaderPopoverBounds();
  const board = document.getElementById("board");
  board.inert = Boolean(loadSchemaError || document.querySelector(".modal-layer.open, .help-layer.open"));
  const taskListScroll = captureTaskListScroll(board);
  document.body.classList.toggle("expanded-view", expandedMode);
  board.classList.toggle("expanded-board-host", expandedMode);
  board.classList.toggle(
    "month-view",
    !expandedMode && ui().view === "month",
  );
  if (expandedMode) {
    fitColumns(board, dates.length + 2);
    board.style.setProperty(
      "--expanded-column-count",
      dates.length + 2,
    );
    board.style.removeProperty("--filter-column-width");
    renderExpandedColumn(board, filter);
    restoreTaskListScroll(board, taskListScroll);
    return;
  }
  if (ui().view === "month") {
    renderMonth(board, filter);
    restoreTaskListScroll(board, taskListScroll);
    return;
  }
  if (filterActive(filter)) {
    board.style.removeProperty("--column-min-width");
    board.classList.toggle(
      "compact-columns",
      (filterColumnWidth || DEFAULT_COLUMN_WIDTH) < DEFAULT_COLUMN_WIDTH,
    );
    board.style.setProperty(
      "--filter-column-width",
      `${filterColumnWidth || DEFAULT_COLUMN_WIDTH}px`,
    );
    const columns = filteredColumns(filter);
    const found = columns.reduce((sum, col) => sum + col.tasks.length, 0);
    document.getElementById("rangeLabel").textContent =
      found
        ? tr("board.search_results_columns", "", { 0: found, 1: columns.length })
        : tr("ui.no_results", "");
    board.replaceChildren(
      ...(columns.length
        ? columns.map(({ key, tasks }) =>
            column(key, columnKind(key), keyDate(key), tasks, true),
          )
        : [div("board-empty", tr("ui.no_results", ""))]),
    );
    restoreTaskListScroll(board, taskListScroll);
    return;
  }
  board.style.removeProperty("--filter-column-width");
  fitColumns(board, dates.length + 2);
  board.replaceChildren(
    column(INBOX, "inbox"),
    ...dates.map((d) => column(dateKey(d), "day", d)),
    column(CONTROL, "control"),
  );
  restoreTaskListScroll(board, taskListScroll);
}
function captureBoardReturnState() {
  const board = document.getElementById("board");
  return {
    view: ui().view,
    dayOffset,
    boardScrollLeft: board.scrollLeft,
    boardScrollTop: board.scrollTop,
    pageX: window.scrollX,
    pageY: window.scrollY,
    taskListScroll: captureTaskListScroll(board),
  };
}
function restoreBoardReturnState(saved) {
  if (!saved || saved.view !== ui().view) return;
  const board = document.getElementById("board");
  board.scrollLeft = saved.boardScrollLeft;
  board.scrollTop = saved.boardScrollTop;
  restoreTaskListScroll(board, saved.taskListScroll);
  window.scrollTo(saved.pageX, saved.pageY);
}
function openExpandedColumn(key) {
  if (![INBOX, CONTROL].includes(key) && !isDateKey(key)) return;
  if (!expandedViewActive()) expandedReturnState = captureBoardReturnState();
  ui().expandedKey = key;
  commit();
}
function closeExpandedColumn() {
  if (!expandedViewActive()) return;
  const closingKey = ui().expandedKey;
  const saved = expandedReturnState;
  expandedReturnState = null;
  ui().expandedKey = null;
  if (saved?.view === ui().view) dayOffset = saved.dayOffset;
  if (ui().view === "month" && isDateKey(closingKey))
    setMonthCursor(keyDate(closingKey));
  if (
    ui().view === "board" &&
    isDateKey(closingKey) &&
    !viewDates().some((date) => dateKey(date) === closingKey)
  )
    focusDate(keyDate(closingKey));
  save();
  render();
  requestAnimationFrame(() => restoreBoardReturnState(saved));
}
function toggleExpandedColumn(key) {
  if (focusPendingTaskDraft()) return;
  if (expandedViewActive()) closeExpandedColumn();
  else openExpandedColumn(key);
}
function goToday() {
  if (focusPendingTaskDraft()) return;
  if (expandedViewActive()) {
    ui().expandedKey = dateKey(todayStart());
    render();
    return;
  }
  if (ui().view === "month") setMonthCursor(todayStart());
  else focusDate(todayStart());
  render();
}
function stepVisibleDay(delta) {
  if (focusPendingTaskDraft()) return;
  if (!expandedViewActive()) {
    if (ui().view === "month") {
      stepMonth(delta);
      render();
      return;
    }
    dayOffset += delta;
    render();
    return;
  }
  const selectedKey = ui().expandedKey;
  if (ui().view === "month" && [INBOX, CONTROL].includes(selectedKey)) return;
  if (ui().view === "month" && isDateKey(selectedKey)) {
    const selectedDate = keyDate(selectedKey);
    selectedDate.setDate(selectedDate.getDate() + delta);
    ui().expandedKey = dateKey(selectedDate);
    render();
    return;
  }
  const dates = viewDates().map(dateKey);
  if (selectedKey === INBOX) {
    if (delta > 0) ui().expandedKey = dates[0];
  } else if (selectedKey === CONTROL) {
    if (delta < 0) ui().expandedKey = dates.at(-1);
  } else {
    const selectedIndex = dates.indexOf(selectedKey);
    if (selectedIndex === 0 && delta < 0) ui().expandedKey = INBOX;
    else if (selectedIndex === dates.length - 1 && delta > 0)
      ui().expandedKey = CONTROL;
    else {
      const selectedDate = keyDate(selectedKey) || todayStart();
      selectedDate.setDate(selectedDate.getDate() + delta);
      ui().expandedKey = dateKey(selectedDate);
    }
  }
  render();
}
function openShortcutTask(key, bulk = false) {
  if (focusPendingTaskDraft()) return;
  const date = keyDate(key);
  if (expandedViewActive()) ui().expandedKey = key;
  else if (date) focusDate(date);
  ui().collapsed = ui().collapsed.filter((collapsedKey) => collapsedKey !== key);
  commit();
  requestAnimationFrame(() => openNewTask(key, bulk));
}
function renderExpandedColumn(board, filter) {
  const key = ui().expandedKey;
  const allTasks = colTasks(key);
  const tasks = allTasks.filter((task) => taskInFilter(task, filter));
  const scene = column(
    key,
    columnKind(key),
    keyDate(key),
    tasks,
    filterActive(filter),
    true,
  );

  const shell = div("expanded-shell");
  shell.append(scene);
  board.replaceChildren(shell);
}
function fitColumns(board, count) {
  if (!count || window.matchMedia(`(max-width: ${COMPACT_BOARD_MAX_WIDTH}px)`).matches) {
    board.style.removeProperty("--column-min-width");
    board.classList.remove("compact-columns");
    return;
  }
  const style = getComputedStyle(board);
  const gap = parseFloat(style.columnGap || style.gap) || 0;
  const padding =
    (parseFloat(style.paddingLeft) || 0) +
    (parseFloat(style.paddingRight) || 0);
  const innerWidth = board.clientWidth - padding;
  const fit = Math.floor((innerWidth - gap * (count - 1)) / count);
  const width = Math.min(
    DEFAULT_COLUMN_WIDTH,
    Math.max(MIN_COLUMN_WIDTH, fit),
  );
  board.style.setProperty("--column-min-width", `${width}px`);
  board.classList.toggle("compact-columns", width < DEFAULT_COLUMN_WIDTH);
}
function scrollMobileToToday(behavior = "auto") {
  if (!EXPANDED_SINGLE_COLUMN_QUERY.matches) return;
  if (REDUCED_MOTION_QUERY.matches) behavior = "auto";
  requestAnimationFrame(() => {
    document
      .querySelector(".column.today")
      ?.scrollIntoView({ block: "nearest", inline: "start", behavior });
  });
}

// Header counters and task filtering
function updateHeaderCounter(id, n) {
  const el = document.getElementById(id);
  el.textContent = n || "";
  el.classList.toggle("show", n > 0);
}
function syncHeaderCounters() {
  const activeCount = Object.keys(state)
    .filter(isTaskColumn)
    .reduce((sum, key) => sum + colTasks(key).length, 0);
  const archiveCount = state[ARCHIVE].length;
  const trashCount = state[TRASH].length;
  const overdueCount = overdueTaskGroups().reduce(
    (sum, group) => sum + group.tasks.length,
    0,
  );
  updateHeaderCounter("archiveCount", archiveCount);
  updateHeaderCounter("trashCount", trashCount);
  updateHeaderCounter("overdueCount", overdueCount);
  const activeCountElement = document.getElementById("activeCount");
  const activeCountLabel = tr("stats.active_count", "", { 0: activeCount });
  activeCountElement.textContent = activeCount;
  activeCountElement.title = activeCountLabel;
  activeCountElement.setAttribute("aria-label", activeCountLabel);
  const overdueAction = document.getElementById("overdueAction");
  overdueAction.disabled = overdueCount === 0;
  overdueAction.classList.toggle("has-overdue", overdueCount > 0);
  overdueAction.title = overdueCount
    ? tr("overdue.summary", "", { 0: overdueCount })
    : tr("ui.no_overdue_tasks_shift_t", "");
  overdueAction.setAttribute(
    "aria-label",
    overdueCount
      ? tr("overdue.confirmation_title", "", { 0: overdueCount })
      : tr("ui.no_overdue_tasks_shift_t_aria_label", ""),
  );
  document
    .querySelector('[data-action="archive"]')
    .setAttribute("aria-label", tr("bins.done_count", "", { 0: archiveCount }));
  document
    .querySelector('[data-action="trash"]')
    .setAttribute("aria-label", tr("bins.trash_count", "", { 0: trashCount }));
}
function syncLeftOverflowCount(firstDate, filter) {
  if (ui().view === "month" && !expandedViewActive()) {
    document.getElementById("leftOverflowCount").classList.remove("show");
    return;
  }
  const firstKey = dateKey(firstDate);
  const count = Object.keys(state)
    .filter((key) => isDateKey(key) && key < firstKey)
    .reduce(
      (sum, key) =>
        sum +
        colTasks(key).filter((t) => taskInFilter(t, filter)).length,
      0,
    );
  const el = document.getElementById("leftOverflowCount");
  el.textContent = count || "";
  el.title = count
    ? tr("board.earlier_tasks_count", "", { 0: count })
    : "";
  el.setAttribute(
    "aria-label",
    count
      ? tr("board.earlier_tasks_count", "", { 0: count })
      : "",
  );
  el.classList.toggle("show", count > 0);
}
function taskInFilter(t, filter) {
  return filterActive(filter) ? taskMatchesFilter(t, filter) : true;
}
function syncSearchControl() {
  const input = document.getElementById("boardSearchInput");
  const trigger = document.getElementById("searchTrigger");
  if (input && input.value !== searchQuery) input.value = searchQuery;
  trigger.classList.toggle("active-toggle", Boolean(searchText()));
  trigger.setAttribute("aria-expanded", String(searchControlOpen()));
  const label = tr("ui.search_control_f", "") + (searchText() ? `: ${searchQuery}` : "");
  setTitleAndLabel(trigger, label);
}
function syncTaskFilters() {
  document.getElementById("clearFiltersButton").disabled = !filterActive();
  const editor = ui().filterLastEditor;
  const trigger = document.getElementById("editorFilterTrigger");
  const popover = document.getElementById("editorFilterPopover");
  const label =
    editor === "human"
      ? tr("ui.editor_user", "")
      : editor === "agent"
        ? tr("ui.editor_agent", "")
        : tr("ui.all", "");
  document.getElementById("editorFilterIcon").innerHTML =
    editorFilterIconMarkup(editor);
  trigger.classList.toggle("active-toggle", editor !== "all");
  setTitleAndLabel(trigger, tr("filters.last_editor_name", "", { 0: label }));
  trigger.setAttribute(
    "aria-expanded",
    String(popover.classList.contains("open")),
  );
  document.querySelectorAll("[data-editor-filter]").forEach((btn) => {
    const active = editor === btn.dataset.editorFilter;
    btn.classList.toggle("active-toggle", active);
    btn.setAttribute("aria-checked", String(active));
    btn.tabIndex = active ? 0 : -1;
  });
}
function editorFilterIconMarkup(value) {
  if (value === "human") return icons.human;
  if (value === "agent") return icons.robot;
  return `<span class="editor-filter-pair">${icons.human}${icons.robot}</span>`;
}
function searchControlOpen() {
  return document.getElementById("searchPopover").classList.contains("open");
}
function isTaskColumn(key) {
  return [INBOX, CONTROL].includes(key) || isDateKey(key);
}
function taskMarkerFilterEntries(markers) {
  return [...markers]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.label.localeCompare(b.label, APP_LOCALE));
}
function activeTaskMarkers() {
  const markers = Object.fromEntries(activeDimensions().map(symbol => [symbol, new Map()]));
  Object.keys(state).filter(isTaskColumn).forEach(key => colTasks(key).forEach(task => {
    const seen = new Set();
    parseTaskMarkers(task.text).parts.forEach(part => {
      if (part.type === "text" || seen.has(part.key)) return;
      seen.add(part.key);
      const entries = markers[part.symbol];
      const previous = entries.get(part.key);
      entries.set(part.key, {label: previous?.label || part.label, count: (previous?.count || 0) + 1});
    });
  }));
  return Object.fromEntries(Object.entries(markers).map(([symbol, values]) => [symbol, taskMarkerFilterEntries(values)]));
}
function searchText() {
  return foldForSearch(searchQuery.trim());
}
function foldForSearch(value) {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[\u00c0-\u024f]/g, (character) =>
      character.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    );
}
function activeFilter() {
  return {text: searchText(), markers: {...taskMarkerFilters}, lastEditor: ui().filterLastEditor};
}
function filterActive(filter = activeFilter()) {
  return Boolean(filter.text) || Object.values(filter.markers || {}).some(Boolean) ||
    ["human", "agent"].includes(filter.lastEditor);
}
function taskMatchesFilter(t, filter) {
  if (filter.text && !foldForSearch(t.text).includes(filter.text) && !foldForSearch(t.comment).includes(filter.text)) return false;
  const markers = parseTaskMarkers(t.text).markers;
  if (Object.values(filter.markers || {}).some(key => key && !markers.includes(key))) return false;
  if (filter.lastEditor === "agent" && !t.lastEditedByAgent) return false;
  if (filter.lastEditor === "human" && t.lastEditedByAgent) return false;
  return true;
}
function filteredColumns(filter) {
  const columns = [];
  Object.keys(state)
    .filter(isTaskColumn)
    .forEach((key) => {
      const matches = colTasks(key).filter((t) =>
        taskMatchesFilter(t, filter),
      );
      if (matches.length) columns.push({ key, tasks: matches });
    });
  return columns.sort((a, b) => columnSort(a.key) - columnSort(b.key));
}
function columnSort(key) {
  if (key === INBOX) return -Infinity;
  if (key === CONTROL) return Infinity;
  return isDateKey(key)
    ? parseDateKey(key).getTime()
    : Number.MAX_SAFE_INTEGER - 1;
}
function columnKind(key) {
  if (key === INBOX) return "inbox";
  if (key === CONTROL) return "control";
  return "day";
}
function keyDate(key) {
  return isDateKey(key) ? parseDateKey(key) : null;
}
function openSearch() {
  if (focusPendingTaskDraft()) return;
  closeDimensionManager();
  closeFilePopover();
  closeTaskMarkerFilterPopovers();
  closeEditorFilterPopover();
  closeColumnActionsPopover();
  closeTaskMenu();
  closeSettingsPopover();
  hideDatePopover();
  const input = document.getElementById("boardSearchInput");
  showHeaderPopover(document.getElementById("searchPopover"));
  syncSearchControl();
  input.focus({ preventScroll: true });
}
function closeSearch(returnFocus = false) {
  if (!searchControlOpen()) return;
  hideHeaderPopover(document.getElementById("searchPopover"));
  syncSearchControl();
  if (returnFocus) document.getElementById("searchTrigger").focus({ preventScroll: true });
}
function setSearch(query) {
  if (focusPendingTaskDraft()) {
    syncSearchControl();
    return;
  }
  if (!filterActive() && query.trim()) lockFilterColumnWidth();
  searchQuery = query;
  if (!filterActive()) filterColumnWidth = null;
  render();
}

function editorFilterPopoverOpen() {
  return document
    .getElementById("editorFilterPopover")
    .classList.contains("open");
}
function toggleEditorFilterPopover() {
  closeDimensionManager();
  closeTaskMarkerFilterPopovers();
  const popover = document.getElementById("editorFilterPopover");
  const open = !popover.classList.contains("open");
  if (open) showHeaderPopover(popover);
  else hideHeaderPopover(popover);
  document
    .getElementById("editorFilterTrigger")
    .setAttribute("aria-expanded", String(open));
  if (open) {
    requestAnimationFrame(() =>
      popover
        .querySelector('[aria-checked="true"]')
        ?.focus({ preventScroll: true }),
    );
  }
}
function closeEditorFilterPopover(returnFocus = false) {
  const popover = document.getElementById("editorFilterPopover");
  if (!popover.classList.contains("open")) return;
  hideHeaderPopover(popover);
  const trigger = document.getElementById("editorFilterTrigger");
  trigger.setAttribute("aria-expanded", "false");
  if (returnFocus) trigger.focus({ preventScroll: true });
}
function setLastEditorFilter(value) {
  if (focusPendingTaskDraft()) return;
  if (ui().filterLastEditor === value) {
    closeEditorFilterPopover(true);
    return;
  }
  if (!filterActive() && value !== "all") lockFilterColumnWidth();
  ui().filterLastEditor = value;
  if (!filterActive()) filterColumnWidth = null;
  closeEditorFilterPopover(true);
  commit();
}
function taskMarkerFilterElements(symbol) {
  const control = [...document.querySelectorAll(".task-marker-filter-control")].find(el => el.dataset.dimension === symbol);
  return control ? {control, trigger: control.querySelector(".task-marker-filter-trigger"), popover: control.querySelector(".task-marker-filter-popover"), options: control.querySelector(".task-marker-filter-popover-actions")} : {};
}
function openTaskMarkerFilterKind() {
  return activeDimensions().find(symbol => taskMarkerFilterElements(symbol).popover?.classList.contains("open"));
}
function updateHeaderPopoverBounds() {
  const header = document.querySelector(".app-header").getBoundingClientRect();
  const top = header.bottom + 8;
  document.documentElement.style.setProperty("--header-popup-top", `${top}px`);
  document.documentElement.style.setProperty("--header-popup-space", `${Math.max(0, document.documentElement.clientHeight - top - 8)}px`);
  const buttons = [...document.querySelectorAll(".header-actions button")]
    .filter(button => !button.closest("[data-header-popover]"))
    .map(button => button.getBoundingClientRect())
    .filter(rect => rect.width && rect.height);
  document.querySelectorAll(".task-marker-filter-popover.open, .editor-filter-popover.open, .search-popover.open").forEach(popover => {
    const trigger = document.querySelector(`[aria-controls="${popover.id}"]`).getBoundingClientRect();
    const lowerRow = buttons.some(rect => rect.top + rect.height / 2 > trigger.bottom + 2);
    const menuTop = (lowerRow ? header.bottom : trigger.bottom) + 8;
    const left = Math.max(8, Math.min(trigger.left, document.documentElement.clientWidth - popover.getBoundingClientRect().width - 8));
    Object.assign(popover.style, {
      top: `${menuTop}px`, left: `${left}px`, right: "auto",
      maxHeight: `${Math.max(0, document.documentElement.clientHeight - menuTop - 8)}px`,
    });
  });
}
function showHeaderPopover(popover) {
  if (popover.id !== "searchPopover") closeSearch();
  popover.setAttribute("popover", "manual");
  popover.setAttribute("data-header-popover", "");
  popover.classList.add("open");
  if (!popover.matches(":popover-open")) popover.showPopover();
  syncHeaderPopoverState();
  updateHeaderPopoverBounds();
}
function hideHeaderPopover(popover) {
  if (popover.matches(":popover-open")) popover.hidePopover();
  popover.classList.remove("open");
  syncHeaderPopoverState();
}
function closeHeaderPopovers() {
  closeSearch();
  closeTaskMarkerFilterPopovers();
  closeEditorFilterPopover();
  closeDimensionManager();
  closeSettingsPopover();
  closeFilePopover();
}
function toggleTaskMarkerFilterPopover(kind) {
  if (focusPendingTaskDraft()) return;
  const { trigger, popover } = taskMarkerFilterElements(kind);
  if (!trigger || trigger.disabled) return;
  closeDimensionManager();
  closeSettingsPopover();
  closeEditorFilterPopover();
  activeDimensions()
    .filter((otherKind) => otherKind !== kind)
    .forEach((otherKind) => closeTaskMarkerFilterPopover(otherKind));
  const open = !popover.classList.contains("open");
  if (open) showHeaderPopover(popover);
  else hideHeaderPopover(popover);
  trigger.setAttribute("aria-expanded", String(open));
  if (open) {
    requestAnimationFrame(() => {
      (popover.querySelector('[aria-pressed="true"]') ||
        popover.querySelector("button:not(:disabled)"))
        ?.focus({ preventScroll: true });
    });
  }
}
function closeTaskMarkerFilterPopover(kind, returnFocus = false) {
  const { trigger, popover } = taskMarkerFilterElements(kind);
  if (!popover) return;
  const wasOpen = popover.classList.contains("open");
  if (wasOpen) {
    hideHeaderPopover(popover);
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus({ preventScroll: true });
  }
  syncHeaderPopoverState();
}
function closeTaskMarkerFilterPopovers() {
  activeDimensions().forEach((kind) => closeTaskMarkerFilterPopover(kind));
  syncHeaderPopoverState();
}
function syncHeaderPopoverState() {
  document.querySelector(".header-actions").classList.toggle(
    "header-popover-open", Boolean(document.querySelector("[data-header-popover].open")),
  );
}
function setTaskMarkerFilter(kind, value) {
  if (focusPendingTaskDraft()) return;
  const next = taskMarkerFilters[kind] === value ? "" : value;
  if (!filterActive() && next) lockFilterColumnWidth();
  taskMarkerFilters[kind] = next;
  if (!filterActive()) filterColumnWidth = null;
  closeTaskMarkerFilterPopover(kind, true);
  render();
}
function syncTaskMarkerFilterControl(symbol, entries) {
  const {trigger, options, popover} = taskMarkerFilterElements(symbol);
  const selected = taskMarkerFilters[symbol];
  const label = entries.find(entry => entry.key === selected)?.label;
  trigger.disabled = !entries.length;
  trigger.classList.toggle("active-toggle", Boolean(selected));
  const dot = span("task-marker-filter-dot");
  dot.hidden = !selected;
  dot.setAttribute("aria-hidden", "true");
  trigger.replaceChildren(span("task-marker-filter-glyph", symbol), dot);
  setTitleAndLabel(trigger, tr("dimensions.filter", "", {0: symbol, 1: label || tr("ui.all", "")}));
  const selection = popover.querySelector(".task-marker-filter-selection");
  selection.hidden = !selected;
  const selectedValue = selected ? symbol + (label || selected.slice(symbol.length)) : "";
  const selectedLabel = span("task-marker-filter-selected", selectedValue);
  selectedLabel.title = tr("dimensions.selected", "", {0: selectedValue});
  const clear = document.createElement("button");
  clear.className = "task-marker-filter-option task-marker-filter-clear neutral-action";
  clear.type = "button";
  clear.textContent = "×";
  clear.disabled = !selected;
  setTitleAndLabel(clear, `${tr("dimensions.clear_filter", "")} ${symbol}`);
  clear.onclick = () => setTaskMarkerFilter(symbol, selected);
  selection.replaceChildren(selectedLabel, clear);
  options.replaceChildren();
  entries.forEach(({key, label, count}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "task-marker-filter-option";
    button.dataset.action = "set-task-marker-filter";
    button.dataset.markerKind = symbol;
    button.dataset.markerKey = key;
    button.setAttribute("aria-pressed", String(selected === key));
    button.classList.toggle("active-toggle", selected === key);
    setTitleAndLabel(button, tr("dimensions.option", "", {0: label, 1: count}));
    button.append(span("task-marker-filter-option-label", label), span("task-marker-filter-option-count", count));
    options.append(button);
  });
}
function clearAllFilters() {
  if (focusPendingTaskDraft()) return;
  const persistentFilterActive = ui().filterLastEditor !== "all";
  searchQuery = "";
  taskMarkerFilters = {};
  ui().filterLastEditor = "all";
  filterColumnWidth = null;
  if (persistentFilterActive) commit();
  else render();
}
function lockFilterColumnWidth() {
  const col = document.querySelector(
    ".board:not(.expanded-board-host) .column:not(.collapsed)",
  );
  const width = col?.getBoundingClientRect().width;
  filterColumnWidth = width ? Math.round(width) : DEFAULT_COLUMN_WIDTH;
}
function jumpToLeftOverflow() {
  if (focusPendingTaskDraft()) return;
  const firstKey = dateKey(viewDates()[0]);
  const filter = activeFilter();
  const key = Object.keys(state)
    .filter(
      (key) =>
        isDateKey(key) &&
        key < firstKey &&
        colTasks(key).some((t) => taskInFilter(t, filter)),
    )
    .sort()[0];
  if (!key) return;
  if (expandedViewActive()) {
    ui().expandedKey = key;
    render();
    return;
  }
  dayOffset = Math.round(
    (parseDateKey(key) - todayStart()) / 86400000,
  );
  render();
}

// Columns and tasks
function column(
  key,
  kind,
  date,
  shownTasks = null,
  filtered = false,
  expanded = false,
) {
  const fixed = kind === "inbox" || kind === "control",
    tasks = shownTasks || colTasks(key),
    collapsed = !expanded && isCollapsed(key),
    name =
      kind === "inbox"
        ? tr("ui.inbox", "")
        : kind === "control"
          ? tr("ui.control", "")
          : dayTitle(date);
  const isToday = kind === "day" && dateKey(todayStart()) === key;
  const el = div(
    "column column-surface " +
      (fixed ? "fixed " : "") +
      (isToday ? "today " : "") +
      (filtered && !expanded ? "filtered " : "") +
      (collapsed ? "collapsed " : "") +
      (expanded ? "expanded-column" : ""),
  );
  el.dataset.key = key;
  if (isToday) el.setAttribute("aria-current", "date");
  if (collapsed) {
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", tr("column.reveal_name", "", { 0: name }));
    el.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      setCollapsed(key, false);
    });
    el.addEventListener("click", () => setCollapsed(key, false));
  } else {
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", name);
  }
  el.append(header(key, kind, date, tasks, expanded, !collapsed));
  if (collapsed) return el;
  const list = div("task-list");
  list.dataset.key = key;
  list.setAttribute("role", "list");
  list.setAttribute("aria-label", tr("column.task_count", "", { 0: name }));
  tasks.forEach((t) => list.append(taskEl(key, t, filtered)));
  if (canAddTaskTo(key)) list.append(quickTaskAddControl(key));
  if (canAddTaskTo(key)) el.append(newTaskPanel(key));
  el.append(list);
  return el;
}
function header(
  key,
  kind,
  date,
  tasks,
  expanded = false,
  titleToggle = true,
) {
  const n = tasks.length;
  const name =
    kind === "inbox"
      ? tr("ui.inbox", "")
      : kind === "control"
        ? tr("ui.control", "")
        : dayTitle(date);
  const h = div("col-header"),
    title = div("col-title"),
    stats = columnStatsEl(n);
  title.innerHTML =
    kind === "inbox"
      ? `${icons.inbox}${expanded ? `<span class="expanded-service-title">${trHtml("ui.inbox", "")}</span>` : ""}`
      : kind === "control"
        ? `${icons.control}${expanded ? `<span class="expanded-service-title">${trHtml("ui.control", "")}</span>` : ""}`
        : expanded
          ? `<span class="day-name">${dateFormatters.weekdayLong.format(date)}</span><span class="day-num">${date.getDate()}</span><span class="day-month">${longMonth(date)} ${date.getFullYear()}</span>`
          : `<span class="day-name">${shortWeekday(date)}</span><span class="day-num">${date.getDate()}</span><span class="day-month">${shortMonth(date)}</span>`;
  if (titleToggle) bindColumnTitleToggle(title, key, name, expanded);
  const context = { key, kind, name, taskCount: n, expanded };
  if (expanded) {
    const inlineActions = div("expanded-column-actions");
    inlineActions.append(
      ...columnActionSpecs(context).map((spec) =>
        iconButton(spec.html, spec.title, spec.action, spec.extra || ""),
      ),
    );
    h.append(title, stats, inlineActions);
    return h;
  }
  const actionsTrigger = iconButton(
    icons.more,
    tr("column.actions_for_name", "", { 0: name }),
    (event) =>
      toggleColumnActionsPopover(context, event.currentTarget),
    "column-actions-trigger",
  );
  actionsTrigger.setAttribute("aria-haspopup", "menu");
  actionsTrigger.setAttribute("aria-expanded", "false");
  actionsTrigger.setAttribute("aria-controls", "columnActionsPopover");
  h.append(title, stats, actionsTrigger);
  return h;
}
function bindColumnTitleToggle(title, key, name, expanded) {
  const actionLabel = expanded
    ? ui().view === "month"
      ? tr("ui.return_to_month_action", "")
      : tr("ui.return_to_board_action", "")
    : tr("column.expand_name", "", { 0: name });
  title.tabIndex = 0;
  title.setAttribute("role", "button");
  title.setAttribute("aria-label", actionLabel);
  title.title = actionLabel;
  title.addEventListener("click", () => toggleExpandedColumn(key));
  title.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    toggleExpandedColumn(key);
    requestAnimationFrame(() => {
      findRenderedColumn(key)
        ?.querySelector('.col-title[role="button"]')
        ?.focus({ preventScroll: true });
    });
  });
}
function quickTaskAddControl(key, extra = "") {
  const item = div(`quick-task-add ${extra}`.trim());
  item.setAttribute("role", "listitem");
  item.append(
    iconButton(
      icons.plus,
      tr("ui.add_task", ""),
      () => openNewTask(key),
      "quick-task-add-button",
    ),
  );
  return item;
}
function columnStatsEl(count) {
  const wrap = span("col-stats");
  const el = span(
    `icon-btn col-stat stat-active${count ? "" : " is-zero"}`,
    String(count),
  );
  setTitleAndLabel(el, tr("stats.active_count", "", {0: count}));
  wrap.append(el);
  return wrap;
}
function columnActionsPopoverOpen() {
  return document
    .getElementById("columnActionsPopover")
    .classList.contains("open");
}
function closeColumnActionsPopover(returnFocus = false) {
  const popover = document.getElementById("columnActionsPopover");
  if (!popover.classList.contains("open")) return;
  popover.classList.remove("open");
  popover.style.removeProperty("left");
  popover.style.removeProperty("top");
  columnActionsTrigger?.setAttribute("aria-expanded", "false");
  if (returnFocus && columnActionsTrigger?.isConnected)
    columnActionsTrigger.focus({ preventScroll: true });
  columnActionsTrigger = null;
}
function positionColumnActionsPopover(trigger) {
  const popover = document.getElementById("columnActionsPopover");
  const triggerRect = trigger.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const left = Math.min(
    viewportWidth - popoverRect.width - 8,
    Math.max(8, triggerRect.right - popoverRect.width),
  );
  const below = triggerRect.bottom + 8;
  const top =
    below + popoverRect.height <= viewportHeight - 8
      ? below
      : Math.max(8, triggerRect.top - popoverRect.height - 8);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}
function columnActionSpecs(context) {
  const specs = canAddTaskTo(context.key)
    ? [
        {
          html: icons.plus,
          title: tr("ui.add_task", ""),
          action: () => openNewTask(context.key),
        },
        {
          html: icons.actions,
          title: tr("ui.add_list", ""),
          action: () => openNewTask(context.key, true),
        },
      ]
    : [];
  if (context.kind === "day" && context.taskCount > 0)
    specs.push({
      html: icons.copy,
      title: tr("ui.copy_day_to_clipboard", ""),
      action: (event) =>
        copyDayToClipboard(context.key, event.currentTarget),
      extra: "file-save",
      closeAfterAction: true,
    });
  if (!context.expanded && ui().view !== "month")
    specs.push({
      html: icons.collapseRail,
      title: tr("ui.collapse_column", ""),
      action: () => setCollapsed(context.key, true),
    });
  return specs;
}
function columnPopoverButton(
  html,
  title,
  action,
  extra = "",
  closeAfterAction = false,
) {
  const button = iconButton(
    html,
    title,
    (event) => {
      if (!closeAfterAction) {
        closeColumnActionsPopover();
        action(event);
        return;
      }
      Promise.resolve(action(event)).finally(() =>
        closeColumnActionsPopover(),
      );
    },
    extra,
  );
  button.setAttribute("role", "menuitem");
  return button;
}
function toggleColumnActionsPopover(context, trigger) {
  if (focusPendingTaskDraft()) return;
  const popover = document.getElementById("columnActionsPopover");
  if (popover.classList.contains("open") && columnActionsTrigger === trigger) {
    closeColumnActionsPopover(true);
    return;
  }
  closeColumnActionsPopover();
  closeFilePopover();
  closeEditorFilterPopover();
  closeTaskMenu();
  hideDatePopover();
  columnActionsTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  const actions = document.getElementById("columnActionsPopoverActions");
  actions.replaceChildren(
    ...columnActionSpecs(context).map((spec) =>
      columnPopoverButton(
        spec.html,
        spec.title,
        spec.action,
        spec.extra || "",
        spec.closeAfterAction === true,
      ),
    ),
  );
  popover.classList.add("open");
  requestAnimationFrame(() => {
    positionColumnActionsPopover(trigger);
    actions
      .querySelector('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  });
}

function syncDimensionFilters(markers = activeTaskMarkers()) {
  document.getElementById("dimensionManagerToggle").disabled = Boolean(loadSchemaError);
  const host = document.getElementById("dimensionFilterControls");
  const symbols = activeDimensions();
  if (JSON.stringify([...host.children].map(el => el.dataset.dimension)) !== JSON.stringify(symbols)) {
    host.replaceChildren(...symbols.map((symbol, index) => {
      const control = div("task-marker-filter-control");
      control.dataset.dimension = symbol;
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "icon-btn task-marker-filter-trigger";
      trigger.dataset.action = "toggle-task-marker-filter-popover";
      trigger.dataset.markerKind = symbol;
      trigger.setAttribute("aria-expanded", "false");
      const popover = div("task-marker-filter-popover");
      popover.id = `taskMarkerFilterPopover${index}`;
      trigger.setAttribute("aria-controls", popover.id);
      popover.append(div("task-marker-filter-selection"), div("task-marker-filter-popover-actions"));
      control.append(trigger, popover);
      return control;
    }));
  }
  symbols.forEach(symbol => {
    const {control} = taskMarkerFilterElements(symbol);
    control.style.setProperty("--marker-hue", dimensionHue(symbol));
    syncTaskMarkerFilterControl(symbol, markers[symbol] || []);
  });
}

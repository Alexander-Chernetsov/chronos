// Month overview
function monthAnchor() {
  if (!(monthCursor instanceof Date) || Number.isNaN(monthCursor.getTime()))
    setMonthCursor(todayStart());
  return monthCursor;
}
function setMonthCursor(date) {
  monthCursor = new Date(date.getFullYear(), date.getMonth(), 1);
}
function stepMonth(delta) {
  const current = monthAnchor();
  monthCursor = new Date(
    current.getFullYear(),
    current.getMonth() + delta,
    1,
  );
}
function monthDates() {
  const first = monthAnchor();
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const count = Math.ceil(
    (last.getDate() + ((first.getDay() + 6) % 7)) / 7,
  ) * 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}
function toggleView() {
  if (focusPendingTaskDraft()) return;
  ui().view = ui().view === "month" ? "board" : "month";
  if (ui().view === "month") monthAnchor();
  commit();
}
function viewToggleState() {
  const monthMode = ui().view === "month";
  return {
    monthMode,
    iconName: monthMode ? "viewBoard" : "viewMonth",
    icon: monthMode ? icons.viewBoard : icons.viewMonth,
    label: monthMode
      ? tr("ui.return_to_board_action", "")
      : tr("ui.month_view", ""),
  };
}
function syncViewToggle() {
  const button = document.getElementById("viewToggle");
  const { monthMode, icon, label } = viewToggleState();
  button.classList.toggle("active-toggle", monthMode);
  button.innerHTML = icon;
  setTitleAndLabel(button, label);
}
function renderMonth(board, filter) {
  const dates = monthDates();
  const currentMonth = monthAnchor().getMonth();
  const currentYear = monthAnchor().getFullYear();
  board.classList.remove("compact-columns");
  board.style.removeProperty("--column-min-width");
  board.style.removeProperty("--filter-column-width");
  board.style.setProperty("--month-week-count", dates.length / 7);
  board.replaceChildren(
    ...dates.map((date) =>
      monthDay(date, currentMonth, currentYear, filter),
    ),
  );
}
function monthDay(date, currentMonth, currentYear, filter) {
  const key = dateKey(date);
  const tasks = colTasks(key).filter((item) => taskInFilter(item, filter));
  const inCurrentMonth =
    date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  const day = div(
    `month-day column-surface ${inCurrentMonth ? "current-month" : "adjacent-month"}${key === dateKey(todayStart()) ? " today" : ""}`,
  );
  day.dataset.key = key;
  if (key === dateKey(todayStart())) day.setAttribute("aria-current", "date");
  day.setAttribute(
    "aria-label",
    tr("month.day_label", "", {
      0: dateFormatters.fullDate.format(date),
      1: tasks.length,
    }),
  );
  const dayHeader = header(key, "day", date, tasks);
  const list = div("month-task-list");
  list.setAttribute("role", "list");
  list.setAttribute(
    "aria-label",
    tr("column.task_count", "", { 0: dayTitle(date) }),
  );
  tasks.forEach((item) => list.append(monthTask(key, item)));
  if (!tasks.length && canAddTaskTo(key)) {
    list.classList.add("is-empty");
    list.append(quickTaskAddControl(key, "month-empty-add"));
  }
  day.append(dayHeader, list);
  return day;
}
function monthTask(key, item) {
  const listItem = div("month-task-item");
  listItem.setAttribute("role", "listitem");
  const button = document.createElement("button");
  button.className = "month-task";
  button.type = "button";
  button.title = item.text;
  button.setAttribute("aria-label", item.text);
  if (item.lastEditedByAgent)
    button.append(lastEditorMark(false));
  const text = span("month-task-text");
  renderTaskMarkerParts(text, parseTaskMarkers(item.text), "month-task-marker");
  button.append(text);
  button.addEventListener("click", () => {
    openExpandedColumn(key);
    requestAnimationFrame(() => {
      const renderedTask = findRenderedTask(key, item.id);
      if (!renderedTask) return;
      renderedTask.tabIndex = -1;
      renderedTask.focus({ preventScroll: false });
    });
  });
  listItem.append(button);
  return listItem;
}

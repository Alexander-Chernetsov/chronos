// Task creation, cards, clipboard, and drag-and-drop
let markerSuggestionClose = null;
function closeMarkerSuggestions() {
  markerSuggestionClose?.();
}
function attachMarkerSuggestions(input) {
  if (input.dataset.markerSuggestions) return;
  input.dataset.markerSuggestions = "true";
  let menu = null,
    entries = [],
    selected = -1,
    context = null,
    blurTimer = null;
  const getText = () => input.isContentEditable ? input.textContent : input.value;
  function caretOffset() {
    if (!input.isContentEditable)
      return input.selectionStart === input.selectionEnd ? input.selectionStart : null;
    const selection = getSelection();
    if (!selection.rangeCount || !input.contains(selection.anchorNode)) return null;
    const range = selection.getRangeAt(0).cloneRange();
    if (!range.collapsed) return null;
    range.selectNodeContents(input);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  }
  function close() {
    menu?.remove();
    menu = null;
    entries = [];
    selected = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-controls");
    input.removeAttribute("aria-activedescendant");
    if (markerSuggestionClose === close) markerSuggestionClose = null;
  }
  function choose(entry) {
    if (!context) return;
    const text = getText();
    const offset = caretOffset();
    if (offset === null || offset !== context.offset || text !== context.text)
      return close();
    const rest = text.slice(offset);
    const tail = rest.match(/^[\p{L}\p{N}\p{M}\p{S}_\-\u200D\uFE0F]*/u)[0].length;
    const suffix = rest.slice(tail);
    const insertion =
      context.symbol + entry.label +
      (suffix && /^[\s,.;:!?]/u.test(suffix) ? "" : " ");
    const next = text.slice(0, context.start) + insertion + suffix;
    const caret = context.start + insertion.length;
    close();
    input.focus();
    if (input.isContentEditable) {
      input.textContent = next;
      const range = document.createRange();
      range.setStart(input.firstChild, caret);
      range.collapse(true);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      input.value = next;
      input.setSelectionRange(caret, caret);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  }
  function update() {
    clearTimeout(blurTimer);
    close();
    const offset = caretOffset();
    if (offset === null) return;
    const word = getText().slice(0, offset).match(/(?:^|\s)(\S*)$/u)?.[1];
    if (!word) return;
    const symbol = [...word][0];
    if (!activeDimensions().includes(symbol)) return;
    const fragment = word.slice(symbol.length);
    if (!/^[\p{L}\p{N}\p{M}\p{S}_\-\u200D\uFE0F]*$/u.test(fragment)) return;
    entries = (activeTaskMarkers()[symbol] || []).filter((entry) =>
      normalizeTaskMarker(entry.label).startsWith(normalizeTaskMarker(fragment)),
    );
    if (!entries.length) return;
    closeMarkerSuggestions();
    context = { symbol, start: offset - word.length, offset, text: getText() };
    selected = 0;
    menu = div("marker-suggestions");
    menu.id = "markerSuggestions";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", tr("dimensions.suggestions", "", { 0: symbol }));
    entries.forEach((entry, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.id = `markerSuggestion${index}`;
      option.className = "task-marker-filter-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === selected));
      option.textContent = symbol + entry.label;
      option.onmousedown = (event) => event.preventDefault();
      option.onpointerdown = (event) => event.stopPropagation();
      option.onclick = (event) => {
        event.stopPropagation();
        choose(entry);
      };
      menu.append(option);
    });
    document.body.append(menu);
    const rect = input.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    menu.style.left = `${Math.max(
      8, Math.min(rect.left, viewportWidth - menu.offsetWidth - 8),
    )}px`;
    menu.style.top = `${Math.max(
      8,
      rect.bottom + 4 + menu.offsetHeight > window.innerHeight - 8
        ? rect.top - menu.offsetHeight
        : rect.bottom + 4,
    )}px`;
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", menu.id);
    input.setAttribute("aria-activedescendant", menu.children[0].id);
    markerSuggestionClose = close;
  }
  input.setAttribute("aria-autocomplete", "list");
  input.addEventListener("input", update);
  input.addEventListener("click", update);
  input.addEventListener("focus", () => clearTimeout(blurTimer));
  input.addEventListener("blur", () => {
    blurTimer = setTimeout(() => {
      if (document.activeElement !== input) close();
    }, 120);
  });
  input.addEventListener("keydown", (event) => {
    if (!menu?.isConnected || event.isComposing) return;
    if (
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
      (event.shiftKey && ["ArrowUp", "ArrowDown"].includes(event.key)) ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a")
    ) {
      close();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length;
      [...menu.children].forEach((option, index) =>
        option.setAttribute("aria-selected", String(index === selected)),
      );
      input.setAttribute("aria-activedescendant", menu.children[selected].id);
      menu.children[selected].scrollIntoView({ block: "nearest" });
    } else if (
      event.key === "Enter" && !event.shiftKey &&
      !event.ctrlKey && !event.metaKey && selected >= 0
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      choose(entries[selected]);
    }
  }, true);
}
function newTaskPanel(key) {
  const p = div("new-task-panel");
  p.dataset.key = key;
  p.innerHTML =
    `<textarea class="new-task-input" placeholder="${trHtml("bulk_add.each_line_hint", "")}" aria-label="${trHtml("bulk_add.placeholder", "")}"></textarea><div class="new-actions"><button class="btn btn-primary">${trHtml("bulk_add.add", "")}</button><button class="btn btn-ghost">${trHtml("ui.cancel", "")}</button></div>`;
  attachMarkerSuggestions(p.querySelector("textarea"));
  p.querySelector(".btn-primary").onclick = () => {
    if (!canAddTaskTo(key)) return;
    const lines = p
      .querySelector("textarea")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    lines
      .reverse()
      .forEach((line) => ensureColTasks(key).unshift(taskFromFilter(line)));
    p.querySelector("textarea").value = "";
    p.classList.remove("open");
    commit();
  };
  p.querySelector(".btn-ghost").onclick = () =>
    p.classList.remove("open");
  return p;
}
function openNewTask(key, bulk = false) {
  if (loadSchemaError) return;
  if (!canAddTaskTo(key)) return;
  if (ui().view === "month" && !expandedViewActive()) {
    openExpandedColumn(key);
    requestAnimationFrame(() => openNewTask(key, bulk));
    return;
  }
  if (!bulk) {
    const filter = activeFilter();
    ensureColTasks(key).unshift(
      taskFromFilter(filter.text || tr("ui.new_task", "")),
    );
    commit();
    requestAnimationFrame(() => {
      const col = document.querySelector(
        `.column[data-key="${key}"]`,
      );
      const text = col?.querySelector(
        ".task-list .task:first-child .task-text",
      );
      if (text) {
        text.focus();
        const range = document.createRange();
        range.selectNodeContents(text);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    return;
  }
  const col = document.querySelector(
    `.column[data-key="${key}"]`,
  );
  const p = col.querySelector(".new-task-panel");
  p.classList.add("open");
  p.querySelector("textarea").focus();
}
function taskFromFilter(text, filter = activeFilter()) {
  const markers = parseTaskMarkers(text).markers;
  const entries = activeTaskMarkers();
  const inherited = Object.entries(filter.markers || {})
    .filter(([, key]) => key && !markers.includes(key))
    .map(([symbol, key]) =>
      symbol + (entries[symbol]?.find((entry) => entry.key === key)?.label ||
        key.slice(symbol.length)),
    );
  const item = task(inherited.length ? `${inherited.join(" ")} ${text}` : text);
  if (filter.lastEditor === "agent") {
    ui().filterLastEditor = "all";
    if (!filterActive()) filterColumnWidth = null;
  }
  return item;
}
function taskEl(key, t, matched = false) {
  const el = div(
    [
      "task",
      matched && "search-match",
    ]
      .filter(Boolean)
      .join(" "),
  );
  el.draggable = false;
  el.setAttribute("role", "listitem");
  el.dataset.id = t.id;
  el.dataset.key = key;
  const text = div("task-text");
  text.contentEditable = true;
  text.setAttribute("role", "textbox");
  const titleRow = div("task-title-row");
  if (t.lastEditedByAgent) titleRow.append(lastEditorMark());
  titleRow.append(text);
  renderTaskTitleView(text, t);
  text.onpointerdown = () => beginTaskTextEdit(text, t);
  text.onfocus = () => {
    beginTaskTextEdit(text, t);
    focusPendingTaskDraft();
  };
  text.onblur = () => {
    const v = text.textContent.trim();
    if (v === (t.text || "").trim()) {
      renderTaskTitleView(text, t);
      return;
    }
    if (!v) return trashTask(key, t.id);
    setTaskText(t, v);
    save();
    if (filterActive()) render();
    else {
      syncTaskEditorView(key, t.id, t);
      const markers = activeTaskMarkers();
      syncDimensionFilters(markers);
    }
  };
  attachMarkerSuggestions(text);
  text.onkeydown = (e) => {
    if (e.target !== text || e.isComposing) return;
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      text.blur();
      if (e.shiftKey) openTaskEditor(key, t.id);
    }
  };
  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "comment-preview " + (t.comment ? "show" : "");
  preview.textContent = t.comment ? t.comment.split("\n")[0] : "";
  setTitleAndLabel(preview, `${tr("ui.comment", "")}: ${preview.textContent}`);
  preview.onpointerdown = event => event.stopPropagation();
  preview.onclick = () => openTaskEditor(key, t.id);
  const actions = div("task-action-drawer");
  const done = iconButton(
    icons.check,
    tr("task.mark_done_title", "", { 0: t.text || tr("ui.untitled", "") }),
    () => archiveTask(key, t.id),
    "task-done-action",
  );
  const menuButton = iconButton(
    "⋯",
    tr("ui.task_actions", ""),
    (event) => showMenu(event, key, t.id, event.currentTarget),
    "task-menu-trigger",
  );
  menuButton.setAttribute("aria-haspopup", "menu");
  menuButton.setAttribute("aria-expanded", "false");
  actions.append(
    done,
    iconButton(icons.trash, tr("ui.move_to_bin", ""), () => trashTask(key, t.id), "task-trash-action danger-on-interaction"),
    menuButton,
  );
  const content = div("task-content");
  content.append(titleRow, preview);
  el.append(content, actions);
  el.oncontextmenu = (event) =>
    showMenu(event, key, t.id, menuButton);
  el.onpointerdown = (event) => {
    const titleTarget = event.target.closest(".task-text");
    const expandedTitleDrag =
      titleTarget &&
      el.closest(".expanded-column") &&
      document.activeElement !== titleTarget;
    if (
      event.button !== 0 ||
      event.pointerType === "touch" ||
      event.target.closest(".check-hit,.icon-btn,.task-status-mark,.comment-preview,.task-marker") ||
      (titleTarget && !expandedTitleDrag)
    )
      return;
    startDrag(event, el, key, t.id);
  };
  return el;
}
function beginTaskTextEdit(text, t) {
  if (text.textContent !== t.text) text.textContent = t.text;
  text.setAttribute("aria-label", `${tr("ui.task_text", "")}: ${t.text}`);
}
function renderTaskTitleView(text, t) {
  renderTaskMarkerParts(text, parseTaskMarkers(t.text));
  text.setAttribute("aria-label", `${tr("ui.task_text", "")}: ${t.text}`);
}
function taskStatusFilterMark(mark, label, activateFilter) {
  if (mark.tagName === "BUTTON") mark.type = "button";
  setTitleAndLabel(mark, label);
  mark.onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  mark.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    activateFilter();
  };
  return mark;
}
function lastEditorMark(interactive = true) {
  const mark = document.createElement(interactive ? "button" : "span");
  mark.className = "task-status-mark last-editor-mark";
  mark.innerHTML = icons.robot;
  return taskStatusFilterMark(
    mark,
    `${tr("ui.agent_last_edited_the_text", "")} · ${tr("ui.agent_only", "")}`,
    () =>
      setLastEditorFilter(
        ui().filterLastEditor === "agent" ? "all" : "agent",
      ),
  );
}

function setTaskText(t, value, editedByAgent = false) {
  const text = value.trim();
  if (!text || text === t.text) return false;
  t.text = text;
  t.lastEditedByAgent = editedByAgent;
  return true;
}
function iconButton(html, title, fn, extra = "") {
  const b = document.createElement("button");
  b.className = "icon-btn " + extra;
  b.innerHTML = html.trim().startsWith("<")
    ? html
    : `<span class="icon-glyph" aria-hidden="true">${html}</span>`;
  setTitleAndLabel(b, title);
  b.onpointerdown = (e) => e.stopPropagation();
  b.onclick = (e) => {
    e.stopPropagation();
    fn(e);
  };
  return b;
}

function syncTaskStatusMarks(el, t) {
  const title = el?.querySelector(".task-title-row");
  if (!title) return;
  const editor = title.querySelector(".last-editor-mark");
  if (t.lastEditedByAgent && !editor) title.prepend(lastEditorMark());
  if (!t.lastEditedByAgent) editor?.remove();
}
function syncTaskEditorView(key, id, t) {
  const el = findRenderedTask(key, id);
  syncTaskStatusMarks(el, t);
  const titleRow = el?.querySelector(".task-title-row");
  const text = titleRow?.querySelector(".task-text");
  if (text) renderTaskTitleView(text, t);
}
function findTask(key, id) {
  return colTasks(key).find((t) => String(t.id) === String(id));
}
function removeTask(key, id) {
  state[key] = colTasks(key).filter((t) => String(t.id) !== String(id));
  commit();
}
function moveTask(from, to, id, beforeId = undefined) {
  if (!canMoveTaskTo(from, to)) return false;
  if (from === to && beforeId === undefined) return false;
  const list = colTasks(from),
    i = list.findIndex((t) => String(t.id) === String(id));
  if (i < 0) return;
  const [item] = list.splice(i, 1);
  const target = ensureColTasks(to);
  const insertAt =
    beforeId == null
      ? -1
      : target.findIndex((t) => String(t.id) === String(beforeId));
  if (insertAt < 0) target.push(item);
  else target.splice(insertAt, 0, item);
  commit();
  return true;
}
function reorderTask(key, id, offset) {
  if (filterActive()) return false;
  const list = colTasks(key);
  const index = list.findIndex((item) => String(item.id) === String(id));
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return false;
  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
  commit();
  return true;
}
function overdueTaskGroups() {
  const todayKey = dateKey(todayStart());
  return Object.keys(state)
    .filter(
      (key) =>
        isDateKey(key) && key < todayKey && colTasks(key).length,
    )
    .sort()
    .map((key) => ({ key, tasks: [...colTasks(key)] }));
}
function requestMoveOverdue() {
  const groups = overdueTaskGroups();
  const count = groups.reduce((sum, group) => sum + group.tasks.length, 0);
  if (!count) return false;
  const summary = tr("task.count_days", "", {
    0: count,
    1: groups.length,
  });
  requestConfirmation({
    title: tr("ui.move_overdue_tasks", ""),
    description: `${summary} ${tr("overdue.confirmation_description", "")}`,
    cancelLabel: tr("ui.cancel", ""),
    confirmLabel: tr("ui.move_to_today", ""),
  }).then((confirmed) => {
    if (confirmed) moveOverdueToToday();
  });
  return true;
}
function moveOverdueToToday() {
  const groups = overdueTaskGroups();
  const count = groups.reduce((sum, group) => sum + group.tasks.length, 0);
  if (!count) return false;
  const today = todayStart();
  const todayKey = dateKey(today);
  const target = ensureColTasks(todayKey);
  groups.forEach(({ key, tasks }) => {
    target.push(...tasks);
    state[key] = [];
  });
  ui().collapsed = ui().collapsed.filter((key) => key !== todayKey);
  if (expandedViewActive()) ui().expandedKey = todayKey;
  else focusDate(today);
  commit();
  requestAnimationFrame(() =>
    document.getElementById("board").focus({ preventScroll: true }),
  );
  scrollMobileToToday("smooth");
  return true;
}

// Clipboard day export
async function copyDayToClipboard(key, button) {
  const filter = activeFilter(),
    tasks = colTasks(key).filter((t) => taskInFilter(t, filter));
  if (!tasks.length) return;
  try {
    await copyText(formatClipboardDay(key, tasks, filter));
    flashCopyButton(button, tr("ui.copied", ""), false);
  } catch (_) {
    flashCopyButton(button, tr("ui.could_not_copy", ""), true);
  }
}
function formatClipboardDay(key, tasks, filter) {
  const lines = [`${dayTitle(parseDateKey(key))} · Chronos`],
    labels = clipboardFilterLabels(filter);
  if (labels.length) lines.push(tr("filters.active_name", "", { 0: labels.join(" + ") }));
  lines.push(
    filterActive(filter)
      ? tr("search.found_count", "", { 0: tasks.length })
      : tr("task.active_count", "", { 0: tasks.length }),
    "",
  );
  tasks.forEach((t) => lines.push(`☐ ${clipboardTaskText(t)}`));
  return lines.join("\n");
}
function dayTitle(date) {
  return titleCase(dateFormatters.dayTitle.format(date).replace(/\.$/, ""));
}
function clipboardFilterLabels(filter) {
  const labels = [];
  if (filter.text) labels.push(tr("task.text_label", "", {0: searchQuery.trim()}));
  labels.push(...Object.values(filter.markers || {}).filter(Boolean));
  if (filter.lastEditor === "human") labels.push(tr("ui.text_edited_by_user", ""));
  if (filter.lastEditor === "agent") labels.push(tr("ui.text_edited_by_agent", ""));
  return labels;
}
function clipboardTaskText(t) {
  return (t.text || "").trim();
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.focus();
  area.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy failed");
    return true;
  } finally {
    area.remove();
  }
}
function flashCopyButton(button, title, isError = false) {
  announceCopyStatus(title);
  if (!button) return;
  const originalTitle = button.title;
  const originalLabel = button.getAttribute("aria-label");
  button.classList.add("active-toggle");
  showCopyFeedbackBubble(button, title, isError);
  setTitleAndLabel(button, title);
  clearTimeout(button.copyTimer);
  button.copyTimer = setTimeout(() => {
    button.classList.remove("active-toggle");
    hideCopyFeedbackBubble();
    setTitleAndLabel(button, originalTitle, originalLabel || originalTitle);
  }, 1200);
}
function copyFeedbackBubble() {
  return document.getElementById("copyFeedbackBubble");
}
function showCopyFeedbackBubble(button, title, isError) {
  const bubble = copyFeedbackBubble();
  if (!bubble || !button) return;
  const rect = button.getBoundingClientRect();
  bubble.textContent = title;
  bubble.classList.toggle("copy-error", isError);
  bubble.style.left = `${rect.left + rect.width / 2}px`;
  bubble.style.top = `${Math.max(8, rect.top - 7)}px`;
  bubble.classList.add("show");
}
function hideCopyFeedbackBubble() {
  const bubble = copyFeedbackBubble();
  if (!bubble) return;
  bubble.classList.remove("show", "copy-error");
}
function announceCopyStatus(text) {
  const status = document.getElementById("copyStatus");
  if (!status) return;
  status.textContent = "";
  clearTimeout(announceCopyStatus.t);
  announceCopyStatus.t = setTimeout(() => (status.textContent = text), 20);
}

// Drag and drop
function startDrag(e, el, key, id) {
  if (focusPendingTaskDraft()) return;
  if (filterActive()) return;
  const originX = e.clientX;
  const originY = e.clientY;
  const pointerId = e.pointerId;
  const editTarget = e.target.closest(".task-text");
  let active = false;
  const finishDrag = () => {
    el.classList.remove("dragging");
    document.getElementById("dragDock").classList.remove("open");
    el.removeEventListener("pointermove", moveDrag);
    el.removeEventListener("pointerup", dropTask);
    el.removeEventListener("pointercancel", finishDrag);
    if (el.hasPointerCapture?.(pointerId))
      el.releasePointerCapture(pointerId);
    window.removeEventListener("blur", finishDrag);
    document
      .querySelectorAll(".task-list.drag-over, .task-drop-target.drag-over")
      .forEach((list) => list.classList.remove("drag-over"));
    clearDropCue();
    dropCue = null;
  };
  const moveDrag = (ev) => {
    if (ev.pointerId !== pointerId) return;
    if (!active) {
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) < 5)
        return;
      active = true;
      editTarget?.blur();
      getSelection()?.removeAllRanges();
      dropCue = div("drop-cue");
      el.classList.add("dragging");
      document.getElementById("dragDock").classList.add("open");
    }
    ev.preventDefault();
    const target = document
      .elementFromPoint(ev.clientX, ev.clientY)
      ?.closest(".task-list, .task-drop-target");
    document
      .querySelectorAll(".task-list.drag-over, .task-drop-target.drag-over")
      .forEach((list) => list.classList.remove("drag-over"));
    if (!target) return clearDropCue();
    const targetKey = target.dataset.key;
    if (
      !target.classList.contains("task-drop-target") &&
      !canMoveTaskTo(key, targetKey)
    )
      return clearDropCue();
    target.classList.add("drag-over");
    if (target.classList.contains("task-drop-target")) {
      clearDropCue();
      return;
    }
    const before = getDragAfter(target, ev.clientX, ev.clientY);
    target.insertBefore(dropCue, before);
  };
  const dropTask = (ev) => {
    if (ev.pointerId !== pointerId) return;
    if (active) ev.preventDefault();
    const target = active
      ? document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest(".task-list, .task-drop-target")
      : null;
    if (active && target) {
      const targetKey = target.dataset.key;
      if (target.classList.contains("task-drop-target")) {
        if (targetKey === ARCHIVE) archiveTask(key, id);
        else if (targetKey === TRASH) trashTask(key, id);
        else if (targetKey && targetKey !== key)
          moveTask(key, targetKey, id);
      } else {
        const before = nextTaskAfterCue();
        moveTask(key, targetKey, id, before?.dataset.id || null);
      }
    }
    finishDrag();
  };
  el.addEventListener("pointermove", moveDrag);
  el.addEventListener("pointerup", dropTask);
  el.addEventListener("pointercancel", finishDrag);
  el.setPointerCapture(pointerId);
  window.addEventListener("blur", finishDrag);
}
function clearDropCue() {
  dropCue?.remove();
}
function nextTaskAfterCue() {
  let node = dropCue?.nextElementSibling;
  while (node && !node.matches?.(".task:not(.dragging)"))
    node = node.nextElementSibling;
  return node || null;
}
function getDragAfter(container, x, y) {
  if (container.closest(".expanded-column"))
    return getGridDragAfter(container, x, y);
  return [...container.querySelectorAll(".task:not(.dragging)")].reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset
        ? { offset, el: child }
        : closest;
    },
    { offset: -Infinity, el: null },
  ).el;
}
function getGridDragAfter(container, x, y) {
  const items = [
    ...container.querySelectorAll(".task:not(.dragging)"),
  ].map((el) => ({ el, box: el.getBoundingClientRect() }));
  if (!items.length) return null;

  const rows = [];
  items.forEach((item) => {
    const row = rows.find(
      (candidate) => Math.abs(candidate.top - item.box.top) < 4,
    );
    if (row) {
      row.items.push(item);
      row.bottom = Math.max(row.bottom, item.box.bottom);
    } else {
      rows.push({
        top: item.box.top,
        bottom: item.box.bottom,
        items: [item],
      });
    }
  });

  const firstRow = rows[0];
  if (y < firstRow.top) return firstRow.items[0].el;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nextRow = rows[index + 1];
    const boundary = nextRow
      ? (row.bottom + nextRow.top) / 2
      : row.bottom;
    if (y > boundary) continue;
    const before = row.items.find(
      (item) => x < item.box.left + item.box.width / 2,
    );
    if (before) return before.el;
    const last = row.items.at(-1).el;
    const lastIndex = items.findIndex((item) => item.el === last);
    return items[lastIndex + 1]?.el || null;
  }
  return null;
}

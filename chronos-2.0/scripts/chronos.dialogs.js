// Task editor, menus, archive, and trash
function archiveTask(key, id) {
  if (focusPendingTaskDraft()) return;
  const t = findTask(key, id);
  if (!t) return;
  state[ARCHIVE].unshift({ ...t, archivedAt: Date.now() });
  removeTask(key, id);
}
function trashTask(key, id) {
  if (focusPendingTaskDraft()) return;
  const t = findTask(key, id);
  if (!t) return;
  state[TRASH].unshift({ ...t, deletedAt: Date.now() });
  removeTask(key, id);
}
function openTaskEditor(key, id) {
  if (focusPendingTaskDraft()) return;
  const t = findTask(key, id);
  if (!t) return;
  taskEditorTarget = { key, id };
  const title = document.getElementById("taskTitleInput");
  const comment = document.getElementById("taskCommentText");
  document.getElementById("taskEditorMeta").textContent =
    taskEditorColumnLabel(key);
  title.value = t.text;
  attachMarkerSuggestions(title);
  comment.value = t.comment || "";
  title.oninput = updateTaskEditorStatus;
  comment.oninput = updateTaskEditorStatus;
  taskEditorInitialTitle = title.value.trim();
  taskEditorInitialComment = comment.value.trim();
  setTaskEditorConfirmation();
  openModalLayer(document.getElementById("taskEditorModal"), comment);
  updateTaskEditorStatus();
}
function saveTaskEditor() {
  const title = taskTitleValue();
  if (!title) {
    updateTaskEditorStatus();
    document.getElementById("taskTitleInput").focus();
    return;
  }
  if (!taskEditorIsDirty()) return;
  const t = taskEditorTask();
  if (!t) return closeTaskEditor(true);
  const titleChanged = setTaskText(t, title);
  const comment = taskCommentValue();
  const commentChanged = comment !== (t.comment || "").trim();
  if (commentChanged) t.comment = comment;
  if (titleChanged || commentChanged) t.lastEditedByAgent = false;
  taskEditorInitialTitle = t.text;
  taskEditorInitialComment = t.comment;
  commit();
  closeTaskEditor(true);
}
function taskEditorTask() {
  return taskEditorTarget
    ? findTask(taskEditorTarget.key, taskEditorTarget.id)
    : null;
}
function taskEditorColumnLabel(key) {
  if (key === INBOX) return tr("ui.inbox", "");
  if (key === CONTROL) return tr("ui.control", "");
  const date = keyDate(key);
  if (!date) return "";
  const diff = Math.round((date - todayStart()) / 86400000);
  if (diff === 0) return tr("task.today_label", "", { 0: dayTitle(date) });
  if (diff === 1) return tr("task.tomorrow_label", "", { 0: dayTitle(date) });
  if (diff === -1) return tr("task.yesterday_label", "", { 0: dayTitle(date) });
  return dayTitle(date);
}

function taskTitleValue() {
  return document.getElementById("taskTitleInput").value.trim();
}
function taskCommentValue() {
  return document.getElementById("taskCommentText").value.trim();
}
function taskEditorIsOpen() {
  return document.getElementById("taskEditorModal").classList.contains("open");
}
function taskEditorIsDirty() {
  return (
    taskTitleValue() !== taskEditorInitialTitle ||
    taskCommentValue() !== taskEditorInitialComment
  );
}
function taskEditorConfirmationMode() {
  return document.getElementById("taskEditorModal").dataset.confirmation || "";
}
function taskEditorConfirmationOpen() {
  return Boolean(taskEditorConfirmationMode());
}
function setTaskEditorConfirmation(mode = "") {
  const modal = document.getElementById("taskEditorModal");
  const nextMode = ["trash", "discard"].includes(mode) ? mode : "";
  modal.dataset.confirmation = nextMode;
  modal.classList.toggle("confirming-trash", nextMode === "trash");
  modal.classList.toggle("confirming-discard", nextMode === "discard");
  modal.querySelector(".modal-body").inert = Boolean(nextMode);
  document
    .getElementById("taskEditorTrashAction")
    .setAttribute("aria-expanded", String(nextMode === "trash"));
  if (nextMode === "trash") {
    const note = document.getElementById("taskEditorTrashNote");
    const dirty = taskEditorIsDirty();
    note.textContent = dirty
      ? tr("task_editor.unsaved_move_to_bin_note", "")
      : tr("task_editor.move_to_bin_note", "");
    note.classList.toggle("warning", dirty);
  }
  const focusTarget =
    nextMode === "trash"
      ? modal.querySelector('[data-action="confirm-task-editor-trash"]')
      : nextMode === "discard"
        ? modal.querySelector('[data-action="cancel-task-editor-confirm"]')
        : null;
  if (focusTarget)
    requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
}
function cancelTaskEditorConfirmation() {
  const mode = taskEditorConfirmationMode();
  if (!mode) return false;
  setTaskEditorConfirmation();
  requestAnimationFrame(() =>
    (mode === "trash"
      ? document.getElementById("taskEditorTrashAction")
      : document.getElementById("taskCommentText")
    ).focus({ preventScroll: true }),
  );
  return true;
}
function requestTaskEditorTrash() {
  if (!taskEditorTask()) return;
  setTaskEditorConfirmation("trash");
}
function confirmTaskEditorTrash() {
  const target = taskEditorTarget ? { ...taskEditorTarget } : null;
  if (!target) return;
  closeTaskEditor(true);
  trashTask(target.key, target.id);
}
function commentStats(text) {
  if (!text) return tr("ui.comment_is_empty", "");
  const lines = text.split(/\r?\n/).length;
  return tr("comment.summary", "", { 0: lines, 1: text.length });
}
function hasUnsavedWork() {
  return (
    (taskEditorIsOpen() && taskEditorIsDirty()) ||
    hasUnsavedTaskInput() ||
    Boolean(
      dataFileHandle &&
        (pendingFileWrite || linkedStateDirty || linkedWriteActive),
    )
  );
}
function preventUnsavedLoss(event) {
  if (!hasUnsavedWork()) return;
  event.preventDefault();
  event.returnValue = "";
}
function updateTaskEditorStatus() {
  const modal = document.getElementById("taskEditorModal");
  const status = document.getElementById("taskEditorStatus");
  const clear = modal.querySelector(".comment-clear");
  const save = modal.querySelector('[data-action="save-task-editor"]');
  const comment = taskCommentValue();
  const titleMissing = !taskTitleValue();
  const dirty = taskEditorIsDirty();
  clear.disabled = !comment;
  save.disabled = !dirty || titleMissing;
  status.classList.toggle("warning", dirty || titleMissing);
  status.textContent = titleMissing
    ? tr("task_editor.title_required", "")
    : dirty
      ? tr("ui.unsaved_changes", "")
      : commentStats(comment);
}
function closeTaskEditor(force = false) {
  const modal = document.getElementById("taskEditorModal");
  if (!modal.classList.contains("open")) return true;
  if (taskEditorIsDirty() && !force) {
    setTaskEditorConfirmation("discard");
    return false;
  }
  setTaskEditorConfirmation();
  modal.classList.remove("open");
  taskEditorTarget = null;
  taskEditorInitialTitle = "";
  taskEditorInitialComment = "";
  syncModalIsolation();
  return true;
}
function clearCommentText() {
  const text = document.getElementById("taskCommentText");
  text.value = "";
  updateTaskEditorStatus();
  text.focus();
}
function closeTaskSubmenus(menu) {
  menu
    .querySelectorAll(".submenu.open")
    .forEach((item) => item.classList.remove("open"));
  menu.querySelectorAll('.has-sub[aria-expanded="true"]').forEach((item) =>
    item.setAttribute("aria-expanded", "false"),
  );
}
function closeTaskMenu(restoreFocus = false) {
  const m = document.getElementById("menu");
  m.classList.remove("open", "open-left");
  closeTaskSubmenus(m);
  document
    .querySelectorAll('.task-menu-trigger[aria-expanded="true"]')
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
  const returnFocus = menuReturnFocus;
  menuReturnFocus = null;
  if (restoreFocus && returnFocus?.isConnected)
    returnFocus.focus({ preventScroll: true });
}
function taskMenuItems(container) {
  return [...container.children]
    .map((child) =>
      child.matches(".menu-group")
        ? child.querySelector(":scope > .menu-item")
        : child.matches(".menu-item")
          ? child
          : null,
    )
    .filter((item) => item && !item.disabled);
}
function openTaskSubmenu(trigger, focusFirst = false) {
  const submenu = trigger.nextElementSibling;
  if (!submenu?.classList.contains("submenu")) return false;
  const menu = trigger.closest(".context-menu");
  closeTaskSubmenus(menu);
  submenu.classList.add("open");
  trigger.setAttribute("aria-expanded", "true");
  if (focusFirst) taskMenuItems(submenu)[0]?.focus();
  return true;
}
function handleTaskMenuKey(event) {
  const menu = event.currentTarget;
  const active = event.target.closest(".menu-item");
  if (!active) return;
  const currentMenu = active.closest(".submenu") || menu;
  const items = taskMenuItems(currentMenu);
  const index = items.indexOf(active);
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[nextIndex]?.focus();
    return;
  }
  if (event.key === "ArrowRight" && active.matches(".has-sub")) {
    event.preventDefault();
    openTaskSubmenu(active, true);
    return;
  }
  if (event.key === "ArrowLeft" && currentMenu.matches(".submenu")) {
    event.preventDefault();
    currentMenu.classList.remove("open");
    const trigger = currentMenu.previousElementSibling;
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.focus();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (currentMenu.matches(".submenu")) {
      currentMenu.classList.remove("open");
      const trigger = currentMenu.previousElementSibling;
      trigger?.setAttribute("aria-expanded", "false");
      trigger?.focus();
    } else {
      closeTaskMenu(true);
    }
    return;
  }
  if (event.key === "Tab") closeTaskMenu();
}
function showMenu(event, key, id, anchor = null) {
  event.preventDefault();
  event.stopPropagation();
  if (focusPendingTaskDraft()) return;
  closeTaskMenu();
  const m = document.getElementById("menu");
  menuReturnFocus = anchor || document.activeElement;
  m.setAttribute("role", "menu");
  m.setAttribute("aria-label", tr("ui.task_actions", ""));
  const selectedTask = findTask(key, id);
  if (!selectedTask) return;
  const taskIndex = colTasks(key).findIndex(
    (item) => String(item.id) === String(id),
  );
  const orderLocked = filterActive();
  const upDisabled = orderLocked || taskIndex <= 0 ? " disabled" : "";
  const downDisabled =
    orderLocked || taskIndex < 0 || taskIndex >= colTasks(key).length - 1
      ? " disabled"
      : "";
  m.innerHTML = `<button type="button" class="menu-item" role="menuitem" data-done>${trHtml("ui.done", "")}</button><div class="menu-sep" role="separator"></div><button type="button" class="menu-item" role="menuitem" data-comment>${trHtml("ui.comment", "")}</button><div class="menu-sep" role="separator"></div><div class="menu-group"><button type="button" class="menu-item has-sub" role="menuitem" aria-haspopup="menu" aria-expanded="false">${trHtml("ui.move", "")} <span aria-hidden="true">›</span></button><div class="submenu" role="menu" aria-label="${trHtml("ui.move", "")}"><button type="button" class="menu-item" role="menuitem" data-move="0">${trHtml("ui.today_menu_action", "")}</button><button type="button" class="menu-item" role="menuitem" data-move="1">${trHtml("ui.tomorrow", "")}</button><button type="button" class="menu-item" role="menuitem" data-move="2">${trHtml("ui.day_after_tomorrow", "")}</button><button type="button" class="menu-item" role="menuitem" data-move="7">${trHtml("ui.in_a_week", "")}</button><button type="button" class="menu-item" role="menuitem" data-custom-date>${trHtml("ui.choose_date_menu_action", "")}</button></div></div><div class="menu-group"><button type="button" class="menu-item has-sub" role="menuitem" aria-haspopup="menu" aria-expanded="false">${trHtml("ui.send", "")} <span aria-hidden="true">›</span></button><div class="submenu" role="menu" aria-label="${trHtml("ui.send", "")}"><button type="button" class="menu-item" role="menuitem" data-send="${INBOX}">${trHtml("ui.to_inbox", "")}</button><button type="button" class="menu-item" role="menuitem" data-send="${CONTROL}">${trHtml("ui.to_control", "")}</button></div></div><div class="menu-sep" role="separator"></div><button type="button" class="menu-item" role="menuitem" data-reorder="-1"${upDisabled}>${trHtml("ui.up", "")}</button><button type="button" class="menu-item" role="menuitem" data-reorder="1"${downDisabled}>${trHtml("ui.down", "")}</button><div class="menu-sep" role="separator"></div><button type="button" class="menu-item danger-on-interaction" role="menuitem" data-delete>${trHtml("ui.move_to_bin", "")}</button>`;
  taskMenuItems(m).forEach((item) => {
    item.onmouseenter = () => {
      if (item.matches(".has-sub")) openTaskSubmenu(item);
      else closeTaskSubmenus(m);
    };
    item.onfocus = () => {
      if (!item.matches('[aria-expanded="true"]')) closeTaskSubmenus(m);
    };
  });
  m.querySelectorAll(".has-sub").forEach(
    (button) =>
      (button.onclick = () => openTaskSubmenu(button, true)),
  );
  m.querySelectorAll("[data-move]").forEach(
    (b) =>
      (b.onclick = () => {
        moveTask(key, dateKey(addDays(+b.dataset.move)), id);
        closeTaskMenu();
      }),
  );
  m.querySelectorAll("[data-send]").forEach(
    (b) =>
      (b.onclick = () => {
        moveTask(key, b.dataset.send, id);
        closeTaskMenu();
      }),
  );
  m.querySelectorAll("[data-reorder]").forEach(
    (button) =>
      (button.onclick = () => {
        const offset = Number(button.dataset.reorder);
        closeTaskMenu();
        if (!reorderTask(key, id, offset)) return;
        requestAnimationFrame(() =>
          findRenderedTask(key, id)
            ?.querySelector(".task-menu-trigger")
            ?.focus({ preventScroll: true }),
        );
      }),
  );
  m.querySelector("[data-comment]").onclick = () => {
    closeTaskMenu();
    openTaskEditor(key, id);
  };
  m.querySelector("[data-custom-date]").onclick = (ev) => {
    openDatePopover(ev.currentTarget, key, id);
    closeTaskMenu();
  };
  m.querySelector("[data-done]").onclick = () => {
    archiveTask(key, id);
    closeTaskMenu();
  };
  m.querySelector("[data-delete]").onclick = () => {
    trashTask(key, id);
    closeTaskMenu();
  };
  m.classList.add("open");
  const anchorRect = anchor?.getBoundingClientRect();
  const menuRect = m.getBoundingClientRect();
  const fromPointer =
    event.type === "contextmenu" && Boolean(event.clientX || event.clientY);
  const preferredLeft = fromPointer
    ? event.clientX
    : (anchorRect?.right || 8) - menuRect.width;
  const preferredTop = fromPointer
    ? event.clientY
    : (anchorRect?.bottom || 8) + 6;
  const requiredHeight = Math.max(menuRect.height, 240);
  const left = Math.max(
    8,
    Math.min(preferredLeft, innerWidth - menuRect.width - 8),
  );
  const top = Math.max(
    8,
    Math.min(preferredTop, innerHeight - requiredHeight - 8),
  );
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
  m.classList.toggle(
    "open-left",
    left + menuRect.width + 184 > innerWidth,
  );
  m.onkeydown = handleTaskMenuKey;
  anchor?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => taskMenuItems(m)[0]?.focus());
}
function renderBin(kind, options = {}) {
  if (![ARCHIVE, TRASH].includes(kind)) return;
  currentBin = kind;
  setBinClearConfirm(false);
  cleanupExpired();
  syncHeaderCounters();
  syncBinControls(kind);
  const items = state[kind];
  const body = document.getElementById("binBody");
  body.innerHTML = items.length
    ? '<div class="bin-list"></div>'
    : kind === ARCHIVE
      ? `<div class="empty"><strong>${trHtml("bins.done_empty_title", "")}</strong><span>${trHtml("bins.done_empty_description", "")}</span></div>`
      : `<div class="empty"><strong>${trHtml("bins.trash_empty_title", "")}</strong><span>${trHtml("bins.trash_empty_description", "")}</span></div>`;
  const list = body.querySelector(".bin-list");
  items.forEach((item, index) =>
    list.append(createBinRow(kind, item, index)),
  );
  const modal = document.getElementById("binModal");
  const activeTab = modal.querySelector(
    `.bin-tab[data-bin="${kind === ARCHIVE ? "archive" : "trash"}"]`,
  );
  openModalLayer(modal, activeTab);
  if (Number.isInteger(options.focusIndex)) {
    requestAnimationFrame(() => {
      const rows = body.querySelectorAll(".bin-row");
      const nextRow = rows[Math.min(options.focusIndex, rows.length - 1)];
      (nextRow?.querySelector("[data-restore]") || activeTab)?.focus({
        preventScroll: true,
      });
    });
  } else if (options.focusTab) {
    requestAnimationFrame(() => activeTab?.focus({ preventScroll: true }));
  }
  if (options.announcement) announceBinStatus(options.announcement);
}
function createBinRow(kind, item, index) {
  const row = div("bin-row");
  const timestamp =
    kind === ARCHIVE ? item.archivedAt : item.deletedAt;
  const meta =
    kind === ARCHIVE
      ? tr("bins.completed_retention", "", { 0: timeAgo(timestamp), 1: daysLeft(timestamp) })
      : tr("bins.deleted_retention", "", { 0: timeAgo(timestamp), 1: daysLeft(timestamp) });
  const destinationTitle =
    kind === ARCHIVE ? tr("ui.move_task_to_bin", "") : tr("ui.move_to_done", "");
  const destinationIcon =
    kind === ARCHIVE ? icons.trash : icons.archive;
  const question =
    kind === ARCHIVE
      ? trHtml("ui.move_to_bin_question", "")
      : `${trHtml("ui.delete_permanently", "")}?`;
  const confirmClass =
    kind === ARCHIVE ? "icon-btn danger-on-interaction" : "icon-btn danger";
  const confirmId = `bin-row-confirm-${kind}-${index}`;
  const reclassifyConfirmation =
    kind === ARCHIVE
      ? ` data-confirm-trigger aria-expanded="false" aria-controls="${confirmId}"`
      : "";
  const purgeButton =
    kind === TRASH
      ? `<button class="icon-btn danger" data-purge data-confirm-trigger aria-expanded="false" aria-controls="${confirmId}">${icons.trash}</button>`
      : "";
  row.innerHTML = `<div class="bin-row-body"><div class="bin-text"></div><div class="bin-meta">${escapeHtml(meta)}</div></div><div class="bin-row-actions"><button class="btn btn-ghost" data-restore>${trHtml("ui.to_today", "")}</button><button class="icon-btn${kind === ARCHIVE ? " danger-on-interaction" : ""}" data-reclassify${reclassifyConfirmation}>${destinationIcon}</button>${purgeButton}</div><span class="bin-row-confirm" id="${confirmId}"><span class="inline-confirm-question">${question}</span><button class="${confirmClass}" data-confirm-row>${icons.check}</button><button class="icon-btn neutral-action" data-cancel-row><span class="icon-glyph" aria-hidden="true">×</span></button></span>`;
  renderTaskMarkerParts(row.querySelector(".bin-text"), parseTaskMarkers(item.text), "", false);
  const taskName = String(item.text || tr("ui.untitled", ""));
  const restore = row.querySelector("[data-restore]");
  restore.setAttribute("aria-label", tr("bins.restore_named_task", "", { 0: taskName }));
  restore.title = tr("ui.return_to_today", "");
  restore.onclick = () => restoreBinItem(kind, item.id, index);
  const reclassify = row.querySelector("[data-reclassify]");
  reclassify.setAttribute(
    "aria-label",
    `${destinationTitle}: «${taskName}»`,
  );
  reclassify.title = destinationTitle;
  reclassify.onclick = () => {
    if (kind === ARCHIVE) setBinRowConfirm(row, true);
    else moveBinItem(kind, item.id, index);
  };
  const purge = row.querySelector("[data-purge]");
  if (purge) {
    purge.setAttribute(
      "aria-label",
      tr("bins.delete_named_task", "", { 0: taskName }),
    );
    purge.title = tr("ui.delete_permanently", "");
    purge.onclick = () => setBinRowConfirm(row, true);
  }
  const confirm = row.querySelector("[data-confirm-row]");
  confirm.setAttribute(
    "aria-label",
    kind === ARCHIVE
      ? tr("bins.confirm_move_to_bin_named_task", "", { 0: taskName })
      : tr("bins.confirm_delete_named_task", "", { 0: taskName }),
  );
  confirm.title =
    kind === ARCHIVE
      ? tr("ui.confirm_move_to_bin", "")
      : tr("ui.delete_permanently", "");
  confirm.onclick = () =>
    kind === ARCHIVE
      ? moveBinItem(kind, item.id, index)
      : purgeBinItem(kind, item.id, index);
  const cancel = row.querySelector("[data-cancel-row]");
  cancel.setAttribute(
    "aria-label",
    kind === ARCHIVE
      ? tr("ui.cancel_move_to_bin", "")
      : tr("ui.cancel_deletion", ""),
  );
  cancel.title = tr("ui.cancel", "");
  cancel.onclick = () => setBinRowConfirm(row, false);
  return row;
}
function syncBinControls(kind) {
  const archiveTab = document.getElementById("binTabArchive");
  const trashTab = document.getElementById("binTabTrash");
  [
    [archiveTab, ARCHIVE],
    [trashTab, TRASH],
  ].forEach(([tab, tabKind]) => {
    const selected = kind === tabKind;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.getElementById("binArchiveCount").textContent =
    state[ARCHIVE].length;
  document.getElementById("binTrashCount").textContent =
    state[TRASH].length;
  document
    .getElementById("binPanel")
    .setAttribute(
      "aria-labelledby",
      kind === ARCHIVE ? "binTabArchive" : "binTabTrash",
    );
  const clear = document.getElementById("binClearAction");
  clear.textContent =
    kind === ARCHIVE ? tr("ui.move_all_to_bin", "") : tr("ui.empty_bin", "");
  clear.disabled = state[kind].length === 0;
  clear.classList.toggle("danger", kind === TRASH);
  clear.classList.toggle("danger-on-interaction", kind === ARCHIVE);
  document.getElementById("binClearQuestion").textContent =
    kind === ARCHIVE ? tr("ui.move_all", "") : tr("ui.delete_all", "");
  const confirmClear = document.querySelector(
    '[data-action="confirm-clear-bin"]',
  );
  confirmClear.classList.toggle("danger", kind === TRASH);
  confirmClear.classList.toggle("danger-on-interaction", kind === ARCHIVE);
  const confirmLabel =
    kind === ARCHIVE
      ? tr("bins.move_all_done_confirmation", "")
      : tr("bins.delete_all_confirmation", "");
  confirmClear.title = confirmLabel;
  confirmClear.setAttribute("aria-label", confirmLabel);
}
function takeBinItem(kind, id) {
  const index = state[kind].findIndex(
    (item) => String(item.id) === String(id),
  );
  if (index < 0) return null;
  return state[kind].splice(index, 1)[0];
}
function restoreBinItem(kind, id, focusIndex = 0) {
  const item = takeBinItem(kind, id);
  if (!item) return;
  const target = dateKey(todayStart());
  ensureColTasks(target).unshift(stripMeta(item));
  save();
  renderBin(kind, {
    focusIndex,
    announcement: tr("ui.task_returned_to_today", ""),
  });
  render();
}
function prepareBinItem(item, targetKind, timestamp = Date.now()) {
  const rest = { ...item };
  delete rest.archivedAt;
  delete rest.deletedAt;
  return targetKind === ARCHIVE
    ? { ...rest, archivedAt: timestamp }
    : { ...rest, deletedAt: timestamp };
}
function moveBinItem(kind, id, focusIndex = 0) {
  const item = takeBinItem(kind, id);
  if (!item) return;
  const targetKind = kind === ARCHIVE ? TRASH : ARCHIVE;
  state[targetKind].unshift(prepareBinItem(item, targetKind));
  save();
  renderBin(kind, {
    focusIndex,
    announcement:
      targetKind === ARCHIVE
        ? tr("ui.task_moved_to_done", "")
        : tr("ui.task_moved_to_the_bin", ""),
  });
  render();
}
function purgeBinItem(kind, id, focusIndex = 0) {
  if (kind !== TRASH || !takeBinItem(kind, id)) return;
  save();
  renderBin(kind, {
    focusIndex,
    announcement: tr("ui.task_deleted_permanently", ""),
  });
  render();
}
function setBinRowConfirm(row, on, restoreFocus = true) {
  document
    .querySelectorAll("#binBody .bin-row.confirming-action")
    .forEach((item) => {
      if (item === row) return;
      item.classList.remove("confirming-action");
      item
        .querySelector("[data-confirm-trigger]")
        ?.setAttribute("aria-expanded", "false");
    });
  row.classList.toggle("confirming-action", on);
  row
    .querySelector("[data-confirm-trigger]")
    ?.setAttribute("aria-expanded", String(on));
  if (on || restoreFocus)
    requestAnimationFrame(() =>
      (on
        ? row.querySelector("[data-confirm-row]")
        : row.querySelector("[data-confirm-trigger]"))?.focus({
        preventScroll: true,
      }),
    );
}
function cancelBinInlineConfirmation() {
  const row = document.querySelector("#binBody .bin-row.confirming-action");
  if (row) {
    setBinRowConfirm(row, false);
    return true;
  }
  const clear = document.getElementById("binClearConfirm");
  if (!clear.classList.contains("open")) return false;
  setBinClearConfirm(false);
  requestAnimationFrame(() =>
    document.getElementById("binClearAction").focus({ preventScroll: true }),
  );
  return true;
}
function announceBinStatus(text) {
  const status = document.getElementById("binStatus");
  status.textContent = "";
  setTimeout(() => (status.textContent = text), 20);
}
function setBinClearConfirm(on) {
  const action = document.getElementById("binClearAction");
  const confirm = document.getElementById("binClearConfirm");
  confirm.classList.toggle("open", on);
  action.hidden = on;
  action.setAttribute("aria-expanded", String(on));
}
function requestClearCurrentBin() {
  if (!currentBin || !state[currentBin]?.length) return;
  setBinClearConfirm(true);
  requestAnimationFrame(() =>
    document
      .querySelector('[data-action="confirm-clear-bin"]')
      ?.focus({ preventScroll: true }),
  );
}
function clearCurrentBin() {
  if (!currentBin || !state[currentBin]?.length) return;
  const count = state[currentBin].length;
  let announcement;
  if (currentBin === ARCHIVE) {
    const timestamp = Date.now();
    const moved = state[ARCHIVE].map((item) =>
      prepareBinItem(item, TRASH, timestamp),
    );
    state[ARCHIVE] = [];
    state[TRASH].unshift(...moved);
    announcement = tr("bins.moved_count", "", { 0: count });
  } else {
    state[TRASH] = [];
    announcement = tr("bins.deleted_count", "", { 0: count });
  }
  save();
  renderBin(currentBin, { announcement, focusTab: true });
  render();
}
function cleanupExpired(persist = true) {
  const beforeArchive = state[ARCHIVE].length;
  const beforeTrash = state[TRASH].length;
  state[ARCHIVE] = state[ARCHIVE].filter((t) => !isExpired(t.archivedAt));
  state[TRASH] = state[TRASH].filter((t) => !isExpired(t.deletedAt));
  const changed =
    state[ARCHIVE].length !== beforeArchive ||
    state[TRASH].length !== beforeTrash;
  if (changed && persist) save();
  return changed;
}
function isExpired(ts) {
  const timestamp = Number(ts);
  return (
    Number.isFinite(timestamp) && Date.now() - timestamp >= RETENTION_MS
  );
}
function timeAgo(ts) {
  if (!ts) return tr("ui.a_while_ago", "");
  const d = Math.floor((Date.now() - ts) / 86400000),
    h = Math.floor((Date.now() - ts) / 3600000),
    m = Math.floor((Date.now() - ts) / 60000);
  if (d >= 1) return tr("time.days_ago", "", { 0: d });
  if (h >= 1) return tr("time.hours_ago", "", { 0: h });
  if (m >= 1) return tr("time.minutes_ago", "", { 0: m });
  return tr("ui.just_now", "");
}
function daysLeft(ts) {
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp))
    return Math.ceil(RETENTION_MS / 86400000);
  return Math.max(
    1,
    Math.ceil(
      (RETENTION_MS - (Date.now() - timestamp)) /
        86400000,
    ),
  );
}
function stripMeta(t) {
  const rest = { ...t };
  delete rest.archivedAt;
  delete rest.deletedAt;
  return rest;
}

// Date picker
function openDatePopover(anchor, fromKey, id) {
  anchor.setAttribute("aria-haspopup", "dialog");
  anchor.setAttribute("aria-controls", "datePopover");
  anchor.setAttribute("aria-expanded", "true");
  datePicker = {
    kind: "move",
    fromKey,
    id,
    trigger: anchor,
    returnFocus: menuReturnFocus || anchor,
  };
  datePickerMonth = new Date();
  datePickerMonth.setDate(1);
  renderDatePopover(anchor.getBoundingClientRect(), true);
}
function openNavigationDatePopover(anchor) {
  anchor.setAttribute("aria-haspopup", "dialog");
  anchor.setAttribute("aria-controls", "datePopover");
  anchor.setAttribute("aria-expanded", "true");
  datePicker = { kind: "navigate", trigger: anchor, returnFocus: anchor };
  const selected = isDateKey(ui().expandedKey)
    ? parseDateKey(ui().expandedKey)
    : ui().view === "month"
      ? monthAnchor()
      : viewDates()[0];
  datePickerMonth = new Date(
    selected.getFullYear(),
    selected.getMonth(),
    1,
  );
  renderDatePopover(anchor.getBoundingClientRect(), true);
}
function renderDatePopover(anchorRect, focusCalendar = false) {
  const pop = document.getElementById("datePopover");
  const m = datePickerMonth;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  pop.innerHTML = `<div class="date-head"><button class="icon-btn" aria-label="${trHtml("ui.previous_month", "")}" data-cal="prev"><span class="icon-glyph" aria-hidden="true">‹</span></button><div class="date-title">${titleCase(dateFormatters.monthYear.format(m))}</div><button class="icon-btn" aria-label="${trHtml("ui.next_month", "")}" data-cal="next"><span class="icon-glyph" aria-hidden="true">›</span></button></div><div class="date-grid">${calendarWeekdays().map((day) => `<div class="date-dow">${day}</div>`).join("")}</div><div class="date-foot"><button class="btn btn-ghost" data-cal="today">${trHtml("ui.today_menu_action", "")}</button><button class="btn btn-ghost" data-cal="close">${trHtml("ui.close", "")}</button></div>`;
  const grid = pop.querySelector(".date-grid");
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const b = document.createElement("button");
    b.className =
      "date-day" +
      (d.getMonth() === m.getMonth() ? "" : " out") +
      (dateKey(d) === dateKey(todayStart()) ? " today" : "");
    b.textContent = d.getDate();
    b.setAttribute(
      "aria-label",
      dateFormatters.fullDate.format(d),
    );
    if (
      datePicker.kind === "move" &&
      !canAddTaskTo(dateKey(d))
    )
      b.disabled = true;
    b.onclick = () => chooseDate(d);
    grid.append(b);
  }
  pop.querySelector('[data-cal="prev"]').onclick = () => {
    datePickerMonth.setMonth(datePickerMonth.getMonth() - 1);
    renderDatePopover(anchorRect);
    pop.querySelector('[data-cal="prev"]').focus();
  };
  pop.querySelector('[data-cal="next"]').onclick = () => {
    datePickerMonth.setMonth(datePickerMonth.getMonth() + 1);
    renderDatePopover(anchorRect);
    pop.querySelector('[data-cal="next"]').focus();
  };
  pop.querySelector('[data-cal="today"]').onclick = () =>
    chooseDate(todayStart());
  pop.querySelector('[data-cal="close"]').onclick = () =>
    hideDatePopover(true);
  const navigation = datePicker.kind === "navigate";
  const left = navigation
    ? Math.min(
        anchorRect.left + anchorRect.width / 2 - 123,
        innerWidth - 254,
      )
    : Math.min(anchorRect.right + 6, innerWidth - 260);
  const headerBottom = navigation
    ? datePicker.trigger.closest(".app-header")?.getBoundingClientRect().bottom
    : null;
  const top = navigation
    ? Math.max(anchorRect.bottom, headerBottom || 0) + 6
    : Math.min(anchorRect.top, innerHeight - 310);
  pop.style.left = Math.max(8, left) + "px";
  pop.style.top = Math.max(8, top) + "px";
  pop.classList.add("open");
  if (focusCalendar)
    requestAnimationFrame(() =>
      pop.querySelector(".date-day.today, .date-day")?.focus(),
    );
}
function chooseDate(d) {
  if (!datePicker) return;
  if (datePicker.kind !== "move" && focusPendingTaskDraft()) return;
  if (datePicker.kind === "move")
    moveTask(datePicker.fromKey, dateKey(d), datePicker.id);
  else {
    if (expandedViewActive()) {
      ui().expandedKey = dateKey(d);
      render();
    } else {
      if (ui().view === "month") setMonthCursor(d);
      else focusDate(d);
      render();
    }
  }
  hideDatePopover();
  closeTaskMenu();
}
function hideDatePopover(restoreFocus = false) {
  const returnFocus = datePicker?.returnFocus;
  const trigger = datePicker?.trigger;
  document.getElementById("datePopover").classList.remove("open");
  trigger?.setAttribute("aria-expanded", "false");
  datePicker = null;
  if (restoreFocus && returnFocus?.isConnected)
    returnFocus.focus({ preventScroll: true });
}

// Help, modal, and DOM helpers
function openHelp() {
  updateHeaderPopoverBounds();
  const layer = document.getElementById("helpLayer");
  openModalLayer(layer, layer.querySelector(".help-close"));
}
function syncStaticIcons() {
  document.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = icons[element.dataset.icon] || "";
  });
  document
    .querySelectorAll("svg.icon")
    .forEach((icon) => icon.setAttribute("aria-hidden", "true"));
}
function closeModals() {
  if (confirmationIsOpen()) {
    dismissConfirmation();
    return false;
  }
  if (!closeTaskEditor()) return false;
  const confirmingRow = document.querySelector(
    "#binBody .bin-row.confirming-action",
  );
  if (confirmingRow) setBinRowConfirm(confirmingRow, false, false);
  document
    .querySelectorAll(".modal-layer:not(#taskEditorModal), .help-layer")
    .forEach((m) => m.classList.remove("open"));
  setBinClearConfirm(false);
  syncModalIsolation();
  return true;
}
function confirmationIsOpen() {
  return document.getElementById("confirmationModal").classList.contains("open");
}
function requestConfirmation(options) {
  return new Promise((resolve) => {
    confirmationQueue.push({ options, resolve });
    showNextConfirmation();
  });
}
function showNextConfirmation() {
  if (activeConfirmation || !confirmationQueue.length) return;
  activeConfirmation = confirmationQueue.shift();
  const { options } = activeConfirmation;
  document.getElementById("confirmationTitle").textContent = options.title;
  document.getElementById("confirmationDescription").textContent =
    options.description;
  const cancel = document.getElementById("confirmationCancel");
  const confirm = document.getElementById("confirmationConfirm");
  cancel.textContent = options.cancelLabel;
  confirm.textContent = options.confirmLabel;
  confirm.classList.toggle("danger", Boolean(options.danger));
  confirm.classList.toggle("btn-primary", !options.danger);
  openModalLayer(document.getElementById("confirmationModal"), cancel);
}
function settleConfirmation(result) {
  if (!activeConfirmation) return;
  const { resolve } = activeConfirmation;
  const hasNext = confirmationQueue.length > 0;
  activeConfirmation = null;
  if (!hasNext) {
    document.getElementById("confirmationModal").classList.remove("open");
    syncModalIsolation();
  }
  resolve(result);
  queueMicrotask(hasNext ? showNextConfirmation : restoreOpenLayerFocus);
}
function dismissConfirmation() {
  if (!activeConfirmation) return false;
  if (activeConfirmation.options.dismissible === false) {
    document.getElementById("confirmationCancel").focus();
    return false;
  }
  settleConfirmation(false);
  return true;
}
function restoreOpenLayerFocus() {
  const layer = [
    ...document.querySelectorAll(".modal-layer.open, .help-layer.open"),
  ].at(-1);
  if (!layer || layer.contains(document.activeElement)) return;
  layer
    .querySelector(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )
    ?.focus({ preventScroll: true });
}
function openModalLayer(layer, initialFocus) {
  const wasOpen = layer.classList.contains("open");
  if (!document.querySelector(".modal-layer.open, .help-layer.open")) {
    modalReturnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const headerPopover = modalReturnFocus?.closest("[data-header-popover].open");
    if (headerPopover) {
      const ownerId = headerPopover.id === "clearPopover" ? "filePopover" : headerPopover.id;
      modalReturnFocus = document.querySelector(`[aria-controls="${ownerId}"]`);
    }
  }
  closeHeaderPopovers();
  layer.classList.add("open");
  syncModalIsolation();
  if (!wasOpen) {
    requestAnimationFrame(() =>
      initialFocus?.focus({ preventScroll: true }),
    );
  }
}
function syncModalIsolation() {
  const allLayers = [
    ...document.querySelectorAll(".modal-layer, .help-layer"),
  ];
  const openLayers = allLayers.filter((layer) =>
    layer.classList.contains("open"),
  );
  const topLayer = openLayers.at(-1);
  allLayers.forEach((layer) => {
    layer.inert = layer.classList.contains("open") && layer !== topLayer;
  });
  const modalOpen = Boolean(
    document.querySelector(
      '.modal-layer.open [role="dialog"][aria-modal="true"], .help-layer.open [role="dialog"][aria-modal="true"]',
    ),
  );
  document.querySelector(".app-header").inert = modalOpen;
  document.getElementById("board").inert = Boolean(openLayers.length || loadSchemaError);
  if (openLayers.length) return;
  const target =
    modalReturnFocus && document.contains(modalReturnFocus)
      ? modalReturnFocus
      : document.getElementById("board");
  modalReturnFocus = null;
  requestAnimationFrame(() => target?.focus({ preventScroll: true }));
}
function trapModalFocus(e) {
  const dialog = [
    ...document.querySelectorAll(
      '.modal-layer.open [role="dialog"][aria-modal="true"], .help-layer.open [role="dialog"][aria-modal="true"]',
    ),
  ].at(-1);
  if (!dialog || e.key !== "Tab") return;
  const focusable = [
    ...dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.offsetParent !== null && !el.closest("[inert]"));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (
    e.shiftKey &&
    (document.activeElement === first ||
      !dialog.contains(document.activeElement))
  ) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

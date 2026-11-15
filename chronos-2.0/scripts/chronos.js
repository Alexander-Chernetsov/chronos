// DOM events and application bootstrap
function shortcutBlocked(event) {
  const target = event.target;
  const editing =
    target instanceof Element &&
    Boolean(target.closest('input, textarea') || target.matches('[contenteditable="true"]'));
  const modalOpen = Boolean(
    document.querySelector(".modal-layer.open, .help-layer.open"),
  );
  return editing || modalOpen;
}
function saveOpenEditor(event) {
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key !== "Enter"
  )
    return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const taskText = target.matches('.task-text[contenteditable="true"]') ? target : null;
  if (taskText) {
    event.preventDefault();
    taskText.blur();
    return true;
  }
  const bulkInput = target.closest(".new-task-input");
  if (bulkInput) {
    event.preventDefault();
    bulkInput
      .closest(".new-task-panel")
      ?.querySelector(".btn-primary")
      ?.click();
    return true;
  }
  if (taskEditorIsOpen()) {
    event.preventDefault();
    if (!taskEditorConfirmationOpen()) saveTaskEditor();
    return true;
  }
  return false;
}
function handleGlobalShortcut(event) {
  if (event.defaultPrevented || event.repeat || shortcutBlocked(event))
    return false;
  const command = event.ctrlKey || event.metaKey;
  if (command && !event.altKey && !event.shiftKey && event.code === "KeyF") {
    event.preventDefault();
    openSearch();
    return true;
  }
  if (command && !event.altKey && !event.shiftKey && event.code === "KeyS") {
    event.preventDefault();
    writeDataFile(true).catch((error) =>
      note(error.name === "AbortError" ? "cancelled" : "save error"),
    );
    return true;
  }
  if (command || event.altKey) return false;
  if (event.code === "KeyN") {
    event.preventDefault();
    openShortcutTask(dateKey(todayStart()), event.shiftKey);
    return true;
  }
  if (!event.shiftKey && event.code === "KeyI") {
    event.preventDefault();
    openShortcutTask(INBOX);
    return true;
  }
  if (!event.shiftKey && event.code === "KeyC") {
    event.preventDefault();
    openShortcutTask(CONTROL);
    return true;
  }
  if (!event.shiftKey && event.code === "KeyT") {
    event.preventDefault();
    goToday();
    return true;
  }
  if (event.shiftKey && event.code === "KeyT") {
    event.preventDefault();
    requestMoveOverdue();
    return true;
  }
  if (
    !event.shiftKey &&
    ["BracketLeft", "BracketRight"].includes(event.code)
  ) {
    event.preventDefault();
    stepVisibleDay(event.code === "BracketRight" ? 1 : -1);
    return true;
  }
  if (event.shiftKey && event.code === "Slash") {
    event.preventDefault();
    openHelp();
    return true;
  }
  return false;
}
function horizontalTargetIndex(event, items) {
  if (!items.length) return -1;
  const currentIndex = Math.max(0, items.indexOf(document.activeElement));
  if (event.key === "Home") return 0;
  if (event.key === "End") return items.length - 1;
  return (
    currentIndex + (event.key === "ArrowRight" ? 1 : -1) + items.length
  ) % items.length;
}
function moveTabByKey(event, selector) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
    return false;
  const tab = event.target.closest?.(selector);
  if (!tab) return false;
  event.preventDefault();
  const tabs = [...document.querySelectorAll(selector)];
  const targetIndex = horizontalTargetIndex(event, tabs);
  tabs[targetIndex].click();
  tabs[targetIndex].focus({ preventScroll: true });
  return true;
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-control")) closeSearch();
  if (!e.target.closest("#menu")) closeTaskMenu();
  if (!e.target.closest(".file-control")) closeFilePopover();
  if (!e.target.closest(".task-marker-filter-control"))
    closeTaskMarkerFilterPopovers();
  if (!e.target.closest(".editor-filter-control"))
    closeEditorFilterPopover();
  if (!e.target.closest(".settings-control")) closeSettingsPopover();
  if (!e.target.closest(".dimension-manager-control")) closeDimensionManager();
  if (
    !e.target.closest("#columnActionsPopover") &&
    !e.target.closest(".column-actions-trigger")
  )
    closeColumnActionsPopover();
  const a = e.target.closest("[data-action]")?.dataset.action;
  if (
    [
      "days-minus",
      "days-plus",
      "today-pos-minus",
      "today-pos-plus",
      "set-locale",
      "toggle-theme",
    ].includes(a) &&
    focusPendingTaskDraft()
  )
    return;
  switch (a) {
    case "pick-visible-date":
      openNavigationDatePopover(e.target.closest("[data-action]"));
      break;
    case "today":
      goToday();
      break;
    case "move-overdue":
      requestMoveOverdue();
      break;
    case "confirm-app-confirmation":
      settleConfirmation(true);
      break;
    case "cancel-app-confirmation":
      settleConfirmation(false);
      break;
    case "jump-left-overflow":
      jumpToLeftOverflow();
      break;
    case "prev":
      stepVisibleDay(-1);
      break;
    case "next":
      stepVisibleDay(1);
      break;
    case "days-minus":
      ui().dayCount = Math.max(1, ui().dayCount - 1);
      ui().todayColumnIndex = Math.min(
        ui().todayColumnIndex,
        ui().dayCount,
      );
      focusDate(todayStart());
      commit();
      break;
    case "days-plus":
      ui().dayCount = Math.min(30, ui().dayCount + 1);
      focusDate(todayStart());
      commit();
      break;
    case "today-pos-minus":
      ui().todayColumnIndex = Math.max(
        1,
        ui().todayColumnIndex - 1,
      );
      focusDate(todayStart());
      commit();
      break;
    case "today-pos-plus":
      ui().todayColumnIndex = Math.min(
        ui().dayCount,
        ui().todayColumnIndex + 1,
      );
      focusDate(todayStart());
      commit();
      break;
    case "open-file":
      openDataFile().catch((err) =>
        note(err.name === "AbortError" ? "cancelled" : "open error"),
      );
      break;
    case "save-file":
      writeDataFile(true).catch((err) =>
        note(err.name === "AbortError" ? "cancelled" : "save error"),
      );
      break;
    case "toggle-file-popover":
      toggleFilePopover();
      break;
    case "close-file-popover":
      closeFilePopover();
      break;
    case "disconnect-file":
      disconnectFile().catch(() => note("save error"));
      break;
    case "open-clear-tasks":
      toggleClearPopover();
      break;
    case "clear-after-export":
      clearAfterExport().catch((err) =>
        note(err.name === "AbortError" ? "cancelled" : "save error"),
      );
      break;
    case "clear-local":
      requestClearLocalTasks().catch(() => note("save error"));
      break;
    case "close-clear-popover":
      closeClearPopover(true);
      break;
    case "toggle-view":
      toggleView();
      break;
    case "toggle-settings-popover":
      toggleSettingsPopover().catch(() => {
        applyLocale("default");
        applyVisualTheme("default");
      });
      break;
    case "connect-locale-directory":
      connectLocaleDirectory().catch(() => applyLocale("default"));
      break;
    case "set-locale":
      selectLocale(e.target.closest("[data-locale]").dataset.locale);
      break;
    case "connect-visual-theme-directory":
      connectVisualThemeDirectory().catch(() =>
        applyVisualTheme("default"),
      );
      break;
    case "set-visual-theme":
      selectVisualTheme(
        e.target.closest("[data-visual-theme]").dataset.visualTheme,
      );
      break;
    case "close-settings-popover":
      closeSettingsPopover(true);
      break;
    case "toggle-theme":
      toggleColorScheme();
      break;
    case "help":
      openHelp();
      break;
    case "close-help":
      closeModals();
      break;
    case "toggle-dimension-manager":
      toggleDimensionManager();
      break;
    case "close-dimension-manager":
      closeDimensionManager(true);
      break;
    case "toggle-task-marker-filter-popover":
      toggleTaskMarkerFilterPopover(
        e.target.closest("[data-marker-kind]").dataset.markerKind,
      );
      break;
    case "set-task-marker-filter": {
      const button = e.target.closest("[data-marker-key]");
      setTaskMarkerFilter(button.dataset.markerKind, button.dataset.markerKey);
      break;
    }
    case "toggle-editor-filter-popover":
      toggleEditorFilterPopover();
      break;
    case "set-editor-filter":
      setLastEditorFilter(
        e.target.closest("[data-editor-filter]").dataset.editorFilter,
      );
      break;
    case "search":
      if (searchControlOpen()) closeSearch(true);
      else openSearch();
      break;
    case "clear-filters":
      clearAllFilters();
      break;
    case "archive":
      renderBin(ARCHIVE);
      break;
    case "trash":
      renderBin(TRASH);
      break;
    case "switch-bin": {
      const bin = e.target.closest("[data-bin]")?.dataset.bin;
      renderBin(bin === "trash" ? TRASH : ARCHIVE, { focusTab: true });
      break;
    }
    case "clear-bin":
      requestClearCurrentBin();
      break;
    case "confirm-clear-bin":
      clearCurrentBin();
      break;
    case "cancel-clear-bin":
      setBinClearConfirm(false);
      requestAnimationFrame(() =>
        document
          .getElementById("binClearAction")
          .focus({ preventScroll: true }),
      );
      break;
    case "close-task-editor":
      closeTaskEditor();
      break;
    case "request-task-editor-trash":
      requestTaskEditorTrash();
      break;
    case "confirm-task-editor-trash":
      confirmTaskEditorTrash();
      break;
    case "cancel-task-editor-confirm":
      cancelTaskEditorConfirmation();
      break;
    case "confirm-task-editor-discard":
      closeTaskEditor(true);
      break;
    case "close-bin":
      closeModals();
      break;
    case "save-task-editor":
      saveTaskEditor();
      break;
    case "clear-comment":
      clearCommentText();
      break;
  }
});
document.addEventListener("keydown", (e) => {
  if (handleGlobalShortcut(e)) return;
  if (saveOpenEditor(e)) return;
  if (moveTabByKey(e, "#editorFilterPopover [role=radio]"))
    return;
  if (moveTabByKey(e, "#binModal .bin-tab")) return;
  if (e.key === "Tab") trapModalFocus(e);
  if (e.key === "Escape") {
    if (confirmationIsOpen()) {
      e.preventDefault();
      dismissConfirmation();
      return;
    }
    if (document.getElementById("clearPopover").classList.contains("open")) {
      e.preventDefault();
      closeClearPopover(true);
      return;
    }
    if (document.getElementById("filePopover").classList.contains("open")) {
      e.preventDefault();
      closeFilePopover();
      document.getElementById("saveNote").focus({preventScroll: true});
      return;
    }
    if (dimensionManagerOpen()) {
      e.preventDefault();
      closeDimensionManager(true);
      return;
    }
    if (columnActionsPopoverOpen()) {
      e.preventDefault();
      closeColumnActionsPopover(true);
      return;
    }
    const openMarkerFilter = openTaskMarkerFilterKind();
    if (openMarkerFilter) {
      e.preventDefault();
      closeTaskMarkerFilterPopover(openMarkerFilter, true);
      return;
    }
    if (editorFilterPopoverOpen()) {
      e.preventDefault();
      closeEditorFilterPopover(true);
      return;
    }
    if (settingsPopoverOpen()) {
      e.preventDefault();
      closeSettingsPopover(true);
      return;
    }
    if (searchControlOpen()) {
      e.preventDefault();
      closeSearch(true);
      return;
    }
    if (cancelBinInlineConfirmation()) {
      e.preventDefault();
      return;
    }
    if (taskEditorIsOpen()) {
      e.preventDefault();
      if (!cancelTaskEditorConfirmation()) closeTaskEditor();
      return;
    }
    const activeEditor =
      document.activeElement instanceof Element
        ? document.activeElement
        : null;
    const taskText = activeEditor?.matches('.task-text[contenteditable="true"]') ? activeEditor : null;
    if (taskText) {
      e.preventDefault();
      taskText.blur();
      return;
    }
    const newTaskInput = activeEditor?.closest(".new-task-input");
    if (newTaskInput) {
      e.preventDefault();
      newTaskInput
        .closest(".new-task-panel")
        ?.querySelector(".btn-ghost")
        ?.click();
      return;
    }
    const hadTransientUi =
      filterActive() ||
      Boolean(
        document.querySelector(
          ".modal-layer.open, .help-layer.open, .date-popover.open, #menu.open, .file-popover.open, .task-marker-filter-popover.open, .visual-theme-popover.open, .column-actions-popover.open",
        ),
      );
    if (filterActive()) clearAllFilters();
    closeModals();
    closeFilePopover();
    closeTaskMarkerFilterPopovers();
    closeDimensionManager();
    closeSettingsPopover();
    hideDatePopover(true);
    closeTaskMenu(true);
    if (!hadTransientUi && expandedViewActive()) closeExpandedColumn();
  }
});

document.getElementById("addDimensionForm").addEventListener("submit", event => {
  event.preventDefault();
  addDimension();
});
document.querySelectorAll(".modal-layer, .help-layer").forEach((m) =>
  m.addEventListener("mousedown", (e) => {
    if (e.target !== m) return;
    if (m.id === "confirmationModal") dismissConfirmation();
    else if (m.id === "taskEditorModal") {
      if (!cancelTaskEditorConfirmation()) closeTaskEditor();
    } else if (m.id === "binModal") {
      if (!cancelBinInlineConfirmation()) closeModals();
    } else closeModals();
  }),
);
document
  .getElementById("boardSearchInput")
  .addEventListener("input", (e) => setSearch(e.target.value));
document
  .getElementById("columnActionsPopover")
  .addEventListener("keydown", (event) => {
    if (![
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ].includes(event.key))
      return;
    const items = [
      ...event.currentTarget.querySelectorAll('[role="menuitem"]'),
    ];
    if (!items.length) return;
    event.preventDefault();
    const target = horizontalTargetIndex(event, items);
    items[target].focus({ preventScroll: true });
  });
syncStaticIcons();
document.getElementById("brandVersion").textContent = CHRONOS_VERSION.split(".")[0];
document.getElementById("settingsVersion").textContent = `Chronos ${CHRONOS_VERSION}`;
const build = document.querySelector('meta[name="chronos-build"]')?.content;
if (/^[a-f0-9]{40}(?:\+modified)?$/.test(build || "")) {
  const version = document.getElementById("settingsVersion");
  version.textContent += `\n${build.slice(0, 7)}${build.endsWith("+modified") ? "+modified" : ""}`;
  version.title = build;
}
state = load();
applyColorScheme();
applyLocale("default", false);
syncBootErrors();
renderVisualThemeMenu();
dayOffset = -(ui().todayColumnIndex - 1);
cleanupExpired();
render();
restoreVisualThemeDirectory().catch(() =>
  applyVisualTheme("default"),
);
restoreLocaleDirectory().catch(() => applyLocale("default"));
scrollMobileToToday();
EXPANDED_SINGLE_COLUMN_QUERY.addEventListener("change", render);
const headerPopoverResizeObserver = new ResizeObserver(updateHeaderPopoverBounds);
headerPopoverResizeObserver.observe(document.querySelector(".app-header"));
window.addEventListener("resize", updateHeaderPopoverBounds);
let renderedTodayKey = dateKey(todayStart());
function checkDayBoundary() {
  const currentTodayKey = dateKey(todayStart());
  if (currentTodayKey === renderedTodayKey || hasUncommittedInput()) return;
  const dayDelta = Math.round(
    (parseDateKey(currentTodayKey) - parseDateKey(renderedTodayKey)) /
      (24 * 60 * 60 * 1000),
  );
  renderedTodayKey = currentTodayKey;
  dayOffset -= dayDelta;
  render();
}
setInterval(() => {
  checkDayBoundary();
  checkExternalFile();
}, 2000);
setInterval(() => {
  if (hasUncommittedInput()) return;
  if (cleanupExpired()) render();
}, CLEANUP_INTERVAL_MS);
window.addEventListener("focus", checkExternalFile);
window.addEventListener("resize", () => closeColumnActionsPopover());
document
  .getElementById("board")
  .addEventListener("scroll", () => closeColumnActionsPopover(), {
    passive: true,
  });
window.addEventListener("beforeunload", preventUnsavedLoss);
window.addEventListener("beforeunload", releaseVisualThemeUrl);
document.addEventListener("visibilitychange", checkExternalFile);
if (loadSchemaError || loadRecoveryState) setFileStatus(loadSchemaError || loadRecoveryState);

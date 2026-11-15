// Local and linked-file persistence
function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseDataSnapshot(raw) : seed();
  } catch (error) {
    loadSchemaError = ["schema_old", "schema_newer"].includes(error.code) ? error.code : null;
    loadRecoveryState = "recovery-save-error";
    if (raw) {
      pendingRecoverySnapshot = raw;
      if (preserveRecoverySnapshot()) loadRecoveryState = "recovery";
    }
    const recoveryHint =
      loadRecoveryState === "recovery"
        ? `Inspect recovery with localStorage.getItem(${JSON.stringify(RECOVERY_KEY)}).`
        : "Recovery data was not saved.";
    console.error(`Chronos could not load data. ${recoveryHint}`, error);
    return seed();
  }
}
function preserveRecoverySnapshot() {
  if (pendingRecoverySnapshot === null) return true;
  try {
    localStorage.setItem(RECOVERY_KEY, pendingRecoverySnapshot);
    pendingRecoverySnapshot = null;
    return true;
  } catch (error) {
    console.error("Chronos could not save recovery data.", error);
    return false;
  }
}
async function openDataFile() {
  if (focusPendingTaskDraft()) return;
  if (!window.showOpenFilePicker) {
    note("file api unavailable");
    return;
  }
  await flushPendingFileWrite();
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: "Planner data JSON",
        accept: { "application/json": [".json"] },
      },
    ],
    excludeAcceptAllOption: false,
    multiple: false,
  });
  const file = await handle.getFile();
  const snapshot = await file.text();
  let nextState;
  try {
    nextState = parseDataSnapshot(snapshot);
  } catch (error) {
    console.error("Chronos could not open the selected file.", error);
    note(error.code || "open error");
    return;
  }
  if (!preserveRecoverySnapshot()) { note("recovery-save-error"); return; }
  state = nextState;
  loadSchemaError = null;
  loadRecoveryState = null;
  syncBootErrors();
  invalidateLinkedWrites();
  dataFileHandle = handle;
  linkedFileSnapshot = snapshot;
  ignoredExternalSnapshot = null;
  const expiredRemoved = cleanupExpired(false);
  const emptyDateBucketsRemoved = pruneEmptyDateBuckets(state);
  closeFilePopover();
  searchQuery = "";
  taskMarkerFilters = {};
  filterColumnWidth = null;
  const normalizedSnapshot = JSON.stringify(state);
  const localSaved = persistLocalSnapshot(normalizedSnapshot);
  if (expiredRemoved || emptyDateBucketsRemoved) {
    const revision = ++linkedWriteRevision;
    linkedStateDirty = true;
    scheduleFileWrite(handle, normalizedSnapshot, localSaved, revision);
  }
  note(localSaved ? "linked" : "save error");
  focusDate(todayStart());
  render();
}
function serializeState() {
  pruneEmptyDateBuckets(state);
  return JSON.stringify(state);
}
async function writeHandle(handle, snapshot = serializeState()) {
  const writable = await handle.createWritable();
  await writable.write(snapshot);
  await writable.close();
}
function hasUncommittedInput() {
  if (taskEditorIsOpen() && taskEditorIsDirty()) return true;
  if (document.querySelector(".task.dragging")) return true;
  const active = document.activeElement;
  if (active instanceof Element && active.matches('.task-text[contenteditable="true"]'))
    return true;
  return Boolean(pendingTaskDraftInput());
}
function pendingTaskDraftInput() {
  return [...document.querySelectorAll(".new-task-input")].find((input) =>
    input.value.trim(),
  );
}
function focusPendingTaskDraft() {
  const input = pendingTaskDraftInput();
  if (!input) return false;
  input.focus({ preventScroll: false });
  return true;
}
function hasChangedTaskText() {
  const active = document.activeElement;
  const editor =
    active instanceof Element && active.matches('.task-text[contenteditable="true"]')
      ? active
      : null;
  const card = editor?.closest(".task");
  const task = card ? findTask(card.dataset.key, card.dataset.id) : null;
  return Boolean(
    editor &&
      task &&
      editor.textContent.trim() !== (task.text || "").trim(),
  );
}
function hasUnsavedTaskInput() {
  return Boolean(pendingTaskDraftInput()) || hasChangedTaskText();
}
function loadExternalSnapshot(snapshot, externalState = parseDataSnapshot(snapshot)) {
  invalidateLinkedWrites();
  state = externalState;
  linkedFileSnapshot = snapshot;
  ignoredExternalSnapshot = null;
  const expiredRemoved = cleanupExpired(false);
  const emptyDateBucketsRemoved = pruneEmptyDateBuckets(state);
  searchQuery = "";
  taskMarkerFilters = {};
  filterColumnWidth = null;
  const normalizedSnapshot = JSON.stringify(state);
  const localSaved = persistLocalSnapshot(normalizedSnapshot);
  if ((expiredRemoved || emptyDateBucketsRemoved) && dataFileHandle) {
    const revision = ++linkedWriteRevision;
    linkedStateDirty = true;
    scheduleFileWrite(
      dataFileHandle,
      normalizedSnapshot,
      localSaved,
      revision,
    );
  }
  render();
  note(localSaved ? "external" : "save error");
}
async function resolveLinkedFileConflict(
  handle,
  externalSnapshot,
  localSnapshot,
  revision,
) {
  if (handle !== dataFileHandle || revision !== linkedWriteRevision)
    return "superseded";
  const useExternal = await requestConfirmation({
    title: tr("file.conflict_title", ""),
    description: tr("file.conflict_prompt", ""),
    cancelLabel: tr("file.conflict_keep_chronos", ""),
    confirmLabel: tr("file.conflict_use_external", ""),
    dismissible: false,
  });
  if (useExternal) {
    loadExternalSnapshot(externalSnapshot);
    return "external";
  }
  linkedFileSnapshot = externalSnapshot;
  if (handle !== dataFileHandle || revision !== linkedWriteRevision)
    return "superseded";
  await writeHandle(handle, localSnapshot);
  linkedFileSnapshot = localSnapshot;
  linkedStateDirty = revision !== linkedWriteRevision;
  ignoredExternalSnapshot = null;
  return "written";
}
async function writeLinkedSnapshot(handle, snapshot, revision) {
  if (handle !== dataFileHandle || revision !== linkedWriteRevision)
    return "superseded";
  const currentSnapshot = await (await handle.getFile()).text();
  if (
    linkedFileSnapshot !== null &&
    currentSnapshot !== linkedFileSnapshot
  )
    return resolveLinkedFileConflict(
      handle,
      currentSnapshot,
      snapshot,
      revision,
    );
  await writeHandle(handle, snapshot);
  linkedFileSnapshot = snapshot;
  linkedStateDirty = revision !== linkedWriteRevision;
  ignoredExternalSnapshot = null;
  return "written";
}
function queueFileWrite(handle, snapshot, revision) {
  fileWritePromise = fileWritePromise
    .catch(() => {})
    .then(async () => {
      if (handle !== dataFileHandle || revision !== linkedWriteRevision)
        return "superseded";
      linkedWriteActive = true;
      try {
        return await writeLinkedSnapshot(handle, snapshot, revision);
      } finally {
        linkedWriteActive = false;
      }
    });
  return fileWritePromise;
}
async function checkExternalFile() {
  if (
    !dataFileHandle ||
    document.visibilityState === "hidden" ||
    externalFileCheckRunning ||
    pendingFileWrite ||
    linkedWriteActive ||
    hasUncommittedInput()
  )
    return;
  const handle = dataFileHandle;
  externalFileCheckRunning = true;
  try {
    const snapshot = await (await handle.getFile()).text();
    if (handle !== dataFileHandle) return;
    if (snapshot === ignoredExternalSnapshot) return;
    if (snapshot === linkedFileSnapshot && !linkedStateDirty) return;
    let externalState = null;
    try {
      if (snapshot !== linkedFileSnapshot)
        externalState = parseDataSnapshot(snapshot);
    } catch (error) {
      ignoredExternalSnapshot = snapshot;
      console.error("Chronos could not reload the linked file.", error);
      note("external error");
      return;
    }
    if (linkedStateDirty) {
      linkedWriteActive = true;
      try {
        const outcome =
          snapshot === linkedFileSnapshot
            ? await writeLinkedSnapshot(
                handle,
                serializeState(),
                linkedWriteRevision,
              )
            : await resolveLinkedFileConflict(
                handle,
                snapshot,
                serializeState(),
                linkedWriteRevision,
              );
        noteLinkedWriteOutcome(outcome, true);
      } catch (error) {
        console.error("Chronos could not save the linked file.", error);
        note("save error");
      } finally {
        linkedWriteActive = false;
      }
    } else {
      loadExternalSnapshot(snapshot, externalState);
    }
  } catch (error) {
    console.error("Chronos could not check the linked file.", error);
    note("external error");
  } finally {
    externalFileCheckRunning = false;
  }
}
function persistLocalSnapshot(snapshot) {
  if (loadSchemaError) return false;
  if (!preserveRecoverySnapshot()) return false;
  try {
    localStorage.setItem(STORAGE_KEY, snapshot);
    return true;
  } catch (error) {
    console.error("Chronos could not save browser data.", error);
    return false;
  }
}
function cancelPendingFileWrite() {
  clearTimeout(saveTimer);
  saveTimer = null;
  pendingFileWrite = null;
}
function invalidateLinkedWrites() {
  linkedWriteRevision += 1;
  linkedStateDirty = false;
  cancelPendingFileWrite();
}
function noteLinkedWriteOutcome(outcome, localSaved) {
  if (outcome === "written")
    note(localSaved ? "saved" : "save error");
}
function scheduleFileWrite(handle, snapshot, localSaved, revision) {
  cancelPendingFileWrite();
  pendingFileWrite = { handle, snapshot, localSaved, revision };
  saveTimer = setTimeout(async () => {
    const pending = pendingFileWrite;
    saveTimer = null;
    pendingFileWrite = null;
    if (!pending) return;
    try {
      note("saving");
      const outcome = await queueFileWrite(
        pending.handle,
        pending.snapshot,
        pending.revision,
      );
      noteLinkedWriteOutcome(outcome, pending.localSaved);
    } catch (error) {
      console.error("Chronos could not save the linked file.", error);
      note("save error");
    }
  }, 450);
}
async function flushPendingFileWrite() {
  const pending = pendingFileWrite;
  cancelPendingFileWrite();
  if (!pending) {
    await fileWritePromise.catch(() => {});
    return;
  }
  note("saving");
  const outcome = await queueFileWrite(
    pending.handle,
    pending.snapshot,
    pending.revision,
  );
  noteLinkedWriteOutcome(outcome, pending.localSaved);
}
async function exportDataFile() {
  if (loadSchemaError) { note(loadSchemaError); return false; }
  if (!window.showSaveFilePicker) {
    note("file api unavailable");
    return false;
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: "chronos-data.json",
    types: [
      {
        description: "Planner data JSON",
        accept: { "application/json": [".json"] },
      },
    ],
    excludeAcceptAllOption: false,
  });
  const snapshot = serializeState();
  await writeHandle(handle, snapshot);
  if (snapshot !== JSON.stringify(state)) {
    note("exported");
    return true;
  }
  const localSaved = persistLocalSnapshot(snapshot);
  note(localSaved ? "exported" : "save error");
  return true;
}
async function writeDataFile(exportIfUnlinked = false) {
  if (!dataFileHandle && exportIfUnlinked) {
    await exportDataFile();
    return;
  }
  const snapshot = serializeState();
  if (!dataFileHandle) {
    const localSaved = persistLocalSnapshot(snapshot);
    note(localSaved ? "local" : "save error");
    return;
  }
  cancelPendingFileWrite();
  const revision = ++linkedWriteRevision;
  linkedStateDirty = true;
  note("saving");
  try {
    const outcome = await queueFileWrite(
      dataFileHandle,
      snapshot,
      revision,
    );
    if (outcome === "written") {
      const localSaved = persistLocalSnapshot(snapshot);
      noteLinkedWriteOutcome(outcome, localSaved);
    }
  } catch (error) {
    console.error("Chronos could not save the linked file.", error);
    note("save error");
  }
}
function save() {
  if (loadSchemaError) { note(loadSchemaError); return; }
  const snapshot = serializeState();
  const localSaved = persistLocalSnapshot(snapshot);
  if (dataFileHandle) {
    const revision = ++linkedWriteRevision;
    linkedStateDirty = true;
    scheduleFileWrite(dataFileHandle, snapshot, localSaved, revision);
    if (localSaved) note("linked");
  } else {
    cancelPendingFileWrite();
    note(localSaved ? "local" : "save error");
  }
}
function commit() {
  save();
  render();
}
function saveStateLabel(text) {
  return (
    {
      local: tr("ui.no_file", ""),
      linked: tr("ui.file_open", ""),
      saving: tr("ui.saving", ""),
      saved: tr("ui.saved", ""),
      external: tr("ui.file_reloaded", ""),
      "external error": tr("ui.external_file_error", ""),
      exported: tr("ui.exported", ""),
      "save error": tr("ui.save_failed", ""),
      "open error": tr("ui.open_failed", ""),
      "file api unavailable": tr("ui.file_api_unavailable", ""),
      recovery: tr("ui.data_error_backup_saved", ""),
      schema_old: tr("dimensions.schema_old", ""),
      schema_newer: tr("dimensions.schema_newer", ""),
      "recovery-save-error": tr("ui.data_error_backup_not_saved", ""),
      cancelled: tr("ui.cancelled", ""),
    }[text] || text
  );
}
function note(text) {
  setFileStatus(text);
  clearTimeout(note.t);
  if (
    ![
      "save error",
      "open error",
      "file api unavailable",
      "external error",
      "recovery",
      "recovery-save-error",
      "schema_old",
      "schema_newer",
    ].includes(text)
  )
    note.t = setTimeout(
      () => setFileStatus(dataFileHandle ? "linked" : "local"),
      900,
    );
}
function setTitleAndLabel(el, title, label = title) {
  el.title = title;
  el.setAttribute("aria-label", label);
}
function setFileStatus(text) {
  if (loadSchemaError && loadRecoveryState === "recovery-save-error") text = loadRecoveryState;
  const el = document.getElementById("saveNote");
  el.dataset.status = text;
  const label = saveStateLabel(text);
  const stateName =
    {
      "save error": "error",
      "open error": "error",
      "file api unavailable": "error",
      "external error": "error",
      recovery: "error",
      schema_old: "error",
      schema_newer: "error",
      "recovery-save-error": "error",
    }[text] || text;
  el.className = `file-status ${stateName}`;
  setTitleAndLabel(el, label);
  const live = document.getElementById("fileStatusLive");
  if (live.textContent !== label) live.textContent = label;
  syncFileActions();
}
function syncFileActions() {
  const disconnect = document.getElementById("disconnectFileBtn");
  const clear = document.getElementById("clearDataBtn");
  disconnect.disabled = !dataFileHandle;
  setTitleAndLabel(
    disconnect,
    dataFileHandle ? tr("ui.disconnect_file", "") : tr("ui.no_file_connected", ""),
  );
  clear.disabled = !hasAnyData();
  setTitleAndLabel(
    clear,
    clear.disabled ? tr("ui.no_data_to_clear", "") : tr("ui.clear_all_data", ""),
  );
}
function hasAnyData() {
  return Object.keys(state).some(
    (key) => (isTaskColumn(key) || key === ARCHIVE || key === TRASH) && state[key].length,
  );
}
function toggleFilePopover() {
  const popover = document.getElementById("filePopover");
  if (popover.classList.contains("open") || document.getElementById("clearPopover").classList.contains("open")) {
    closeFilePopover();
    return;
  }
  syncFileActions();
  showHeaderPopover(popover);
  document.getElementById("saveNote").setAttribute("aria-expanded", "true");
}
function closeFilePopover() {
  hideHeaderPopover(document.getElementById("filePopover"));
  document.getElementById("saveNote").setAttribute("aria-expanded", "false");
  closeClearPopover();
}
function toggleClearPopover() {
  const popover = document.getElementById("clearPopover");
  if (popover.classList.contains("open")) { closeClearPopover(true); return; }
  hideHeaderPopover(document.getElementById("filePopover"));
  document.getElementById("saveNote").setAttribute("aria-expanded", "false");
  showHeaderPopover(popover);
  document
    .getElementById("clearDataBtn")
    .setAttribute("aria-expanded", "true");
  popover.querySelector("button:not(:disabled)")?.focus({preventScroll: true});
}
function closeClearPopover(returnToFile = false) {
  const popover = document.getElementById("clearPopover");
  const wasOpen = popover.classList.contains("open");
  hideHeaderPopover(popover);
  document.getElementById("clearDataBtn").setAttribute("aria-expanded", "false");
  if (returnToFile && wasOpen) {
    showHeaderPopover(document.getElementById("filePopover"));
    document.getElementById("saveNote").setAttribute("aria-expanded", "true");
    document.getElementById("clearDataBtn").focus({preventScroll: true});
  }
}
async function disconnectFile() {
  if (!dataFileHandle) return;
  await flushPendingFileWrite();
  invalidateLinkedWrites();
  dataFileHandle = null;
  linkedFileSnapshot = null;
  ignoredExternalSnapshot = null;
  closeFilePopover();
  note("local");
}
async function requestClearLocalTasks() {
  if (focusPendingTaskDraft()) return false;
  const snapshot = JSON.stringify(state);
  const handle = dataFileHandle;
  const confirmed = await requestConfirmation({
    title: tr("ui.clear_without_saving", ""),
    description: tr("file.clear_local_confirmation", ""),
    cancelLabel: tr("ui.cancel", ""),
    confirmLabel: tr("ui.confirm_clear", ""),
    danger: true,
  });
  if (!confirmed) return false;
  if (handle !== dataFileHandle || snapshot !== JSON.stringify(state)) {
    note("cancelled");
    return false;
  }
  return clearLocalTasks();
}
function clearLocalTasks() {
  if (focusPendingTaskDraft()) return false;
  const view = {
    dayCount: ui().dayCount,
    todayColumnIndex: ui().todayColumnIndex,
    expandedKey: ui().expandedKey,
    theme: ui().theme,
    view: ui().view,
  };
  invalidateLinkedWrites();
  dataFileHandle = null;
  linkedFileSnapshot = null;
  ignoredExternalSnapshot = null;
  const dimensions = [...activeDimensions()];
  const colors = {...state[DIMENSION_COLORS]};
  state = seed();
  state[DIMENSIONS] = dimensions;
  state[DIMENSION_COLORS] = colors;
  Object.assign(state[UI], view, {
    collapsed: [],
    filterLastEditor: "all",
  });
  const localSaved = persistLocalSnapshot(serializeState());
  searchQuery = "";
  taskMarkerFilters = {};
  focusDate(todayStart());
  closeModals();
  closeFilePopover();
  applyColorScheme();
  note(localSaved ? "local" : "save error");
  render();
  return true;
}
async function clearAfterExport() {
  if (focusPendingTaskDraft()) return;
  const snapshot = serializeState();
  const handle = dataFileHandle;
  const saved = await exportDataFile();
  if (saved === false) return;
  if (snapshot !== JSON.stringify(state) || handle !== dataFileHandle) {
    note("cancelled");
    return;
  }
  clearLocalTasks();
}
function openHandleDatabase() {
  if (!window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DIRECTORY_HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DIRECTORY_HANDLE_STORE))
        db.createObjectStore(DIRECTORY_HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}
async function readStoredDirectory(key) {
  const db = await openHandleDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    const transaction = db.transaction(DIRECTORY_HANDLE_STORE, "readonly");
    const request = transaction
      .objectStore(DIRECTORY_HANDLE_STORE)
      .get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onabort = () => db.close();
  });
}
async function storeDirectory(handle, key) {
  const db = await openHandleDatabase();
  if (!db) return false;
  return new Promise((resolve) => {
    const transaction = db.transaction(DIRECTORY_HANDLE_STORE, "readwrite");
    transaction
      .objectStore(DIRECTORY_HANDLE_STORE)
      .put(handle, key);
    transaction.oncomplete = () => {
      db.close();
      resolve(true);
    };
    transaction.onerror = () => {
      db.close();
      resolve(false);
    };
    transaction.onabort = () => {
      db.close();
      resolve(false);
    };
  });
}

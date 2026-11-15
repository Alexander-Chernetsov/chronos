function interpolateMessage(template, variables = {}) {
  return String(template).replace(/\{([a-z0-9][\w-]*)\}/gi, (_, key) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key])
      : `{${key}}`,
  );
}
function tr(key, fallback, variables = {}) {
  return interpolateMessage(
    activeLocaleMessages[key] ?? fallback,
    variables,
  );
}
function trHtml(key, fallback, variables = {}) {
  return escapeHtml(tr(key, fallback, variables));
}
function prepareStaticTranslationBindings() {
  if (staticTextBindings.length || staticAttributeBindings.length) return;
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_COMMENT,
  );
  let comment;
  while ((comment = walker.nextNode())) {
    const value = String(comment.data || "").trim();
    if (!value.startsWith("i18n:")) continue;
    const textNode = comment.nextSibling;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
    const key = value.slice(5);
    const original = textNode.nodeValue || "";
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    staticTextBindings.push({
      key,
      node: textNode,
      base: original.trim(),
      leading,
      trailing,
    });
  }
  ["title", "aria-label", "placeholder", "value"].forEach((attribute) => {
    document
      .querySelectorAll(`[data-i18n-${attribute}]`)
      .forEach((element) => {
        staticAttributeBindings.push({
          key: element.getAttribute(`data-i18n-${attribute}`),
          element,
          attribute,
          base: element.getAttribute(attribute) || "",
        });
      });
  });
}
function translateStaticInterface() {
  prepareStaticTranslationBindings();
  staticTextBindings.forEach((binding) => {
    const translated = activeLocaleMessages[binding.key] ?? binding.base;
    binding.node.nodeValue = `${binding.leading}${translated}${binding.trailing}`;
  });
  staticAttributeBindings.forEach((binding) => {
    const translated = activeLocaleMessages[binding.key] ?? binding.base;
    if (binding.attribute === "value") binding.element.value = translated;
    else binding.element.setAttribute(binding.attribute, translated);
  });
}
function loadLocalePreference() {
  try {
    return localStorage.getItem(LOCALE_KEY) || "default";
  } catch (_) {
    return "default";
  }
}
function saveLocalePreference() {
  try {
    localStorage.setItem(LOCALE_KEY, selectedLocaleId);
  } catch (_) {}
}

function parseLocalePack(sourceText, fileName) {
  const wrapper = sourceText.match(
    /^\s*(?:window\.)?CHRONOS_LOCALE_PACK\s*=\s*([\s\S]*?)\s*;?\s*$/,
  );
  if (!wrapper) return null;
  let parsed;
  try {
    parsed = JSON.parse(wrapper[1]);
  } catch (_) {
    return null;
  }
  return normalizeLocalePack(
    parsed,
    fileName,
    DEFAULT_LOCALE_PACK.messages,
  );
}
function applyLocale(localeId, rerender = true) {
  const pack =
    availableLocales.find((candidate) => candidate.id === localeId) ||
    DEFAULT_LOCALE_PACK;
  activeLocaleId = pack.id;
  activeLocaleMessages = pack.messages || {};
  APP_LOCALE = pack.locale;
  document.documentElement.lang = pack.locale;
  document.documentElement.dataset.locale = pack.locale;
  dateFormatters = createDateFormatters(APP_LOCALE);
  if (rerender && state) {
    render();
  }
  translateStaticInterface();
  syncBootErrors();
  setFileStatus(document.getElementById("saveNote").dataset.status || (dataFileHandle ? "linked" : "local"));
  syncSettingsToggle();
  renderLocaleMenu();
}
async function refreshLocales() {
  if (
    !localeDirectoryHandle ||
    !(await directoryReadable(localeDirectoryHandle))
  ) {
    localeDirectoryAuthorized = false;
    availableLocales = [...bundledLocales];
    applyLocale(selectedLocaleId);
    return;
  }
  localeDirectoryAuthorized = true;
  const locales = [...bundledLocales];
  try {
    for await (const entry of localeDirectoryHandle.values()) {
      if (
        entry.kind !== "file" ||
        !entry.name.toLowerCase().endsWith(".locale.js")
      )
        continue;
      try {
        const file = await entry.getFile();
        const parsed = parseLocalePack(await file.text(), entry.name);
        if (
          parsed &&
          parsed.locale.toLowerCase() !== DEFAULT_LOCALE_PACK.locale.toLowerCase()
        ) {
          for (let index = locales.length - 1; index >= 0; index -= 1) {
            if (locales[index].id === parsed.id ||
                locales[index].locale.toLowerCase() === parsed.locale.toLowerCase()) locales.splice(index, 1);
          }
          locales.push(parsed);
        }
      } catch (error) {
        console.error(`Chronos could not read locale ${entry.name}.`, error);
      }
    }
  } catch (_) {
    localeDirectoryAuthorized = false;
    availableLocales = [...bundledLocales];
    applyLocale(selectedLocaleId);
    return;
  }
  locales.sort((a, b) => a.name.localeCompare(b.name, APP_LOCALE));
  availableLocales = locales;
  if (
    selectedLocaleId !== "default" &&
    !locales.some((locale) => locale.id === selectedLocaleId)
  ) {
    selectedLocaleId = "default";
    saveLocalePreference();
  }
  applyLocale(selectedLocaleId);
}
async function restoreLocaleDirectory() {
  selectedLocaleId = loadLocalePreference();
  localeDirectoryHandle = await readStoredDirectory(
    LOCALE_DIRECTORY_KEY,
  );
  await refreshLocales();
}
async function connectLocaleDirectory() {
  if (!window.showDirectoryPicker) return;
  try {
    localeDirectoryHandle = await chooseDirectory(
      localeDirectoryHandle,
      localeDirectoryAuthorized,
      "chronos-locales",
      LOCALE_DIRECTORY_KEY,
    );
    await refreshLocales();
  } catch (error) {
    if (error?.name !== "AbortError") applyLocale("default");
  }
}
function localeOption(locale) {
  const button = document.createElement("button");
  button.className = "icon-btn visual-theme-option";
  button.dataset.action = "set-locale";
  button.dataset.locale = locale.id;
  button.setAttribute("aria-pressed", String(activeLocaleId === locale.id));
  button.classList.toggle("active-toggle", activeLocaleId === locale.id);
  setTitleAndLabel(
    button,
    locale.name,
    tr("locale.enable", "", { name: locale.name }),
  );
  button.innerHTML = `<span class="locale-code">${escapeHtml(locale.shortLabel)}</span>`;
  return button;
}
function renderLocaleMenu() {
  const actions = document.getElementById("localePopoverActions");
  if (!actions) return;
  const defaultLocale = localeOption(DEFAULT_LOCALE_PACK);
  const connect = document.createElement("button");
  connect.className = "icon-btn";
  connect.dataset.action = "connect-locale-directory";
  connect.disabled = !window.showDirectoryPicker;
  setTitleAndLabel(
    connect,
    localeDirectoryHandle && !localeDirectoryAuthorized
      ? tr("locale.resume_folder", "")
      : localeDirectoryHandle
        ? tr("locale.change_folder", "")
        : tr("locale.connect_folder", ""),
  );
  connect.innerHTML = icons.folder;
  const close = document.createElement("button");
  close.className = "icon-btn settings-close neutral-action";
  close.dataset.action = "close-settings-popover";
  setTitleAndLabel(close, tr("ui.close", ""));
  close.innerHTML =
    '<span class="icon-glyph" aria-hidden="true">×</span>';
  actions.replaceChildren(
    defaultLocale,
    ...availableLocales.map(localeOption),
    settingsDivider(),
    connect,
    close,
  );
  actions.setAttribute("aria-label", tr("locale.popover_label", ""));
  actions.scrollLeft = 0;
}
function selectLocale(localeId) {
  selectedLocaleId =
    localeId === "default" ||
    availableLocales.some((locale) => locale.id === localeId)
      ? localeId
      : "default";
  saveLocalePreference();
  applyLocale(selectedLocaleId);
  closeSettingsPopover(true);
}
function loadVisualThemePreference() {
  try {
    return localStorage.getItem(VISUAL_THEME_KEY) || "default";
  } catch (_) {
    return "default";
  }
}
function saveVisualThemePreference() {
  try {
    localStorage.setItem(VISUAL_THEME_KEY, selectedVisualThemeId);
  } catch (_) {}
}
async function directoryReadable(handle) {
  if (!handle) return false;
  if (typeof handle.queryPermission !== "function") return true;
  try {
    return (await handle.queryPermission({ mode: "read" })) === "granted";
  } catch (_) {
    return false;
  }
}
async function chooseDirectory(handle, authorized, pickerId, storageKey) {
  if (
    handle &&
    !authorized &&
    typeof handle.requestPermission === "function" &&
    (await handle.requestPermission({ mode: "read" })) === "granted"
  )
    return handle;
  const selected = await window.showDirectoryPicker({
    id: pickerId,
    mode: "read",
  });
  await storeDirectory(selected, storageKey);
  return selected;
}
function parseVisualTheme(cssText, fileName) {
  const readProperty = (property) =>
    cssText.match(
      new RegExp(`--chronos-theme-${property}\\s*:\\s*([^;]+);`, "i"),
    )?.[1];
  const themeId = normalizeThemeMetadata(readProperty("id"));
  const name = normalizeThemeMetadata(readProperty("name"));
  const iconPath = normalizeThemeIconPath(readProperty("icon-path"));
  if (!themeId || !name || !iconPath) return null;
  return { id: fileName, themeId, name, iconPath, cssText };
}
function normalizeThemeMetadata(value) {
  const normalized = String(value || "").trim();
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  )
    return normalized.slice(1, -1).trim();
  return normalized;
}
function normalizeThemeIconPath(value) {
  const iconPath = normalizeThemeMetadata(value);
  if (
    iconPath.length > 2048 ||
    !/^[MmLlHhVvCcSsQqTtAaZzEe0-9+.,\s-]+$/.test(iconPath)
  )
    return "";
  const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
  probe.setAttribute("d", iconPath);
  try {
    return probe.getTotalLength() > 0 ? iconPath : "";
  } catch (_) {
    return "";
  }
}
function setVisualThemeIcon(element, iconPath) {
  if (!iconPath) {
    element.innerHTML = icons.palette;
    return;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPath);
  svg.append(path);
  element.replaceChildren(svg);
}
function defaultVisualTheme() {
  if (rootVisualThemeMetadata) return rootVisualThemeMetadata;
  const styles = getComputedStyle(document.documentElement);
  const themeId = normalizeThemeMetadata(
    styles.getPropertyValue("--chronos-theme-id"),
  );
  const configuredName = normalizeThemeMetadata(
    styles.getPropertyValue("--chronos-theme-name"),
  );
  const name = configuredName || "Theme error";
  const iconPath = normalizeThemeIconPath(
    styles.getPropertyValue("--chronos-theme-icon-path"),
  );
  rootVisualThemeMetadata = {
    id: "default",
    themeId,
    name,
    iconPath,
    valid: Boolean(themeId && configuredName && iconPath),
  };
  return rootVisualThemeMetadata;
}
function syncBootErrors() {
  const schemaError = document.getElementById("schemaBootError");
  schemaError.hidden = !loadSchemaError;
  schemaError.textContent = loadSchemaError ? [
    tr(`dimensions.${loadSchemaError}`, ""),
    loadRecoveryState === "recovery-save-error" ? tr("ui.data_error_backup_not_saved", "") : "",
  ].filter(Boolean).join(" ") : "";
  const localeError = document.getElementById("localeBootError");
  const themeError = document.getElementById("themeBootError");
  localeError.hidden = ROOT_LOCALE_VALID;
  themeError.hidden = defaultVisualTheme().valid;
  document.getElementById("bootErrors").hidden =
    localeError.hidden && themeError.hidden && schemaError.hidden;
}
function releaseVisualThemeUrl() {
  if (!activeVisualThemeUrl) return;
  URL.revokeObjectURL(activeVisualThemeUrl);
  activeVisualThemeUrl = null;
}
function applyVisualTheme(themeId) {
  const link = document.getElementById("visualThemeStylesheet");
  const theme = availableVisualThemes.find(
    (candidate) => candidate.id === themeId,
  );
  releaseVisualThemeUrl();
  if (!theme) {
    link.removeAttribute("href");
    document.documentElement.removeAttribute("data-visual-theme");
    activeVisualThemeId = "default";
    syncSettingsToggle();
    renderVisualThemeMenu();
    return;
  }
  activeVisualThemeUrl = URL.createObjectURL(
    new Blob([theme.cssText], { type: "text/css" }),
  );
  link.href = activeVisualThemeUrl;
  document.documentElement.dataset.visualTheme = theme.id;
  activeVisualThemeId = theme.id;
  syncSettingsToggle();
  renderVisualThemeMenu();
}
async function refreshVisualThemes() {
  if (
    !visualThemeDirectoryHandle ||
    !(await directoryReadable(visualThemeDirectoryHandle))
  ) {
    visualThemeDirectoryAuthorized = false;
    availableVisualThemes = [...bundledVisualThemes];
    applyVisualTheme(selectedVisualThemeId);
    return;
  }
  visualThemeDirectoryAuthorized = true;
  const themes = [...bundledVisualThemes];
  try {
    for await (const entry of visualThemeDirectoryHandle.values()) {
      if (
        entry.kind !== "file" ||
        !entry.name.toLowerCase().endsWith(".css")
      )
        continue;
      try {
        const file = await entry.getFile();
        const parsed = parseVisualTheme(await file.text(), entry.name);
        const rootTheme = defaultVisualTheme();
        if (parsed && parsed.themeId !== rootTheme.themeId) {
          for (let index = themes.length - 1; index >= 0; index -= 1) {
            if (themes[index].id === parsed.id || themes[index].themeId === parsed.themeId) themes.splice(index, 1);
          }
          themes.push(parsed);
        }
      } catch (error) {
        console.error(`Chronos could not read theme ${entry.name}.`, error);
      }
    }
  } catch (_) {
    visualThemeDirectoryAuthorized = false;
    availableVisualThemes = [...bundledVisualThemes];
    applyVisualTheme(selectedVisualThemeId);
    return;
  }
  themes.sort((a, b) => a.name.localeCompare(b.name, APP_LOCALE));
  availableVisualThemes = themes;
  if (
    selectedVisualThemeId !== "default" &&
    !themes.some((theme) => theme.id === selectedVisualThemeId)
  ) {
    selectedVisualThemeId = "default";
    saveVisualThemePreference();
  }
  applyVisualTheme(selectedVisualThemeId);
}
async function restoreVisualThemeDirectory() {
  selectedVisualThemeId = loadVisualThemePreference();
  visualThemeDirectoryHandle = await readStoredDirectory(THEME_DIRECTORY_KEY);
  await refreshVisualThemes();
}
async function connectVisualThemeDirectory() {
  if (!window.showDirectoryPicker) return;
  try {
    visualThemeDirectoryHandle = await chooseDirectory(
      visualThemeDirectoryHandle,
      visualThemeDirectoryAuthorized,
      "chronos-themes",
      THEME_DIRECTORY_KEY,
    );
    await refreshVisualThemes();
  } catch (error) {
    if (error?.name !== "AbortError") applyVisualTheme("default");
  }
}
function visualThemeOption(theme) {
  const button = document.createElement("button");
  button.className = "icon-btn visual-theme-option";
  button.dataset.action = "set-visual-theme";
  button.dataset.visualTheme = theme.id;
  button.setAttribute(
    "aria-pressed",
    String(activeVisualThemeId === theme.id),
  );
  button.classList.toggle(
    "active-toggle",
    activeVisualThemeId === theme.id,
  );
  setTitleAndLabel(button, theme.name, tr("theme.enable", "", { 0: theme.name }));
  setVisualThemeIcon(button, theme.iconPath);
  return button;
}
function settingsDivider() {
  const element = document.createElement("span");
  element.className = "visual-theme-popover-divider";
  element.setAttribute("role", "separator");
  element.setAttribute("aria-orientation", "vertical");
  return element;
}
function renderVisualThemeMenu() {
  const actions = document.getElementById("visualThemePopoverActions");
  if (!actions) return;
  const scheme = document.getElementById("themeToggle");
  const base = visualThemeOption(defaultVisualTheme());
  const connect = document.createElement("button");
  connect.className = "icon-btn";
  connect.dataset.action = "connect-visual-theme-directory";
  connect.disabled = !window.showDirectoryPicker;
  setTitleAndLabel(
    connect,
    visualThemeDirectoryHandle && !visualThemeDirectoryAuthorized
      ? tr("theme.folder.restore_access", "")
      : visualThemeDirectoryHandle
        ? tr("theme.folder.change", "")
        : tr("theme.folder.connect", ""),
  );
  connect.innerHTML = icons.folder;
  actions.replaceChildren(
    scheme,
    settingsDivider(),
    base,
    ...availableVisualThemes.map(visualThemeOption),
    settingsDivider(),
    connect,
  );
  actions.scrollLeft = 0;
}
function settingsPopoverOpen() {
  return document.getElementById("settingsPopover").classList.contains("open");
}
function activeLocale() {
  return (
    availableLocales.find((locale) => locale.id === activeLocaleId) ||
    DEFAULT_LOCALE_PACK
  );
}
function activeVisualTheme() {
  return (
    availableVisualThemes.find((theme) => theme.id === activeVisualThemeId) ||
    defaultVisualTheme()
  );
}
function syncSettingsToggle() {
  const button = document.getElementById("settingsToggle");
  if (!button) return;
  const locale = activeLocale();
  const theme = activeVisualTheme();
  const scheme =
    ui().theme === "dark" ? tr("ui.dark_mode", "") : tr("ui.light_mode", "");
  setTitleAndLabel(
    button,
    tr("settings.title", "", { 0: locale.name, 1: theme.name, 2: scheme }),
    tr("settings.open_active", "", {
      0: locale.name,
      1: theme.name,
      2: scheme,
    }),
  );
  button.innerHTML = icons.settings;
  button.setAttribute("aria-expanded", String(settingsPopoverOpen()));
  button.classList.toggle("active-toggle", settingsPopoverOpen());
}
async function toggleSettingsPopover() {
  if (settingsPopoverOpen()) {
    closeSettingsPopover(true);
    return;
  }
  if (focusPendingTaskDraft()) return;
  closeDimensionManager();
  closeTaskMarkerFilterPopovers();
  closeFilePopover();
  closeEditorFilterPopover();
  showHeaderPopover(document.getElementById("settingsPopover"));
  syncSettingsToggle();
  await refreshLocales();
  await refreshVisualThemes();
}
function closeSettingsPopover(returnFocus = false) {
  const popover = document.getElementById("settingsPopover");
  if (!popover.classList.contains("open")) return;
  hideHeaderPopover(popover);
  syncSettingsToggle();
  if (returnFocus)
    document.getElementById("settingsToggle").focus({
      preventScroll: true,
    });
}
function selectVisualTheme(themeId) {
  selectedVisualThemeId = availableVisualThemes.some(
    (theme) => theme.id === themeId,
  )
    ? themeId
    : "default";
  saveVisualThemePreference();
  applyVisualTheme(selectedVisualThemeId);
  closeSettingsPopover(true);
}
function applyColorScheme() {
  document.documentElement.dataset.theme =
    ui().theme === "dark" ? "dark" : "light";
}
function syncColorSchemeToggle() {
  const dark = ui().theme === "dark";
  const btn = document.getElementById("themeToggle");
  setTitleAndLabel(
    btn,
    dark ? tr("ui.light_mode", "") : tr("ui.dark_mode", ""),
    dark ? tr("ui.enable_light_mode", "") : tr("ui.enable_dark_mode", ""),
  );
  btn.innerHTML = dark ? icons.sun : icons.moon;
  btn.classList.toggle("active-toggle", dark);
  btn.setAttribute("aria-pressed", String(dark));
  syncSettingsToggle();
}
function toggleColorScheme() {
  ui().theme = ui().theme === "dark" ? "light" : "dark";
  applyColorScheme();
  commit();
  closeSettingsPopover(true);
}

function dimensionManagerOpen() {
  return document.getElementById("dimensionManagerPopover").classList.contains("open");
}
function toggleDimensionManager() {
  if (dimensionManagerOpen()) {
    closeDimensionManager(true);
    return;
  }
  if (loadSchemaError || focusPendingTaskDraft()) return;
  closeTaskMarkerFilterPopovers();
  closeEditorFilterPopover();
  closeSettingsPopover();
  closeFilePopover();
  closeColumnActionsPopover();
  closeTaskMenu();
  hideDatePopover();
  const popover = document.getElementById("dimensionManagerPopover");
  const input = document.getElementById("newDimensionSymbol");
  input.value = "";
  clearDimensionError();
  renderDimensionManager();
  showHeaderPopover(popover);
  document.getElementById("dimensionManagerToggle").setAttribute("aria-expanded", "true");
  input.focus({ preventScroll: true });
}
function closeDimensionManager(returnFocus = false) {
  const popover = document.getElementById("dimensionManagerPopover");
  if (!popover.classList.contains("open")) return;
  hideHeaderPopover(popover);
  const trigger = document.getElementById("dimensionManagerToggle");
  trigger.setAttribute("aria-expanded", "false");
  syncHeaderPopoverState();
  if (returnFocus) trigger.focus({ preventScroll: true });
}
function renderDimensionManager() {
  const host = document.getElementById("dimensionColors");
  host.replaceChildren(...activeDimensions().map((symbol) => {
    const row = document.createElement("li");
    row.className = "dimension-color-row";
    row.style.setProperty("--marker-hue", dimensionHue(symbol));
    const label = span("dimension-symbol", symbol);
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "dimension-color-trigger";
    setTitleAndLabel(trigger, tr("dimensions.color", "", { 0: symbol }));
    trigger.setAttribute("aria-expanded", "false");
    const palette = div("dimension-palette");
    palette.hidden = true;
    DIMENSION_COLOR_PRESETS.forEach((hue) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dimension-swatch";
      button.style.setProperty("--marker-hue", hue);
      button.setAttribute("aria-pressed", String(dimensionHue(symbol) === hue));
      setTitleAndLabel(button, tr("dimensions.hue", "", { 0: hue }));
      button.onclick = () => {
        if (loadSchemaError || focusPendingTaskDraft()) return;
        state[DIMENSION_COLORS][symbol] = hue;
        commit();
        row.style.setProperty("--marker-hue", hue);
        palette.querySelectorAll("button").forEach((option) =>
          option.setAttribute("aria-pressed", String(option === button)),
        );
        palette.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus({ preventScroll: true });
      };
      palette.append(button);
    });
    trigger.onclick = () => {
      const open = palette.hidden;
      host.querySelectorAll(".dimension-palette").forEach((element) => {
        element.hidden = true;
      });
      host.querySelectorAll(".dimension-color-trigger").forEach((element) =>
        element.setAttribute("aria-expanded", "false"),
      );
      palette.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    };
    const remove = iconButton(icons.trash, tr("dimensions.remove_named", "", { 0: symbol }), () => {
      if (loadSchemaError || focusPendingTaskDraft()) return;
      setEnabledDimensions(activeDimensions().filter((value) => value !== symbol));
      document.getElementById("newDimensionSymbol").focus({ preventScroll: true });
    }, "dimension-remove danger-on-interaction");
    remove.type = "button";
    row.append(label, trigger, remove, palette);
    return row;
  }));
}
function clearDimensionError() {
  document.getElementById("dimensionError").hidden = true;
  document.getElementById("newDimensionSymbol").removeAttribute("aria-invalid");
}
function addDimension() {
  if (loadSchemaError || focusPendingTaskDraft()) return;
  const input = document.getElementById("newDimensionSymbol");
  const symbol = input.value.trim();
  const valid = validDimensionSymbol(symbol);
  const error = document.getElementById("dimensionError");
  if (!valid || activeDimensions().includes(symbol)) {
    error.hidden = false;
    error.textContent = valid ? tr("dimensions.duplicate", "") : tr("dimensions.invalid", "");
    input.setAttribute("aria-invalid", "true");
    return;
  }
  input.value = "";
  setEnabledDimensions([...activeDimensions(), symbol]);
  input.focus({ preventScroll: true });
}
function setEnabledDimensions(symbols) {
  closeTaskMarkerFilterPopovers();
  closeMarkerSuggestions();
  state[DIMENSIONS] = symbols;
  symbols.forEach((symbol, index) => {
    if (!Object.hasOwn(state[DIMENSION_COLORS], symbol))
      state[DIMENSION_COLORS][symbol] = DIMENSION_HUES[index % DIMENSION_HUES.length];
  });
  Object.keys(taskMarkerFilters).forEach((symbol) => {
    if (!symbols.includes(symbol)) delete taskMarkerFilters[symbol];
  });
  if (!filterActive()) filterColumnWidth = null;
  clearDimensionError();
  commit();
  renderDimensionManager();
}

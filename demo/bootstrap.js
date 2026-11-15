// Runs after the canonical parsers, before the canonical application starts.
{
  const packs = globalThis.CHRONOS_DEMO_PACKS;
  const themes = packs.themes.map(({name, source}) => parseVisualTheme(source, name));
  const locales = packs.locales.map(({name, source}) => parseLocalePack(source, name));
  if (themes.some(pack => !pack) || locales.some(pack => !pack)) {
    throw new Error("Invalid bundled demo package");
  }
  bundledVisualThemes = themes.filter(pack => pack.themeId !== defaultVisualTheme().themeId);
  bundledLocales = locales.filter(pack => pack.locale.toLowerCase() !== DEFAULT_LOCALE_PACK.locale.toLowerCase());
  delete globalThis.CHRONOS_DEMO_PACKS;

  try {
    if (localStorage.getItem(STORAGE_KEY) === null) {
      const example = seed();
      example[UI].theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      example[UI].dayCount = 7;
      example[UI].todayColumnIndex = 1;
      const today = todayStart();
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const later = new Date(today); later.setDate(later.getDate() + 3);
      const personalDay = new Date(today); personalDay.setDate(personalDay.getDate() + 5);
      example[INBOX] = [task("Plan the week #work @Irene", "Try editing a title or adding a comment."),
        task("Read a chapter #personal", "Tasks, settings and examples stay in this demo's browser storage.")];
      example[dateKey(today)] = [task("!⭐ Review the proposal #work @Irene"),
        {...task("!🔥 Check the delivery #work", "The robot marks an example edited by an agent."), lastEditedByAgent: true}];
      example[dateKey(tomorrow)] = [task("Prepare the next steps #work")];
      example[dateKey(later)] = [task("Schedule a check-in @Irene #work")];
      example[dateKey(personalDay)] = [task("Take a long walk #personal")];
      example[CONTROL] = [task("Await feedback @Irene #work")];
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      example[ARCHIVE] = [{...task("Send the draft #work @Irene", "A completed example. Restore it to today to try again."), archivedAt: yesterday}];
      example[TRASH] = [{...task("Replace this outline #work", "A discarded example. Restore it or delete it permanently."), deletedAt: yesterday}];
      validateIncomingData(example);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(example));
    }
    if (localStorage.getItem(VISUAL_THEME_KEY) === null) {
      localStorage.setItem(VISUAL_THEME_KEY, "graphite-moss.css");
    }
  } catch (error) {
    // Do not reseed or replace an inaccessible/corrupted existing snapshot.
    console.warn("Demo examples could not be initialized", error);
  }

  const text = {
    en: ["Demo · example tasks, stored in this browser", "Download", "Source", "Reset demo",
      "Reset only this demo's tasks and preferences?", "Reload the page to disconnect your file before resetting the demo."],
    ru: ["Демо · учебные задачи хранятся в браузере", "Скачать", "Исходники", "Сбросить демо",
      "Сбросить задачи и настройки только этой демонстрации?", "Перезагрузите страницу, чтобы отключить файл перед сбросом демо."],
    de: ["Demo · Beispielaufgaben bleiben in diesem Browser", "Herunterladen", "Quellcode", "Demo zurücksetzen",
      "Nur Aufgaben und Einstellungen dieser Demo zurücksetzen?", "Laden Sie die Seite neu, um Ihre Datei vor dem Zurücksetzen zu trennen."],
    cs: ["Demo · ukázkové úkoly zůstávají v tomto prohlížeči", "Stáhnout", "Zdrojový kód", "Obnovit demo",
      "Obnovit pouze úkoly a nastavení tohoto dema?", "Před obnovením dema znovu načtěte stránku, aby se soubor odpojil."]
  };
  const labels = () => text[document.documentElement.lang.split("-")[0]] || text.en;
  const translate = () => {
    ["demoNotice", "demoDownload", "demoSource", "demoReset"].forEach((id, index) => {
      document.getElementById(id).textContent = labels()[index];
    });
  };
  translate();
  new MutationObserver(translate).observe(document.documentElement, {attributes: true, attributeFilter: ["lang"]});
  const reset = document.getElementById("demoReset");
  reset.addEventListener("click", async () => {
    if (dataFileHandle || linkedWriteActive || pendingFileWrite) {
      alert(labels()[5]);
      return;
    }
    if (!confirm(labels()[4])) return;
    reset.disabled = true;
    try {
      const keys = [STORAGE_KEY, RECOVERY_KEY, VISUAL_THEME_KEY, LOCALE_KEY];
      const snapshot = JSON.stringify(state);
      const stored = keys.map(key => localStorage.getItem(key));
      const themeHandle = visualThemeDirectoryHandle, localeHandle = localeDirectoryHandle;
      const unchanged = () => !dataFileHandle && !linkedWriteActive && !pendingFileWrite &&
        !hasUncommittedInput() && JSON.stringify(state) === snapshot &&
        keys.every((key, index) => localStorage.getItem(key) === stored[index]) &&
        themeHandle === visualThemeDirectoryHandle && localeHandle === localeDirectoryHandle;
      const db = await openHandleDatabase();
      if (!db || !unchanged()) {
        db?.close();
        note("cancelled");
        return;
      }
      const cleared = await new Promise(resolve => {
        const transaction = db.transaction(DIRECTORY_HANDLE_STORE, "readwrite");
        const store = transaction.objectStore(DIRECTORY_HANDLE_STORE);
        store.delete(THEME_DIRECTORY_KEY);
        store.delete(LOCALE_DIRECTORY_KEY);
        transaction.oncomplete = () => { db.close(); resolve(true); };
        transaction.onerror = transaction.onabort = () => { db.close(); resolve(false); };
      });
      if (!cleared || !unchanged()) { note("cancelled"); return; }
      for (const key of keys) localStorage.removeItem(key);
      location.reload();
    } catch (error) {
      console.warn("Demo reset was cancelled", error);
      note("cancelled");
    } finally {
      reset.disabled = false;
    }
  });
}

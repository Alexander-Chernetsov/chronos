# Start Chronos

English · [Русский](START.ru.md)

1. Extract the whole ZIP into a folder you control.
2. Open `chronos.html` in current Chrome, Edge or Brave. No installation or Node required.
3. Use `+` to add tasks. Press `?` for the offline keyboard/data reference.
4. In settings, select the supplied `themes/` and `locales/` folders to enable
   all 23 themes and four languages. Grant access when the browser asks.

Without those folders, the HTML still contains the standard theme and English.
The theme chooser and language buttons remember your choice in this browser.

Tasks initially live in this browser's localStorage. Use Save to export a JSON,
then connect it with the file indicator beside Save for automatic writes. Export backups regularly.
Done and Bin automatically delete tasks after seven days.

Use a supported browser for file/folder integration. There is no alternative
file import/export when its File System Access API is missing. Older JSON
formats are rejected rather than silently migrated.

[Full guide and source](https://github.com/Alexander-Chernetsov/chronos)
· [Online demo](https://alexander-chernetsov.github.io/chronos/)

The optional agent CLI requires the source repository and Node; it is not in this ZIP.
Chronos is a low-maintenance personal project. MIT License is included in `LICENSE`
and in the standalone HTML.

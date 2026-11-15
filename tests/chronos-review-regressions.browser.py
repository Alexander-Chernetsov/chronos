"""Behavior regressions from the Fable 5.2 branch review; synthetic data only."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import subprocess
import tempfile
import sys

sys.stdout.reconfigure(encoding='utf-8')

root = Path(__file__).resolve().parents[1]
sample = {
    '__schema__': 1, '__dimensions__': ['#', '@', '!'],
    '__dimensionColors__': {'#': 85, '@': 305, '!': 25},
    '__ui__': {'dayCount': 7, 'collapsed': [], 'todayColumnIndex': 1,
               'theme': 'light', 'view': 'board', 'expandedKey': None,
               'filterLastEditor': 'all'},
    '__inbox__': [{'id': 1, 'text': 'Review #work @Ирина', 'comment': '',
                   'lastEditedByAgent': False}],
    '__control__': [], '__archive__': [], '__trash__': []}
legacy = '{ "__inbox__": [{"id":9,"text":"Original #keep"}] }\n'
failures = []

with tempfile.TemporaryDirectory(prefix='chronos-review-') as temporary, sync_playwright() as p:
    candidate = Path(temporary) / 'candidate.html'
    subprocess.run(['node', str(root / 'tools/build-standalone.mjs'), str(candidate)],
                   cwd=root, check=True, capture_output=True)
    browser = p.chromium.launch(headless=True)

    def check(name, body, init='', mobile=False):
        context = browser.new_context(
            viewport={'width': 390 if mobile else 1600, 'height': 844 if mobile else 900},
            has_touch=mobile, is_mobile=mobile)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("if(localStorage.getItem('chronos-planner-v2')===null)"
                             "localStorage.setItem('chronos-planner-v2',JSON.stringify(" + json.dumps(sample) + "));" + init)
        try:
            page.goto(candidate.as_uri())
            body(page)
            assert not errors, errors
            print('PASS:', name)
        except Exception as error:
            failures.append((name, str(error)))
            print('FAIL:', name, str(error))
        finally:
            context.close()

    def storage_access(page):
        actual = page.evaluate('''() => {
          const get = Storage.prototype.getItem;
          Storage.prototype.getItem = () => {throw new DOMException('blocked', 'SecurityError')};
          load(); Storage.prototype.getItem = get;
          render(); syncBootErrors();
          return {schema: loadSchemaError, inert: document.getElementById('board').inert,
                  bannerHidden: document.getElementById('schemaBootError').hidden};
        }''')
        assert actual == {'schema': None, 'inert': False, 'bannerHidden': True}, actual

    def modal_isolation(page):
        actual = page.evaluate('''() => {
          openHelp(); const before = document.getElementById('board').inert;
          render(); return {before, after: document.getElementById('board').inert,
            open: document.getElementById('helpLayer').classList.contains('open')};
        }''')
        assert actual == {'before': True, 'after': True, 'open': True}, actual
        page.keyboard.press('Escape')
        assert not page.locator('#board').evaluate('el => el.inert')

    def badge_focus(page):
        actual = page.evaluate('''() => {
          document.querySelector('.task-marker').focus();
          return {changed: hasChangedTaskText(), pending: hasUncommittedInput(),
            unsaved: hasUnsavedWork(), blocked: shortcutBlocked({target: document.activeElement})};
        }''')
        assert actual == {'changed': False, 'pending': False, 'unsaved': False, 'blocked': False}, actual
        page.evaluate('setSearch("Review");document.querySelector(".task-marker").focus()')
        page.keyboard.press('Escape')
        assert not page.evaluate('filterActive()')
        # Real inline edits must still protect unsaved input.
        page.locator('.task-text').first.focus()
        page.locator('.task-text').first.fill('Changed #work')
        assert page.evaluate('hasChangedTaskText() && hasUncommittedInput() && hasUnsavedWork()')

    def recovery_import(page):
        # Another tab may change STORAGE_KEY; recovery must retain the failed-load bytes.
        actual = page.evaluate('''async sample => {
          const before = JSON.stringify(state);
          const incoming = JSON.stringify(sample);
          const handle = {getFile: async () => ({text: async () => incoming})};
          window.showOpenFilePicker = async () => [handle];
          localStorage.setItem(STORAGE_KEY, 'another-tab-snapshot');
          await openDataFile();
          const blocked = {state: JSON.stringify(state) === before, handle: dataFileHandle === null,
            storage: localStorage.getItem(STORAGE_KEY),
            recoveryErrorVisible: document.getElementById('saveNote').title === tr('ui.data_error_backup_not_saved', '')};
          Storage.prototype.setItem = window.originalSetItem;
          await openDataFile();
          return {blocked, backup: localStorage.getItem(RECOVERY_KEY),
            imported: state.__inbox__[0].text === sample.__inbox__[0].text,
            linked: dataFileHandle === handle, schema: loadSchemaError};
        }''', sample)
        assert actual['blocked']['state'] and actual['blocked']['handle'], actual
        assert actual['blocked']['storage'] == 'another-tab-snapshot', actual
        assert actual['blocked']['recoveryErrorVisible'], actual
        assert actual['backup'] == legacy, actual
        assert actual['imported'] and actual['linked'] and actual['schema'] is None, actual

    def error_translation(page):
        pack = (root / 'chronos-2.0/locales/russian.locale.js').read_text(encoding='utf-8')
        actual = page.evaluate('''source => {
          const pack = parseLocalePack(source, 'russian.locale.js');
          availableLocales = [pack]; applyLocale(pack.id);
          return {banner: document.getElementById('schemaBootError').textContent,
            schema: tr('dimensions.schema_old', ''), recovery: tr('ui.data_error_backup_not_saved', ''),
            status: document.getElementById('saveNote').title,
            state: loadSchemaError, language: document.documentElement.lang};
        }''', pack)
        assert actual['schema'] in actual['banner'], actual
        assert actual['recovery'] in actual['banner'], actual
        assert actual['status'] == actual['recovery'], actual
        assert actual['state'] == 'schema_old' and actual['language'].startswith('ru'), actual

    def malformed_storage(page):
        actual = page.evaluate('''() => {
          const raw = localStorage.getItem(STORAGE_KEY);
          const replacement = JSON.stringify(state);
          const first = persistLocalSnapshot(replacement);
          const unchanged = localStorage.getItem(STORAGE_KEY) === raw;
          Storage.prototype.setItem = window.originalSetItem;
          const retry = persistLocalSnapshot(replacement);
          return {schema: loadSchemaError, first, unchanged, retry,
            backup: localStorage.getItem(RECOVERY_KEY) === raw,
            replaced: localStorage.getItem(STORAGE_KEY) === replacement};
        }''')
        assert actual == {'schema': None, 'first': False, 'unchanged': True,
                          'retry': True, 'backup': True, 'replaced': True}, actual

    def status_translation(page):
        pack = (root / 'chronos-2.0/locales/russian.locale.js').read_text(encoding='utf-8')
        actual = page.evaluate('''source => {
          const pack = parseLocalePack(source, 'russian.locale.js'); availableLocales = [pack];
          return [['schema_old', 'dimensions.schema_old'], ['save error', 'ui.save_failed'],
                  ['linked', 'ui.file_open']].map(([token, key]) => {
            applyLocale('default'); setFileStatus(token); const before = document.getElementById('saveNote').title;
            applyLocale(pack.id); const el = document.getElementById('saveNote');
            return {token, retained: el.dataset.status === token,
              translated: el.title === tr(key, ''), changed: el.title !== before};
          });
        }''', pack)
        assert all(row['retained'] and row['translated'] and row['changed'] for row in actual), actual

    def popup_color(page):
        page.add_style_tag(content=(root / 'chronos-2.0/themes/cobalt-porcelain.css').read_text(encoding='utf-8'))
        page.evaluate("document.documentElement.dataset.theme = 'dark'")
        page.locator('#dimensionManagerToggle').click()
        actual = page.evaluate('''() => {
          const panel = document.getElementById('dimensionManagerPopover');
          const probe = document.createElement('span'); probe.style.color = 'var(--text)'; panel.append(probe);
          const result = {actual: getComputedStyle(panel.querySelector('h3')).color,
                          expected: getComputedStyle(probe).color}; probe.remove(); return result;
        }''')
        assert actual['actual'] == actual['expected'], actual

    def missing_file_api(page):
        before = page.evaluate('JSON.stringify(state)')
        stored = page.evaluate('localStorage.getItem(STORAGE_KEY)')
        page.evaluate('window.showOpenFilePicker=undefined;window.showSaveFilePicker=undefined')
        for action in ['open-file', 'save-file']:
            page.locator('#saveNote').click()
            page.locator(f'[data-action="{action}"]').click()
            actual = page.locator('#saveNote').get_attribute('data-status')
            assert actual == 'file api unavailable', (action, actual)
            assert page.locator('#saveNote').get_attribute('title') == 'This browser does not support this file operation. Open Chronos in Chrome, Edge or Brave.'
            assert page.locator('#saveNote').evaluate('el=>el.classList.contains("error")')
            assert page.evaluate('JSON.stringify(state)') == before
            assert page.evaluate('localStorage.getItem(STORAGE_KEY)') == stored
            page.keyboard.press('Escape')
        for locale_path in sorted((root / 'chronos-2.0/locales').glob('*.locale.js')):
            page.evaluate('''source=>{
              const pack=parseLocalePack(source,'review.locale.js');availableLocales=[pack];applyLocale(pack.id);
            }''', locale_path.read_text(encoding='utf-8'))
            assert page.locator('#saveNote').get_attribute('data-status') == 'file api unavailable'
            assert page.evaluate('document.getElementById("saveNote").title===tr("ui.file_api_unavailable","")')
            assert page.evaluate('document.getElementById("fileStatusLive").textContent===tr("ui.file_api_unavailable","")')
        page.evaluate('applyLocale("default")')
        for error, expected in [('AbortError','cancelled'),('NotAllowedError','open error')]:
            page.evaluate('name=>window.showOpenFilePicker=async()=>{throw new DOMException("Test",name)}', error)
            page.locator('#saveNote').click()
            page.locator('[data-action="open-file"]').click()
            assert page.locator('#saveNote').get_attribute('data-status') == expected
            page.keyboard.press('Escape')

    def card_layout(page):
        page.evaluate('''() => {
          state.__inbox__ = [
            {id: 10, text: 'Brief', comment: '', lastEditedByAgent: true},
            {id: 11, text: 'Long task description with wrapping words '.repeat(6),
              comment: 'Shown first line\\nHidden second line', lastEditedByAgent: true},
            {id: 12, text: 'Brief', comment: '', lastEditedByAgent: false},
          ]; render();
        }''')
        geometry = page.evaluate("""()=>[...document.querySelectorAll('.task')].map(card => {
          const box = card.getBoundingClientRect();
          const robot = card.querySelector('.task-title-row > .last-editor-mark')?.getBoundingClientRect();
          return {id:card.dataset.id,height:box.height,oldRail:!!card.querySelector('.task-left'),
            robot:robot?{width:robot.width,height:robot.height}:null};
        })""")
        assert all(not card['oldRail'] for card in geometry),geometry
        for card in geometry[:2]:
            assert card['robot'],card
            if page.evaluate('matchMedia("(pointer: coarse)").matches'):
                assert min(card['robot']['width'],card['robot']['height'])>=44,card
        assert geometry[0]['height']<90,geometry
        assert geometry[1]['height']>geometry[0]['height'],geometry
        assert geometry[2]['robot'] is None,geometry
        preview = page.locator('.task[data-id="11"] .comment-preview')
        assert preview.get_attribute('aria-label') == 'Comment: Shown first line'
        # Enlarging/moving the robot must preserve its actual filter action.
        robot = page.locator('.task[data-id="10"] .last-editor-mark')
        robot.scroll_into_view_if_needed()
        if page.evaluate('matchMedia("(pointer: coarse)").matches'):
            robot.tap()
        else:
            robot.focus(); page.keyboard.press('Enter')
        assert page.evaluate('ui().filterLastEditor') == 'agent'
        assert page.locator('.task').count() == 2

    def failed_recovery(raw):
        return ("localStorage.setItem('chronos-planner-v2'," + json.dumps(raw) + ");"
                "window.originalSetItem=Storage.prototype.setItem;"
                "Storage.prototype.setItem=function(key,value){"
                "if(key==='chronos-planner-v2-recovery')throw new DOMException('full','QuotaExceededError');"
                "return window.originalSetItem.call(this,key,value);};")

    def bulk_ids(page):
        page.evaluate('''() => {
          state.__control__.push({id:'existing-string-id',text:'Existing string',comment:'Keep',lastEditedByAgent:true});
          render();
        }''')

        def add_lines(prefix):
            page.evaluate('openNewTask(INBOX,true)')
            panel = page.locator('.column[data-key="__inbox__"] .new-task-panel')
            lines = [f'{prefix} {index} @Ирина task' for index in range(300)]
            panel.locator('textarea').fill('\n'.join(lines))
            panel.locator('.btn-primary').click()
            return lines

        lines = add_lines('Bulk')
        before = page.evaluate('JSON.parse(serializeState())')
        tasks = before['__inbox__'] + before['__control__']
        assert len({str(item['id']) for item in tasks}) == len(tasks), 'bulk created duplicate IDs'
        assert [item['text'] for item in before['__inbox__']] == lines + [sample['__inbox__'][0]['text']]
        assert before['__inbox__'][-1]['id'] == 1
        assert before['__control__'][0]['id'] == 'existing-string-id'
        assert page.evaluate('JSON.parse(localStorage.getItem(STORAGE_KEY))') == before
        page.reload()
        assert page.evaluate('JSON.parse(serializeState())') == before, 'reload changed IDs, text, order or metadata'
        assert page.evaluate('loadRecoveryState') is None
        assert page.evaluate('localStorage.getItem(RECOVERY_KEY)') is None
        more_lines = add_lines('Second bulk')
        after = page.evaluate('JSON.parse(serializeState())')
        assert after['__inbox__'][300:] == before['__inbox__']
        assert [item['text'] for item in after['__inbox__'][:300]] == more_lines
        ids = [str(item['id']) for item in after['__inbox__'] + after['__control__']]
        assert len(set(ids)) == len(ids)
        # Exercise the export path without opening or writing a real user file.
        exported = page.evaluate('''async () => {
          let output;
          window.showSaveFilePicker=async()=>({createWritable:async()=>({
            write:async snapshot=>{output=snapshot;},close:async()=>{}
          })});
          if(!await exportDataFile()) throw new Error('Export failed');
          validateIncomingData(JSON.parse(output));return JSON.parse(output);
        }''')
        assert exported == after
        cli_file = Path(temporary) / 'bulk-export.json'
        cli_file.write_text(json.dumps(exported), encoding='utf-8')
        cli_result = subprocess.run(['node', str(root / '.agents/skills/chronos-planning/scripts/chronos-data.mjs'),
                                     'summary', '--data', str(cli_file), '--json'], capture_output=True, text=True)
        assert cli_result.returncode == 0, cli_result.stderr
        # Numeric, pre-existing string and newly generated IDs share the same operations.
        page.evaluate('''() => {
          const generated=state.__inbox__[0].id;
          for(const [from,id] of [[INBOX,1],[CONTROL,'existing-string-id'],[INBOX,generated]]) {
            const original={...findTask(from,id)};
            const destination=from===INBOX?CONTROL:INBOX;
            moveTask(from,destination,id);
            archiveTask(destination,id);
            restoreBinItem(ARCHIVE,id);
            const today=dateKey(todayStart());
            trashTask(today,id);
            restoreBinItem(TRASH,id);
            if(JSON.stringify(findTask(today,id))!==JSON.stringify(original)) throw new Error('Task changed during ID lifecycle');
            closeModals();
          }
        }''')
        final = page.evaluate('JSON.parse(serializeState())')
        page.reload()
        assert page.evaluate('JSON.parse(serializeState())') == final
        assert page.evaluate('loadRecoveryState') is None

    recovery_init = failed_recovery(legacy)
    check('storage access error is not schema incompatibility', storage_access)
    check('render preserves modal isolation', modal_isolation)
    check('badge focus and actual inline edits stay distinct', badge_focus)
    check('failed recovery blocks import; retry preserves original bytes', recovery_import, recovery_init)
    check('schema and recovery messages retranslate together', error_translation, recovery_init)
    check('normal file status tokens survive locale changes', status_translation,
          "localStorage.setItem('chronos-planner-v2'," + json.dumps(legacy) + ");")
    check('malformed JSON preserves recovery before replacing local snapshot', malformed_storage,
          failed_recovery('{broken-json\n'))
    check('header popover inherits theme text color', popup_color)
    check('missing file API explains limitation without changing data', missing_file_api)
    check('card anchors, comment accessible name and robot keyboard action', card_layout)
    check('card touch targets and robot tap action', card_layout, mobile=True)
    check('bulk IDs, export and mixed-ID lifecycle survive real reload', bulk_ids,
          'const fixedNow=Date.now();Date.now=()=>fixedNow;Math.random=()=>0.5;')
    browser.close()

assert not failures, failures

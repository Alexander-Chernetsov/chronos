"""Compact cards, tag menus, quick reference and destructive-action contracts."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json
import subprocess
import tempfile
import sys

sys.stdout.reconfigure(encoding='utf-8')
expect.set_options(timeout=2000)

root = Path(__file__).resolve().parents[1]
sample = {
    '__schema__': 1, '__dimensions__': ['#', '@', '!'],
    '__dimensionColors__': {'#': 85, '@': 305, '!': 25},
    '__ui__': {'dayCount': 2, 'collapsed': [], 'todayColumnIndex': 1, 'theme': 'light',
               'view': 'board', 'expandedKey': None, 'filterLastEditor': 'all'},
    '__inbox__': [
        {'id': 1, 'text': 'Task #a @Ирина', 'comment': 'First line', 'lastEditedByAgent': True},
        {'id': 2, 'text': 'Other #longest', 'comment': '', 'lastEditedByAgent': False}],
    '__control__': [], '__archive__': [], '__trash__': []}
failures = []

with tempfile.TemporaryDirectory(prefix='chronos-compact-') as temporary, sync_playwright() as p:
    candidate = Path(temporary) / 'candidate.html'
    subprocess.run(['node', str(root / 'tools/build-standalone.mjs'), str(candidate)],
                   check=True, cwd=root, capture_output=True)
    browser = p.chromium.launch(headless=True)

    def check(name, body, mobile=False):
        context = browser.new_context(viewport={'width': 390 if mobile else 1280, 'height': 844},
                                      is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        page.set_default_timeout(2000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("localStorage.setItem('chronos-planner-v2',JSON.stringify(" + json.dumps(sample) + "))")
        try:
            page.goto(candidate.as_uri())
            if mobile:
                page.evaluate('openExpandedColumn("__inbox__")')
            body(page)
            assert not errors, errors
            print('PASS:', name)
        except Exception as error:
            failures.append((name, str(error)))
            print('FAIL:', name, str(error))
        finally:
            context.close()

    def card(page):
        first = page.locator('.task[data-id="1"]')
        expect(first.locator('.task-left, input.check')).to_have_count(0)
        robot = first.locator('.task-title-row > .last-editor-mark')
        expect(robot).to_have_count(1)
        assert not robot.evaluate('el=>el.closest("[contenteditable=true]")')
        assert page.locator('.task[data-id="2"] .last-editor-mark').count() == 0
        before = first.bounding_box()['height']
        if page.evaluate('matchMedia("(pointer: coarse)").matches'):
            box = robot.bounding_box()
            assert min(box['width'], box['height']) >= 44, box
            expect(first.locator('.task-done-action')).to_be_hidden()
            first.locator('.task-menu-trigger').tap()
            expect(page.locator('#menu > button').first).to_have_attribute('data-done', '')
            page.locator('#menu [data-done]').tap()
        else:
            first.evaluate('el=>el.style.width="170px"')
            first.hover()
            assert abs(first.bounding_box()['height'] - before) <= 1
            assert first.evaluate('''el=>{
              const text=el.querySelector('.task-text');const range=document.createRange();
              range.setStart(text.firstChild,0);range.setEnd(text.firstChild,4);
              return range.getBoundingClientRect().right<=el.querySelector('.task-action-drawer').getBoundingClientRect().left;
            }'''), 'actions must leave the actual first word visible at minimum card width'
            actions = first.locator('.task-action-drawer > button')
            assert actions.count() == 3
            expect(actions.first).to_have_class('icon-btn task-done-action')
            first.locator('.task-done-action').focus()
            page.keyboard.press('Enter')
        assert page.evaluate('state.__archive__[0].text') == sample['__inbox__'][0]['text']
        assert page.evaluate('state.__inbox__.length') == 1

    def robot_edit(page):
        text = page.locator('.task[data-id="1"] .task-text')
        text.focus()
        expect(text).to_have_text(sample['__inbox__'][0]['text'])
        text.fill('Changed @Ирина')
        text.press('Escape')
        text.press('Enter')
        assert page.evaluate('state.__inbox__[0].text') == 'Changed @Ирина'
        expect(page.locator('.task[data-id="1"] .last-editor-mark')).to_have_count(0)

    def popup(page):
        page.locator('.task-marker-filter-trigger[data-marker-kind="#"]').click()
        panel = page.locator('.task-marker-filter-popover.open')
        rows = panel.locator('.task-marker-filter-popover-actions button')
        boxes = [rows.nth(i).bounding_box() for i in range(rows.count())]
        assert len(boxes) == 2
        assert boxes[1]['y'] >= boxes[0]['y'] + boxes[0]['height'], boxes
        assert max(box['width'] for box in boxes) - min(box['width'] for box in boxes) <= 1
        short_width = panel.bounding_box()['width']
        assert short_width < 220, short_width
        rows.first.click()
        page.locator('.task-marker-filter-trigger[data-marker-kind="#"]').click()
        selected = panel.locator('.task-marker-filter-option.active-toggle').bounding_box()
        assert abs(selected['width'] - boxes[0]['width']) <= 1
        page.keyboard.press('Escape')
        page.evaluate('clearAllFilters();state.__inbox__[0].text="#"+"long".repeat(100);render()')
        page.locator('.task-marker-filter-trigger[data-marker-kind="#"]').click()
        assert panel.evaluate('el=>el.scrollWidth<=el.clientWidth')
        bounds = panel.bounding_box()
        width = page.evaluate('document.documentElement.clientWidth')
        trigger = page.locator('.task-marker-filter-trigger[data-marker-kind="#"]').bounding_box()
        expected_x = max(8, min(trigger['x'], width - bounds['width'] - 8))
        assert abs(bounds['x'] - expected_x) <= 1
        assert bounds['width'] <= (width - 16 if width < 760 else width / 2) + 1
        page.keyboard.press('Escape')
        page.evaluate('clearAllFilters();state.__inbox__=[task("#x")];render();setTaskMarkerFilter("#","#x")')
        page.locator('.task-marker-filter-trigger[data-marker-kind="#"]').click()
        assert panel.evaluate('el=>el.scrollWidth<=el.clientWidth'), 'short option must fit selection reset'
        assert panel.evaluate('''el=>{
          const row=el.querySelector('.task-marker-filter-popover-actions button');
          const css=getComputedStyle(el);
          return Math.abs(row.getBoundingClientRect().width-(el.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)))<=1;
        }'''), 'even the shortest selected row must fill the inner popup width'
        reset = panel.locator('.task-marker-filter-clear').bounding_box()
        assert reset['width'] >= (44 if page.evaluate('matchMedia("(pointer: coarse)").matches') else 32)
        page.evaluate('syncTaskMarkerFilterControl("#",[{key:"#x",label:"x",count:100000}])')
        assert panel.evaluate('el=>el.scrollWidth<=el.clientWidth'), 'large count must fit the intrinsic row'

    def suggestions(page, mode):
        page.evaluate('''()=>{
          state.__dimensions__=['#','@','!','+','%','🧭'];
          state.__dimensionColors__=Object.fromEntries(state.__dimensions__.map((s,i)=>[s,i*50]));
          state.__inbox__=[{...task('Source #x @Ирина !⭐ +дом %доля 🧭север'),id:1},
                           {...task('Editable'),id:2}];render();
        }''')
        if mode == 'inline':
            editor = page.locator('.task[data-id="2"] .task-text')
        elif mode == 'dialog':
            page.evaluate('openTaskEditor("__inbox__",2)')
            editor = page.locator('#taskTitleInput')
        else:
            page.evaluate('openNewTask("__inbox__",true)')
            editor = page.locator('.new-task-panel.open textarea')

        def geometry(intrinsic=False):
            menu = page.locator('#markerSuggestions')
            expect(menu).to_be_visible()
            result = menu.evaluate('''el=>{
              const css=getComputedStyle(el),r=el.getBoundingClientRect();
              const rows=[...el.children],inner=el.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
              const sizes=rows.map(row=>{const c=getComputedStyle(row),range=document.createRange();range.selectNodeContents(row);
                return {width:row.getBoundingClientRect().width,text:range.getBoundingClientRect().width,
                  extra:parseFloat(c.paddingLeft)+parseFloat(c.paddingRight)+parseFloat(c.borderLeftWidth)+parseFloat(c.borderRightWidth)};});
              return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,inner,sizes,
                expected:Math.max(...sizes.map(x=>x.text+x.extra))+r.width-inner,
                overflow:el.scrollWidth>el.clientWidth,scrolls:el.scrollHeight>el.clientHeight};
            }''')
            viewport = page.viewport_size
            assert result['left'] >= 7 and result['right'] <= viewport['width'] - 7, result
            assert result['top'] >= 7 and result['bottom'] <= viewport['height'] - 7, result
            assert not result['overflow'], result
            assert all(abs(row['width'] - result['inner']) <= 1 for row in result['sizes']), result
            if intrinsic:
                assert abs(result['width'] - result['expected']) <= 2, ('unnecessary suggestion width', mode, result)
            return result

        for symbol in ['#','@','!','+','%','🧭']:
            editor.fill('Choose ' + symbol)
            geometry(intrinsic=True)
            editor.press('Enter')
            expect(editor).to_be_focused()
            value = editor.text_content() if mode == 'inline' else editor.input_value()
            assert value.startswith('Choose ' + symbol) and len(value) > len('Choose ' + symbol)
            expect(page.locator('#markerSuggestions')).to_have_count(0)

        editor.evaluate('el=>Object.assign(el.style,{position:"fixed",left:"auto",top:"auto",right:"8px",bottom:"8px",width:"90px",height:"32px",margin:"0"})')
        edge = editor.bounding_box()
        assert abs(edge['x'] + edge['width'] - (page.viewport_size['width'] - 8)) <= 1, edge
        assert abs(edge['y'] + edge['height'] - (page.viewport_size['height'] - 8)) <= 1, edge
        for symbol in ['#','@']:
            page.evaluate('s=>state.__inbox__[0].text="Source "+s+"longword".repeat(80)', symbol)
            editor.fill('Choose ' + symbol)
            result = geometry()
            assert result['width'] > min(280, page.viewport_size['width'] - 18), result
            assert result['bottom'] <= editor.bounding_box()['y'] + 1, 'bottom-edge suggestions must open above the input'
            editor.press('Escape')
        page.evaluate('state.__inbox__[0].text=Array.from({length:25},(_,i)=>"@Ирина"+String(i).padStart(2,"0")).join(" ")')
        editor.fill('Choose @')
        assert geometry(intrinsic=True)['scrolls'], 'many suggestions must scroll vertically'
        editor.press('ArrowUp')
        assert page.locator('#markerSuggestions').evaluate('el=>el.scrollTop>0')
        editor.press('Enter')
        value = editor.text_content() if mode == 'inline' else editor.input_value()
        assert value == 'Choose @Ирина24 ', value

    def counter(page):
        for count in [0, 1, 42]:
            page.evaluate('n=>{state.__inbox__=Array.from({length:n},(_,i)=>({...task("Counter task"),id:i+1}));render()}', count)
            wrap = page.locator('.col-stats').first
            expect(wrap).to_have_js_property('tagName', 'SPAN')
            expect(wrap.locator(':scope > span')).to_have_count(1)
            value = wrap.locator(':scope > span')
            expect(value).to_have_class('icon-btn col-stat stat-active' + (' is-zero' if count == 0 else ''))
            expect(value).to_have_text(str(count))
            title = page.evaluate('n=>tr("stats.active_count","",{0:n})', count)
            expect(value).to_have_attribute('title', title)
            expect(value).to_have_attribute('aria-label', title)

    def bin_markers(page):
        page.evaluate('''()=>{
          state.__dimensions__=['#','@','!','+'];state.__dimensionColors__['+']=190;
          window.historyText='History #a @Ирина !⭐ +дом $plain <b>raw</b>';
          state.__archive__=[{...task(historyText),id:91,archivedAt:Date.now()}];
          state.__trash__=[{...task(historyText),id:92,deletedAt:Date.now()}];
          state.__inbox__[0].text=historyText;render();
          persistLocalSnapshot(JSON.stringify(state));
          window.beforeHistory=JSON.stringify(state);window.beforeFilter=JSON.stringify(activeFilter());
          window.beforeLocal=localStorage.getItem(STORAGE_KEY);
          window.activeColors=[...document.querySelector('.task[data-id="1"]').querySelectorAll('.task-marker')].map(el=>getComputedStyle(el).color);
        }''')
        for kind in ['__archive__','__trash__']:
            page.evaluate('kind=>renderBin(kind)', kind)
            title = page.locator('#binBody .bin-text')
            markers = title.locator('.task-marker')
            expect(markers).to_have_count(4)
            expect(title.locator('button, [tabindex], b, img')).to_have_count(0)
            expect(title).to_have_text(page.evaluate('historyText'))
            assert title.evaluate('el=>el.scrollWidth<=el.clientWidth'), 'history labels must fit the row'
            assert markers.evaluate_all('els=>els.map(el=>getComputedStyle(el).color)') == page.evaluate('activeColors')
            for i, (symbol, label) in enumerate([('#','a'),('@','Ирина'),('!','⭐'),('+','дом')]):
                marker = markers.nth(i)
                expect(marker).to_have_js_property('tagName', 'SPAN')
                expect(marker).to_have_attribute('title', symbol+label)
                expect(marker.locator('.task-marker-label')).to_have_text(label)
                expect(marker.locator('.sr-only')).to_have_text(symbol)
                assert marker.get_attribute('aria-label') is None
                assert marker.evaluate('el=>el.onclick===null && el.onpointerdown===null && getComputedStyle(el).cursor!=="pointer"')
            markers.first.hover()
            assert markers.first.evaluate('el=>getComputedStyle(el).boxShadow==="none"')
            markers.first.click()
            assert page.evaluate('JSON.stringify(activeFilter())===beforeFilter && JSON.stringify(state)===beforeHistory')
            assert page.evaluate('localStorage.getItem(STORAGE_KEY)===beforeLocal')
            expect(page.locator('#binModal')).to_be_visible()
            page.keyboard.press('Escape')
        page.evaluate('renderBin("__archive__")')
        page.locator('#binBody [data-restore]').click()
        assert page.evaluate('''()=>{
          const today=dateKey(todayStart()),item=state[today].find(t=>t.id===91);
          return state.__archive__.length===0 && item.text===historyText && !('archivedAt' in item) &&
            JSON.parse(localStorage.getItem(STORAGE_KEY))[today].some(t=>t.id===91 && t.text===historyText);
        }''')

    def reference(page):
        expect(page.locator('#brandVersion')).to_have_text('2')
        build = page.locator('meta[name="chronos-build"]').get_attribute('content')
        expect(page.locator('#settingsVersion')).to_have_text('Chronos 2.2.29\n' + build[:7] + ('+modified' if build.endswith('+modified') else ''))
        for locale_path in sorted((root / 'chronos-2.0/locales').glob('*.locale.js')):
            page.evaluate('''source=>{
              const pack=parseLocalePack(source,'test.locale.js');availableLocales=[pack];applyLocale(pack.id);
            }''', locale_path.read_text(encoding='utf-8'))
            page.locator('#dimensionManagerToggle').click()
            assert page.locator('#dimensionSettingsHeading').text_content().strip() == page.evaluate('tr("dimensions.title", "")')
            page.keyboard.press('Escape')
            page.locator('[data-action="help"]').click()
            expect(page.locator('.help-toc, #helpContentsSelect')).to_have_count(0)
            expect(page.locator('.shortcut-row')).to_have_count(14)
            expect(page.locator('.help-close .icon-glyph')).to_have_text('\u00d7')
            expect(page.locator('#help-data, #help-lifecycle, #help-troubleshooting')).to_have_count(3)
            expect(page.locator('.help-close')).to_be_focused()
            page.keyboard.press('Tab')
            article = page.locator('.help-article')
            expect(article).to_be_focused()
            page.keyboard.press('PageDown')
            page.wait_for_function('document.querySelector(".help-article").scrollTop>0')
            page.keyboard.press('End')
            page.wait_for_function('(()=>{const a=document.querySelector(".help-article");return a.scrollTop+a.clientHeight>=a.scrollHeight-2})()')
            page.keyboard.press('Shift+Tab')
            expect(page.locator('.help-close')).to_be_focused()
            page.keyboard.press('Escape')
            expect(page.locator('[data-action="help"]')).to_be_focused()

    def linked(page):
        page.evaluate('''()=>{
          window.writes=[];window.beforeState=JSON.stringify(state);
          window.beforeLocal=localStorage.getItem(STORAGE_KEY);
          window.handle={getFile:async()=>({text:async()=>window.beforeState}),
            createWritable:async()=>({write:async snapshot=>{window.writes.push(snapshot);
              if(window.holdWrite) await new Promise(resolve=>window.releaseWrite=resolve);},close:async()=>{}})};
          dataFileHandle=window.handle;linkedFileSnapshot=window.beforeState;
        }''')

    def open_clear(page):
        page.locator('#saveNote').click()
        page.locator('#clearDataBtn').click()
        page.locator('[data-action="clear-local"]').click()
        expect(page.locator('#confirmationModal')).to_be_visible()
        expect(page.locator('#confirmationCancel')).to_be_focused()
        expect(page.locator('#confirmationConfirm')).to_have_class('btn danger')

    def clear_cancel(page):
        linked(page)
        open_clear(page)
        page.keyboard.press('Escape')
        assert page.evaluate('JSON.stringify(state)===window.beforeState && dataFileHandle===window.handle && localStorage.getItem(STORAGE_KEY)===window.beforeLocal')

    def clear_stale(page):
        linked(page)
        open_clear(page)
        page.evaluate('state.__inbox__.push(task("Added while confirming"))')
        page.locator('#confirmationConfirm').click()
        assert page.evaluate('state.__inbox__.length===3 && dataFileHandle===window.handle')
        assert page.evaluate('localStorage.getItem(STORAGE_KEY)===window.beforeLocal')

    def clear_stale_handle(page):
        linked(page)
        open_clear(page)
        page.evaluate('window.newHandle={};dataFileHandle=window.newHandle')
        page.locator('#confirmationConfirm').click()
        assert page.evaluate('state.__inbox__.length===2 && dataFileHandle===window.newHandle')

    def clear_writes(page, inflight=False):
        linked(page)
        if inflight:
            page.evaluate('()=>{window.holdWrite=true;save();window.flushing=flushPendingFileWrite()}')
            page.wait_for_function('Boolean(window.releaseWrite)')
        else:
            page.evaluate('save();clearTimeout(saveTimer);saveTimer=setTimeout(()=>{},60000)')
        open_clear(page)
        page.locator('#confirmationConfirm').click()
        if inflight:
            page.evaluate('()=>{window.releaseWrite()}')
            page.evaluate('window.flushing')
        assert page.evaluate('state.__inbox__.length===0 && dataFileHandle===null')
        assert page.evaluate('state.__dimensions__.join("")') == '#@!'
        writes = page.evaluate('window.writes')
        assert len(writes) == (1 if inflight else 0), writes
        if writes:
            assert json.loads(writes[0])['__inbox__'], writes

    def danger(page):
        page.evaluate('''()=>{
          state.__trash__=[{...task("Color check"),id:91,deletedAt:Date.now()}];
          state.__archive__=[{...task("Color check"),id:92,archivedAt:Date.now()}];
        }''')
        ratios = []

        def interaction(control, expected, context, focus=False):
            actual = control.evaluate('el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor,s.opacity,s.outlineColor]}')
            assert actual[:3] == [expected[0], expected[1], '1'], (context, actual, expected)
            if focus:
                assert control.evaluate('el=>el.matches(":focus-visible")')
                assert actual[3] == expected[0], (context, actual)

        def contrast(control, context):
            ratio = control.evaluate('''el=>{
              const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');
              function rgba(value){c.clearRect(0,0,1,1);c.fillStyle=value;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);}
              function over(a,b){const alpha=a[3]+b[3]*(1-a[3]);return [0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/alpha).concat(alpha);}
              const layers=[];
              for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);const color=rgba(s.backgroundColor);layers.push(color);if(color[3]===1){if(s.backgroundImage!=='none')throw Error('Unmeasured gradient surface');break;}}
              let bg=[255,255,255,1];for(const color of layers.reverse())bg=over(color,bg);
              const fg=over(rgba(getComputedStyle(el).color),bg);
              const lum=values=>values.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
              const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
            }''')
            ratios.append((ratio, context))
            assert ratio >= 4.5, ('action text contrast', ratio, context)

        page.locator('#dimensionManagerToggle').click()
        remove = page.locator('.dimension-remove').first
        expect(remove.locator('svg')).to_have_count(1)
        for theme in sorted((root / 'chronos-2.0/themes').glob('*.css'), key=lambda path: (path.name != 'graphite-moss.css', path.name)):
            style = page.add_style_tag(content=theme.read_text(encoding='utf-8'))
            for scheme in ['light', 'dark']:
                page.evaluate('s=>document.documentElement.dataset.theme=s', scheme)
                expected = page.evaluate('''()=>{
                  const probe=document.createElement('span');probe.style.cssText='color:var(--action-danger,var(--red));background:var(--action-danger-soft,var(--danger-soft))';
                  document.documentElement.append(probe);const s=getComputedStyle(probe),result=[s.color,s.backgroundColor];probe.remove();return result;
                }''')
                page.locator('#newDimensionSymbol').focus();page.mouse.move(1,1)
                assert remove.evaluate('el=>getComputedStyle(el).color') != expected[0], ('reversible neutral rest',theme.name,scheme)
                remove.hover()
                interaction(remove, expected, ('tag type hover',theme.name,scheme))
                remove.focus();page.keyboard.press('Shift+Tab');page.keyboard.press('Tab')
                interaction(remove, expected, ('tag type focus',theme.name,scheme), focus=True)
                close = page.locator('[data-action="close-dimension-manager"]')
                close.hover()
                assert close.evaluate('''el=>{
                  const probe=document.createElement('span');probe.style.cssText='color:var(--text);background:color-mix(in srgb,var(--text) 8%,var(--panel-solid))';el.append(probe);
                  const expected=getComputedStyle(probe),actual=getComputedStyle(el);
                  const ok=actual.color===expected.color && actual.backgroundColor===expected.backgroundColor;probe.remove();return ok;
                }'''), ('neutral close',theme.name,scheme)
                page.keyboard.press('Escape')
                page.evaluate('clearAllFilters();setTaskMarkerFilter("#","#a")')
                page.locator('.task-marker-filter-trigger[data-marker-kind="#"]').click()
                reset = page.locator('.task-marker-filter-popover.open .task-marker-filter-clear')
                reset.hover()
                assert reset.evaluate('''el=>{
                  const probe=document.createElement('span');probe.style.cssText='color:var(--text);background:color-mix(in srgb,var(--text) 8%,var(--panel-solid))';el.append(probe);
                  const expected=getComputedStyle(probe),actual=getComputedStyle(el);
                  const ok=actual.color===expected.color && actual.backgroundColor===expected.backgroundColor;probe.remove();return ok;
                }'''), ('neutral filter reset',theme.name,scheme)
                reset.focus()
                page.keyboard.press('Shift+Tab')
                page.keyboard.press('Tab')
                assert reset.evaluate('''el=>el.matches(':focus-visible') && getComputedStyle(el).color===(()=>{
                  const probe=document.createElement('span');probe.style.color='var(--text)';el.append(probe);
                  const color=getComputedStyle(probe).color;probe.remove();return color;
                })()'''), ('neutral filter keyboard focus',theme.name,scheme)
                page.keyboard.press('Escape')
                dock = page.locator('#dragDock')
                dock.evaluate('el=>el.classList.add("open")')
                expect(dock).to_have_css('opacity','1')
                drop = dock.locator('.drag-dock-trash')
                for over in [False,True]:
                    drop.evaluate('(el,value)=>el.classList.toggle("drag-over",value)',over)
                    interaction(drop, expected, ('drag trash',theme.name,scheme,over))
                    contrast(drop, ('drag trash',theme.name,scheme,over))
                drop.evaluate('el=>el.classList.remove("drag-over")')
                dock.evaluate('el=>el.classList.remove("open")')
                card = page.locator('.task[data-id="1"]')
                card.hover();trash = card.locator('.task-trash-action');trash.hover()
                interaction(trash, expected, ('card hover',theme.name,scheme))
                card.locator('.task-menu-trigger').click()
                menu = page.locator('#menu [data-delete]');menu.hover()
                interaction(menu, expected, ('menu hover',theme.name,scheme))
                contrast(menu, ('menu',theme.name,scheme))
                page.keyboard.press('Escape')
                page.evaluate('renderBin("__trash__")');page.mouse.move(1,1)
                clear = page.locator('#binClearAction');purge = page.locator('#binBody [data-purge]')
                for control in [clear,purge]:
                    assert control.evaluate('el=>getComputedStyle(el).color') == expected[0], ('permanent rest',theme.name,scheme)
                assert clear.evaluate(r'''el=>{
                  const neutral=document.createElement('button');neutral.className=el.className.replace(/\bdanger\b/g,'');el.parentElement.append(neutral);
                  const a=getComputedStyle(el),b=getComputedStyle(neutral),same=a.backgroundColor===b.backgroundColor && a.backgroundImage===b.backgroundImage;
                  neutral.remove();return same;
                }'''), ('no button-only pink resting background',theme.name,scheme)
                contrast(clear, ('clear rest',theme.name,scheme))
                clear.hover();interaction(clear, expected, ('clear hover',theme.name,scheme))
                contrast(clear, ('clear hover',theme.name,scheme))
                clear.focus();page.keyboard.press('Shift+Tab');page.keyboard.press('Tab')
                interaction(clear, expected, ('clear focus',theme.name,scheme), focus=True)
                clear.hover();page.mouse.down()
                interaction(clear, expected, ('clear active',theme.name,scheme))
                page.mouse.move(1,1);page.mouse.up()
                purge.hover();interaction(purge, expected, ('purge hover',theme.name,scheme))
                page.keyboard.press('Escape')
                page.evaluate('renderBin("__archive__")')
                clear.hover();interaction(clear, expected, ('Done clear hover',theme.name,scheme))
                contrast(clear, ('Done clear',theme.name,scheme))
                page.keyboard.press('Escape')
                page.locator('#saveNote').click();page.locator('#clearDataBtn').click()
                local_clear = page.locator('[data-action="clear-local"]')
                expect(local_clear).to_be_visible()
                assert local_clear.evaluate('el=>getComputedStyle(el).color') == expected[0]
                local_clear.hover();interaction(local_clear, expected, ('local clear hover',theme.name,scheme))
                page.keyboard.press('Escape');page.keyboard.press('Escape')
                page.evaluate('openTaskEditor("__inbox__",1)')
                editor_trash = page.locator('#taskEditorTrashAction');editor_trash.hover()
                interaction(editor_trash, expected, ('editor hover',theme.name,scheme))
                page.locator('#taskTitleInput').fill('Changed')
                page.locator('[data-action="close-task-editor"]').first.click()
                discard = page.locator('.task-editor-discard-action')
                assert discard.evaluate('el=>getComputedStyle(el).color') == expected[0]
                discard.hover();interaction(discard, expected, ('discard hover',theme.name,scheme))
                contrast(discard, ('discard',theme.name,scheme));discard.click()
                page.evaluate('()=>{void requestConfirmation({title:"Clear",description:"Synthetic",cancelLabel:"Cancel",confirmLabel:"Delete",danger:true})}')
                confirm = page.locator('#confirmationConfirm');confirm.hover()
                interaction(confirm, expected, ('confirmation hover',theme.name,scheme))
                contrast(confirm, ('confirmation',theme.name,scheme))
                page.locator('#confirmationCancel').click()
                page.locator('#dimensionManagerToggle').click()
            style.evaluate('el=>el.remove()')
        print('Action text minimum contrast:', min(ratios))

    def export_stale(page):
        linked(page)
        page.evaluate('''()=>{
          window.showSaveFilePicker=async()=>window.handle;
          window.holdWrite=true;window.exporting=clearAfterExport();
        }''')
        page.wait_for_function('Boolean(window.releaseWrite)')
        page.evaluate('''()=>{
          state.__inbox__.push(task('Added during export'));
          persistLocalSnapshot(JSON.stringify(state));window.latestLocal=localStorage.getItem(STORAGE_KEY);
          window.releaseWrite();
        }''')
        page.evaluate('window.exporting')
        assert page.evaluate('state.__inbox__.length===3 && dataFileHandle===window.handle'), 'stale export must not clear current state'
        assert page.evaluate('localStorage.getItem(STORAGE_KEY)===window.latestLocal'), 'stale export must not roll back browser storage'

    def export_normalized(page):
        linked(page)
        page.evaluate('''async()=>{
          state['2099-01-01']=[];
          window.showSaveFilePicker=async()=>window.handle;
          await clearAfterExport();
        }''')
        assert page.evaluate('state.__inbox__.length===0 && dataFileHandle===null')
        assert page.evaluate('window.writes.length===1 && JSON.parse(window.writes[0]).__inbox__.length===2')

    def ordinary_confirmation(page):
        linked(page)
        open_clear(page)
        page.locator('#confirmationCancel').click()
        page.evaluate('()=>{state["2020-01-01"]=[task("Overdue")];requestMoveOverdue()}')
        expect(page.locator('#confirmationConfirm')).to_have_class('btn btn-primary')
        page.locator('#confirmationCancel').click()
        assert page.evaluate('state["2020-01-01"].length===1')

    check('compact desktop card and completion', card)
    check('compact touch card and completion', card, mobile=True)
    check('robot never enters editable source', robot_edit)
    check('intrinsic dropdown and full-width selection', popup)
    check('intrinsic dropdown and accessible touch reset', popup, mobile=True)
    check('column counter preserves its visible and accessible states', counter)
    check('touch column counter preserves its visible and accessible states', counter, mobile=True)
    check('Done and Bin show passive markers and preserve restore data', bin_markers)
    check('touch Done and Bin show passive markers and preserve restore data', bin_markers, mobile=True)
    for mode in ['inline', 'dialog', 'bulk']:
        check('autocomplete geometry and insertion: ' + mode, lambda page, m=mode: suggestions(page, m))
        check('touch autocomplete geometry and insertion: ' + mode, lambda page, m=mode: suggestions(page, m), mobile=True)
    check('all locales and keyboard quick reference', reference)
    check('clear cancellation preserves local and linked state', clear_cancel)
    check('clear consent expires when data changes', clear_stale)
    check('clear consent expires when file handle changes', clear_stale_handle)
    check('clear cancels queued file writes', clear_writes)
    check('clear never sends empty snapshot after an in-flight write', lambda page: clear_writes(page, True))
    check('destructive style across all themes and schemes', danger)
    check('save-and-clear preserves changes made during export', export_stale)
    check('save-and-clear accepts its own empty-date normalization', export_normalized)
    check('ordinary confirmation resets destructive styling', ordinary_confirmation)
    browser.close()

assert not failures, failures

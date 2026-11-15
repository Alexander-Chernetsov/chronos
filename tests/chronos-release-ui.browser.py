"""Stable search/header, history modal and symmetric card action surfaces."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json
import subprocess
import tempfile
import sys
import re

root = Path(__file__).resolve().parents[1]
sample = {
    '__schema__': 1, '__dimensions__': ['#', '@', '!', '+'],
    '__dimensionColors__': {'#': 85, '@': 305, '!': 25, '+': 190},
    '__ui__': {'dayCount': 7, 'collapsed': [], 'todayColumnIndex': 1,
               'theme': 'light', 'view': 'board', 'expandedKey': None, 'filterLastEditor': 'all'},
    '__inbox__': [{'id': 1, 'text': 'Review #work @Ирина !star +one', 'comment': '', 'lastEditedByAgent': False},
                  {'id': 2, 'text': 'Other #home', 'comment': '', 'lastEditedByAgent': False}],
    '__control__': [], '__archive__': [], '__trash__': []}
failures = []

with tempfile.TemporaryDirectory(prefix='chronos-release-ui-') as temporary, sync_playwright() as p:
    candidate = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(temporary) / 'candidate.html'
    if len(sys.argv) == 1:
        subprocess.run(['node', str(root / 'tools/build-standalone.mjs'), str(candidate)],
                       cwd=root, check=True, capture_output=True)
    browser = p.chromium.launch(headless=True)
    for width, height in [(1600, 900), (1280, 844), (1024, 768), (390, 844), (320, 568)]:
        context = browser.new_context(viewport={'width': width, 'height': height},
                                      is_mobile=width < 800, has_touch=width < 800)
        page = context.new_page()
        page.set_default_timeout(2000)
        page.add_init_script("localStorage.setItem('chronos-planner-v2',JSON.stringify(" + json.dumps(sample) + "))")
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(candidate.as_uri())
        assert not page.evaluate('loadSchemaError'), 'synthetic fixture must match the current data contract'
        if len(sys.argv) == 1:
            build = page.locator('meta[name="chronos-build"]').get_attribute('content')
            assert re.fullmatch(r'[a-f0-9]{40}(?:\+modified)?', build)
            expect(page.locator('#settingsVersion')).to_have_text(
                'Chronos 2.2.29\n' + build[:7] + ('+modified' if build.endswith('+modified') else ''))
            expect(page.locator('#settingsVersion')).to_have_attribute('title', build)
        if width < 800:
            page.evaluate('openExpandedColumn("__inbox__")')

        def geometry():
            return page.evaluate('''() => [...document.querySelectorAll(
              '.app-header,.header-center,.week-nav,.day-stepper')]
              .map(el=>{const {x,y,width,height}=el.getBoundingClientRect();return {x,y,width,height};})''')

        try:
            before = geometry()
            page.locator('[data-action="search"]').click()
            expect(page.locator('#boardSearchInput')).to_be_focused()
            assert geometry() == before, ('search moved header controls', width, before, geometry())
            panel = page.locator('#searchPopover')
            expect(panel).to_be_visible()
            assert panel.evaluate('el=>el.matches(":popover-open")')
            box = panel.bounding_box()
            assert box['x'] >= 8 and box['x'] + box['width'] <= width - 7
            assert abs(box['width'] - min(256, width-16)) <= 1, 'search must keep a usable input width'
            trigger = page.locator('#searchTrigger').bounding_box()
            assert abs(box['x'] - max(8, min(trigger['x'], width-box['width']-8))) <= 1
            assert box['y'] >= trigger['y'] + trigger['height'] + 7
            if width < 800:
                header = page.locator('.app-header').bounding_box()
                assert box['y'] >= header['y'] + header['height'] + 7, 'wrapped header buttons must remain uncovered'
            # Check actual hit testing with clipped/transformed ancestors too.
            page.add_style_tag(content='.app-header{overflow:hidden;transform:translateZ(0)}')
            assert page.locator('#boardSearchInput').evaluate('''el=>{const r=el.getBoundingClientRect();
              return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}''')
            page.locator('#boardSearchInput').fill('Review')
            assert page.locator('.task[data-id="2"]').count() == 0
            page.keyboard.press('Escape')
            expect(panel).to_be_hidden()
            expect(page.locator('[data-action="search"]')).to_be_focused()
            assert page.evaluate('searchQuery') == 'Review'
            assert page.locator('.task[data-id="2"]').count() == 0
            expect(page.locator('[data-action="search"]')).to_have_class('icon-btn active-toggle')
            page.keyboard.press('Control+f')
            expect(page.locator('#boardSearchInput')).to_be_focused()
            expect(page.locator('#boardSearchInput')).to_have_value('Review')
            page.locator('.task-marker-filter-trigger[data-marker-kind="#"]').click()
            expect(panel).to_be_hidden()
            page.keyboard.press('Escape')
            page.locator('[data-action="search"]').click()
            page.locator('.brand').click() if width >= 860 else page.locator('#board').click(position={'x': 2, 'y': 2})
            expect(panel).to_be_hidden()
            assert page.evaluate('searchQuery') == 'Review'
            page.locator('#clearFiltersButton').click()
            assert page.evaluate('searchQuery') == ''
            assert geometry() == before
            print('PASS search', width)
        except Exception as error:
            failures.append(('search', width, str(error)))
            print('FAIL search', width, str(error)[:220])

        try:
            page.evaluate('''() => {
              clearAllFilters();closeHeaderPopovers();
              const now=Date.now();
              state.__archive__=Array.from({length:20},(_,i)=>({id:100+i,text:'Done '+i,
                comment:'',lastEditedByAgent:false,archivedAt:now}));
              state.__trash__=[{id:200,text:'Deleted',comment:'',lastEditedByAgent:false,deletedAt:now}];
              renderBin(ARCHIVE);
            }''')
            modal = page.locator('#binModal > .modal')
            full = modal.bounding_box()
            page.locator('#binTabTrash').click()
            assert modal.bounding_box() == full, ('tabs resized history', full, modal.bounding_box())
            page.evaluate('state.__trash__=[];renderBin(TRASH)')
            assert modal.bounding_box() == full, 'empty history resized modal'
            assert abs(full['height'] - min(640, height * .88)) <= 1
            assert page.locator('#binPanel').evaluate('el=>el.scrollHeight>=el.clientHeight')
            page.locator('#binTabArchive').click()
            assert page.locator('#binPanel').evaluate('el=>el.scrollHeight>el.clientHeight')
            page.locator('#binPanel').evaluate('el=>el.scrollTop=el.scrollHeight')
            assert page.locator('#binPanel').evaluate('el=>el.scrollTop>0')
            page.keyboard.press('Escape')
            print('PASS history', width)
        except Exception as error:
            failures.append(('history', width, str(error)))
            print('FAIL history', width, str(error)[:220])

        try:
            page.evaluate('closeModals()')
            if width >= 800:
                page.locator('.task[data-id="1"]').hover()
            drawer = page.locator('.task[data-id="1"] .task-action-drawer')
            assert drawer.evaluate('''el=>{const s=getComputedStyle(el);return s.backgroundImage==='none'
              && s.paddingLeft===s.paddingRight && s.borderTopLeftRadius===s.borderTopRightRadius;}'''), 'asymmetric/gradient action surface'
            if width == 1600:
                for theme in sorted((root / 'chronos-2.0/themes').glob('*.css')):
                    page.evaluate('''css=>{
                      let style=document.getElementById('testTheme');
                      if(!style){style=document.createElement('style');style.id='testTheme';document.head.append(style);}
                      style.textContent=css;
                    }''', theme.read_text(encoding='utf-8'))
                    for scheme in ['light', 'dark']:
                        page.evaluate('scheme=>document.documentElement.dataset.theme=scheme', scheme)
                        assert drawer.evaluate('''el=>{
                          const radius=getComputedStyle(el).borderTopLeftRadius;
                          return radius===getComputedStyle(document.querySelector('.task-marker')).borderTopLeftRadius
                            && radius===getComputedStyle(el).borderTopRightRadius;
                        }'''), ('drawer must share button/tag theme shape', theme.name, scheme)
            assert not errors, errors
            print('PASS action surface', width)
        except Exception as error:
            failures.append(('actions', width, str(error)))
            print('FAIL actions', width, str(error)[:220])
        context.close()
    context = browser.new_context()
    page = context.new_page()
    page.goto((root / 'chronos-2.0/chronos.html').as_uri())
    expect(page.locator('meta[name="chronos-build"]')).to_have_count(0)
    expect(page.locator('#settingsVersion')).to_have_text('Chronos 2.2.29')
    context.close()
    print('PASS source version without invented build SHA')
    browser.close()

assert not failures, failures

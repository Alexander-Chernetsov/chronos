from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json,os,subprocess,tempfile

root=Path(__file__).resolve().parents[1]
locale_entries=[{'name':path.name,'source':path.read_text(encoding='utf-8')} for path in sorted((root/'chronos-2.0/locales').glob('*.locale.js'))]
sample={'__schema__':1,'__dimensions__':['#','@','!','+'],'__dimensionColors__':{'#':85,'@':305,'!':25,'+':190},'__ui__':{'dayCount':7,'collapsed':[],'todayColumnIndex':1,'theme':'light','view':'board','expandedKey':None,'filterLastEditor':'all'},'__inbox__':[{'id':1,'text':'!⭐ Review #work @Ирина','comment':'','lastEditedByAgent':False},{'id':2,'text':'!🔥 Call #home @Ivan','comment':'','lastEditedByAgent':True}],'__control__':[],'__archive__':[],'__trash__':[]}

def bounds(pg,selector):
 r=pg.locator(selector).bounding_box()
 assert r is not None,selector
 width=pg.evaluate('document.documentElement.clientWidth')
 height=pg.evaluate('document.documentElement.clientHeight')
 assert r['x']>=0 and r['x']+r['width']<=width+1,(selector,r,width)
 assert r['y']>=0 and r['y']+r['height']<=height+1,(selector,r,height)
 return r,width

def header_popup(pg,selector):
 panel=pg.locator(selector)
 expect(panel).to_be_visible()
 assert panel.evaluate('el=>el.matches(":popover-open") && el.classList.contains("open")')
 r,width=bounds(pg,selector)
 header=pg.locator('.app-header').bounding_box()
 if panel.evaluate('el=>el.matches(".task-marker-filter-popover,.editor-filter-popover")'):
  trigger=pg.locator(f'[aria-controls="{panel.get_attribute("id")}"]').bounding_box()
  expected_x=max(8,min(trigger['x'],width-r['width']-8))
  assert abs(r['x']-expected_x)<=1,('filter must follow its own button',selector,r,trigger)
  assert r['y']>=trigger['y']+trigger['height']+7,('filter must stay below its own button',selector,r,trigger)
  if width>=1200:
   assert abs(r['y']-(trigger['y']+trigger['height']+8))<=1,('single-row desktop filter must be directly below its button',selector,r,trigger)
 else:
  assert abs(r['x']+r['width']-(width-8))<=1,(selector,r,width)
  assert r['y']>=header['y']+header['height']+7,(selector,r,header)
 target=panel.locator('button:not(:disabled)').first
 target.scroll_into_view_if_needed()
 assert target.evaluate('el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),('content is clipped or covered',selector)

def is_red(control):
 return control.evaluate('el=>{const probe=document.createElement("span");probe.style.color="var(--action-danger)";document.documentElement.append(probe);const red=getComputedStyle(probe).color;probe.remove();return getComputedStyle(el).color===red;}')

def help_panel(pg):
 expect(pg.locator('.help-panel')).to_be_visible()
 r,width=bounds(pg,'.help-panel')
 header=pg.locator('.app-header').bounding_box()
 height=pg.evaluate('document.documentElement.clientHeight')
 assert abs(r['x']+r['width']-(width-8))<=1,('help right edge',r,width)
 assert abs(r['y']-(header['y']+header['height']+8))<=1,('help below header',r,header)
 assert abs(r['y']+r['height']-(height-8))<=1,('help bottom edge',r,height)
 if width>760: assert r['width']<=width/2+1,('help exceeds half the screen',r,width)
 else: assert abs(r['width']-(width-16))<=1,('help mobile width',r,width)
 assert pg.locator('.help-panel').evaluate('el=>el.scrollWidth<=el.clientWidth')
 assert pg.locator('.help-article').evaluate('el=>el.scrollWidth<=el.clientWidth')
 assert pg.locator('.help-close').evaluate('el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}')

with tempfile.TemporaryDirectory(prefix='chronos-screen-popovers-') as temporary,sync_playwright() as p:
 candidate=Path(temporary)/'candidate.html'
 subprocess.run(['node',str(root/'tools/build-standalone.mjs'),str(candidate)],cwd=root,check=True,capture_output=True)
 installed=Path(os.environ.get('LOCALAPPDATA',Path.home()/'AppData/Local'))/'BraveSoftware/Brave-Browser/Application/brave.exe'
 engines=[('bundled',{})]+([('Brave',{'executable_path':str(installed)})] if installed.exists() else [])
 for engine,options in engines:
  browser=p.chromium.launch(headless=True,**options)
  for width,height in [(1600,900),(390,844),(320,568)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<800,is_mobile=width<800)
   pg=ctx.new_page();errors=[]
   pg.on('pageerror',lambda error:errors.append(str(error)))
   pg.add_init_script("localStorage.setItem('chronos-planner-v2',JSON.stringify("+json.dumps(sample)+"));")
   pg.goto(candidate.as_uri())
   # These styles reproduce a menu whose rectangle is inside the viewport
   # while ancestor clipping makes it unpainted and unclickable.
   pg.add_style_tag(content='.app-header{overflow:hidden;transform:translateZ(0)}')
   for kind in ['#','!']:
    trigger=pg.locator(f'.task-marker-filter-trigger[data-marker-kind="{kind}"]')
    trigger.click();header_popup(pg,'.task-marker-filter-popover.open')
    expect(trigger).to_have_attribute('aria-expanded','true')
    pg.keyboard.press('Escape')
    expect(trigger).to_be_focused()
    expect(trigger).to_have_attribute('aria-expanded','false')
    trigger.click()
    pg.locator('.task-marker-filter-popover.open button:not(:disabled)').first.focus()
    pg.keyboard.press('Shift+Slash')
    expect(pg.locator('#helpLayer')).to_be_visible()
    pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    pg.keyboard.press('Escape')
    pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    expect(trigger).to_be_focused()
   # The outlined cross belongs to the selection row and clears only that dimension.
   pg.evaluate('setSearch("Review");setTaskMarkerFilter("@","@ирина");setLastEditorFilter("human");setTaskMarkerFilter("#","#work")')
   before=pg.evaluate('activeFilter()')
   stored=pg.evaluate("localStorage.getItem('chronos-planner-v2')")
   hash_trigger=pg.locator('.task-marker-filter-trigger[data-marker-kind="#"]')
   hash_trigger.click();header_popup(pg,'.task-marker-filter-popover.open')
   clear=pg.get_by_role('button',name='Clear filter #',exact=True)
   expect(clear).to_have_text('×')
   assert clear.evaluate('el=>getComputedStyle(el).borderRightStyle==="solid"')
   label=pg.locator('.task-marker-filter-popover.open .task-marker-filter-selected').bounding_box()
   r=clear.bounding_box()
   assert r['x']>=label['x']+label['width'],('cross must be right of the value',label,r)
   assert r['width']>=(44 if width<800 else 32)
   if width<800: clear.tap()
   else:
    clear.focus();pg.keyboard.press('Enter')
   expect(hash_trigger).to_be_focused()
   expect(pg.locator('.task-marker-filter-popover.open')).to_have_count(0)
   after=pg.evaluate('activeFilter()')
   assert after['markers']['#']==''
   assert after['markers']['@']==before['markers']['@']
   assert after['text']==before['text'] and after['lastEditor']==before['lastEditor']
   assert pg.evaluate("localStorage.getItem('chronos-planner-v2')")==stored
   hash_trigger.click()
   expect(pg.get_by_role('button',name='Clear filter #',exact=True)).to_be_hidden()
   pg.keyboard.press('Escape')
   pg.locator('#clearFiltersButton').click()
   pg.locator('.task-marker-filter-trigger[data-marker-kind="!"]').click()
   pg.locator('[data-marker-key="!⭐"]').click()
   assert pg.evaluate('activeFilter().markers["!"]')=='!⭐'
   pg.locator('#editorFilterTrigger').click();header_popup(pg,'#editorFilterPopover')
   pg.locator('#dimensionManagerToggle').click();header_popup(pg,'#dimensionManagerPopover')
   expect(pg.locator('#editorFilterPopover')).to_be_hidden()
   stored=pg.evaluate("localStorage.getItem('chronos-planner-v2')")
   pg.locator('[data-action="close-dimension-manager"]').click()
   expect(pg.locator('#dimensionManagerPopover')).to_be_hidden()
   assert pg.evaluate("localStorage.getItem('chronos-planner-v2')")==stored
   pg.locator('#dimensionManagerToggle').click();header_popup(pg,'#dimensionManagerPopover')
   disable=pg.get_by_role('button',name='Disable tag type #',exact=True)
   expect(disable.locator('svg')).to_have_count(1)
   if width<800:
    disable.focus();pg.keyboard.press('Shift+Tab');pg.keyboard.press('Tab')
   else: disable.hover()
   assert is_red(disable),('Disabling a tag type must reveal the reversible bin style',engine,width)
   pg.locator('.dimension-color-trigger').first.click()
   pg.get_by_role('button',name='Hue 345°',exact=True).click()
   assert pg.evaluate('state.__dimensionColors__["#"]')==345
   expect(pg.locator('.dimension-color-trigger').first).to_have_attribute('aria-expanded','false')
   expect(pg.locator('.dimension-palette').first).to_be_hidden()
   expect(pg.locator('.dimension-color-trigger').first).to_be_focused()
   pg.set_viewport_size({'width':width,'height':height-50})
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
   header_popup(pg,'#dimensionManagerPopover')
   pg.set_viewport_size({'width':width,'height':height})
   pg.locator('.dimension-color-trigger').first.focus()
   pg.keyboard.press('Shift+Slash')
   expect(pg.locator('#helpLayer')).to_be_visible()
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
   help_panel(pg)
   assert pg.locator('.help-article').evaluate('el=>el.clientHeight')>=(200 if width==320 else 80),('help reading area too short',engine,width)
   expect(pg.locator('.help-toc, #helpContentsSelect')).to_have_count(0)
   expect(pg.locator('.shortcut-row')).to_have_count(14)
   pg.locator('.help-close').focus();pg.keyboard.press('Tab')
   article=pg.locator('.help-article')
   expect(article).to_be_focused()
   pg.keyboard.press('PageDown')
   pg.wait_for_function('document.querySelector(".help-article").scrollTop>0')
   pg.keyboard.press('End')
   pg.wait_for_function('(()=>{const el=document.querySelector(".help-article");return Math.abs(el.scrollTop+el.clientHeight-el.scrollHeight)<=1;})()')
   pg.keyboard.press('Shift+Tab');expect(pg.locator('.help-close')).to_be_focused()
   pg.set_viewport_size({'width':width,'height':height-40})
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
   help_panel(pg)
   pg.set_viewport_size({'width':width,'height':height})
   pg.keyboard.press('Escape')
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
   expect(pg.locator('#dimensionManagerToggle')).to_be_focused()
   pg.locator('#settingsToggle').click();header_popup(pg,'#settingsPopover')
   pg.keyboard.press('Escape');expect(pg.locator('#settingsToggle')).to_be_focused()
   pg.locator('#saveNote').click();header_popup(pg,'#filePopover')
   pg.locator('#clearDataBtn').focus()
   pg.keyboard.press('Enter');header_popup(pg,'#clearPopover')
   assert pg.locator('#clearPopover').evaluate('el=>el.contains(document.activeElement)'), 'Clear submenu must receive keyboard focus'
   pg.keyboard.press('Tab')
   expect(pg.locator('#clearPopover [data-action="clear-local"]')).to_be_focused()
   pg.keyboard.press('Tab')
   expect(pg.locator('#clearPopover [data-action="close-clear-popover"]')).to_be_focused()
   expect(pg.locator('#filePopover')).to_be_hidden()
   pg.keyboard.press('Escape');header_popup(pg,'#filePopover')
   expect(pg.locator('#clearDataBtn')).to_be_focused()
   pg.locator('#clearDataBtn').click()
   pg.locator('[data-action="close-clear-popover"]').click();header_popup(pg,'#filePopover')
   pg.locator('#clearDataBtn').click()
   pg.keyboard.press('Shift+Slash')
   expect(pg.locator('#helpLayer')).to_be_visible()
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
   pg.keyboard.press('Escape')
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
   expect(pg.locator('#saveNote')).to_be_focused()
   pg.locator('#saveNote').click();header_popup(pg,'#filePopover')
   pg.mouse.click(4,height-4)
   expect(pg.locator('[data-header-popover]:popover-open')).to_have_count(0)
   pg.locator('#settingsToggle').click()
   pg.locator('[data-action="help"]').click()
   expect(pg.locator('[data-header-popover]:popover-open')).to_have_count(0)
   pg.keyboard.press('Escape')
   # Other menus keep their existing context/caret placement, within bounds.
   pg.locator('[data-action="pick-visible-date"]').click()
   bounds(pg,'#datePopover')
   pg.locator('#datePopover [data-cal="next"]').click()
   pg.locator('#datePopover [data-cal="close"]').click()
   pg.evaluate('clearAllFilters()')
   pg.locator('.column[data-key="__inbox__"]').scroll_into_view_if_needed()
   pg.locator('.column[data-key="__inbox__"] .column-actions-trigger').click()
   bounds(pg,'#columnActionsPopover');pg.keyboard.press('Escape')
   if width>=800: pg.locator('.task[data-id="1"]').hover()
   try:
    pg.locator('.task[data-id="1"] .task-menu-trigger').click(timeout=2000)
   except Exception:
    print('Context menu failure',engine,width,pg.evaluate('({active:document.activeElement?.className,menus:[...document.querySelectorAll("[data-header-popover]")].map(el=>({id:el.id,open:el.matches(":popover-open"),classes:el.className}))})'))
    pg.screenshot(path=str(root/'output/context-menu-audit-failure.png'))
    raise
   bounds(pg,'#menu')
   expect(pg.locator('#menu [data-delete]')).to_have_text('Move to bin')
   pg.keyboard.press('Escape')
   pg.locator('.task[data-id="1"] .task-menu-trigger').click()
   pg.locator('#menu [data-comment]').click()
   expect(pg.locator('#taskCommentText')).to_be_focused()
   pg.locator('#taskTitleInput').fill('Call @Ир')
   bounds(pg,'#markerSuggestions')
   pg.keyboard.press('Escape')
   assert not errors,(engine,width,errors)
   ctx.close()
  # A wrapped filter group must not hide its lower buttons behind an open menu.
  wrapped=json.loads(json.dumps(sample))
  wrapped['__dimensions__']+=['$','%','&']
  wrapped['__dimensionColors__'].update({'$':125,'%':225,'&':345})
  wrapped['__inbox__'][0]['text']='Review #'+('longvalue'*40)+' !soon @Ирина +home $cost %share &team'
  ctx=browser.new_context(viewport={'width':320,'height':568},has_touch=True,is_mobile=True)
  pg=ctx.new_page();errors=[]
  pg.on('pageerror',lambda error:errors.append(str(error)))
  pg.add_init_script("localStorage.setItem('chronos-planner-v2',JSON.stringify("+json.dumps(wrapped)+"));")
  pg.goto(candidate.as_uri())
  pg.evaluate('setSearch("Review")')
  for selector,panel in [('.task-marker-filter-trigger[data-marker-kind="#"]','.task-marker-filter-popover.open'),
                         ('.task-marker-filter-trigger[data-marker-kind="!"]','.task-marker-filter-popover.open'),
                         ('#editorFilterTrigger','#editorFilterPopover'),
                         ('#dimensionManagerToggle','#dimensionManagerPopover')]:
   button=pg.locator(selector)
   assert button.evaluate('el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),('next button covered',engine,selector)
   button.click();header_popup(pg,panel)
   menu=pg.locator(panel).bounding_box();header=pg.locator('.app-header').bounding_box()
   assert menu['y']>=header['y']+header['height']+7,('wrapped menu must be below the full header',selector,menu,header)
  pg.keyboard.press('Escape')
  pg.locator('.task-marker-filter-trigger[data-marker-kind="#"]').click()
  for width in [736,1600,320]:
   pg.set_viewport_size({'width':width,'height':700})
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
   header_popup(pg,'.task-marker-filter-popover.open')
  pg.evaluate('setSearch("longvalue")')
  header_popup(pg,'.task-marker-filter-popover.open')
  assert not errors,(engine,'wrapped filters',errors)
  ctx.close()
  # Navigation, reversible moves and permanent deletion retain distinct meanings.
  ctx=browser.new_context(viewport={'width':1200,'height':900})
  pg=ctx.new_page();errors=[]
  pg.on('pageerror',lambda error:errors.append(str(error)))
  pg.add_init_script("localStorage.setItem('chronos-planner-v2',JSON.stringify("+json.dumps(sample)+"));")
  pg.goto(candidate.as_uri())
  # Hover scrolls and retries if the startup locale restore replaces the card.
  pg.locator('.task[data-id="1"]').hover()
  trash=pg.locator('.task[data-id="1"] .task-trash-action')
  assert not is_red(trash)
  trash.hover();assert is_red(trash),'Moving to bin must highlight on interaction'
  trash.click()
  assert pg.evaluate('state.__trash__.length')==1
  stored=pg.evaluate("localStorage.getItem('chronos-planner-v2')")
  navigation=pg.locator('.app-header [data-action="trash"]')
  navigation.hover();assert not is_red(navigation),'Opening bin is neutral navigation'
  navigation.click()
  assert pg.evaluate("localStorage.getItem('chronos-planner-v2')")==stored
  pg.locator('#binTabTrash').hover();assert not is_red(pg.locator('#binTabTrash'))
  purge=pg.locator('#binBody [data-purge]')
  assert is_red(purge),'Permanent deletion must be red before interaction'
  purge.click()
  expect(pg.locator('#binBody .inline-confirm-question')).to_have_text('Delete permanently?')
  assert pg.evaluate('state.__trash__.length')==1
  cancel=pg.locator('#binBody [data-cancel-row]')
  assert not is_red(cancel)
  cancel.click()
  assert pg.evaluate("localStorage.getItem('chronos-planner-v2')")==stored
  purge.click();pg.locator('#binBody [data-confirm-row]').click()
  assert pg.evaluate('state.__trash__.length')==0
  assert not errors,(engine,errors)
  ctx.close()
  # Load canonical files through the same directory-selection and refresh path as the UI.
  ctx=browser.new_context(viewport={'width':1200,'height':900})
  pg=ctx.new_page();errors=[]
  pg.on('pageerror',lambda error:errors.append(str(error)))
  pg.add_init_script("localStorage.setItem('chronos-planner-v2',JSON.stringify("+json.dumps(sample)+"));")
  pg.goto(candidate.as_uri())
  pg.evaluate('''entries=>{
   // A mocked OS directory handle cannot be cloned into IndexedDB.
   storeDirectory=async()=>true;
   window.showDirectoryPicker=async()=>({
    queryPermission:async()=>"granted",
    values:async function*(){for(const entry of entries)yield {
     kind:"file",name:entry.name,getFile:async()=>new File([entry.source],entry.name)
    };}
   });
  }''',locale_entries)
  pg.locator('#settingsToggle').click()
  pg.locator('[data-action="connect-locale-directory"]').click()
  expect(pg.locator('[data-action="set-locale"]')).to_have_count(4)
  pg.locator('[data-locale="russian.locale.js"]').click()
  expect(pg.locator('html')).to_have_attribute('lang','ru-RU')
  expect(pg.locator('#dimensionManagerToggle')).to_have_attribute('aria-label','Типы меток')
  assert pg.evaluate("localStorage.getItem('chronos-planner-v2-locale')")=='russian.locale.js'
  pg.locator('#settingsToggle').click()
  expect(pg.locator('[data-action="set-locale"]')).to_have_count(4)
  expect(pg.locator('html')).to_have_attribute('lang','ru-RU')
  assert not errors,(engine,errors)
  ctx.close()
  browser.close()
 print('PASS screen popovers: clipping-safe real content clicks, six header types, nested clear/focus, resize, context menus and autocomplete; bundled Chromium + installed Brave when available')

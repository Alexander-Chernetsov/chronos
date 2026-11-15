"""Public demo: real menus, persistence, bundled files and origin isolation."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import threading
import tempfile
import subprocess
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

root = Path(__file__).resolve().parents[1]
sample = {'__schema__':1,'__dimensions__':['#','@','!'],'__dimensionColors__':{'#':85,'@':305,'!':25},
 '__ui__':{'dayCount':3,'collapsed':[],'todayColumnIndex':2,'theme':'light','view':'board','expandedKey':None,'filterLastEditor':'all'},
 '__inbox__':[{'id':'regular','text':'Regular synthetic task @Irene','comment':'','lastEditedByAgent':False}],
 '__control__':[],'__archive__':[],'__trash__':[]}

class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass

with tempfile.TemporaryDirectory(prefix='chronos-demo-') as temporary, sync_playwright() as p:
 directory=Path(temporary)
 for options in [[],['--demo']]:
  name='demo.html' if options else 'regular.html'
  subprocess.run(['node',str(root/'tools/build-standalone.mjs'),*options,str(directory/name)],cwd=root,check=True,capture_output=True)
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=temporary))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 base=f'http://127.0.0.1:{server.server_port}'
 browser=p.chromium.launch(headless=True)
 try:
  context=browser.new_context(viewport={'width':1440,'height':1000},color_scheme='dark')
  page=context.new_page();errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(base+'/regular.html')
  page.evaluate('sample=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(sample));localStorage.setItem(RECOVERY_KEY,"regular recovery sentinel");localStorage.setItem(LOCALE_KEY,"default");localStorage.setItem(VISUAL_THEME_KEY,"default");}',sample)
  await_idb='''async () => {
   const request=indexedDB.open('chronos-planner-v2-handles',1);
   const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=reject;});
   const tx=db.transaction('handles','readwrite');tx.objectStore('handles').put('regular IDB sentinel','sentinel');
   await new Promise(resolve=>tx.oncomplete=resolve);db.close();
  }'''
  page.evaluate(await_idb)
  regular=page.evaluate('Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith("chronos-planner-v2")))')
  page.goto(base+'/demo.html')
  page.wait_for_function('activeVisualThemeId==="graphite-moss.css" && availableVisualThemes.length===22 && availableLocales.length===3')
  assert page.evaluate('STORAGE_KEY')=='chronos-planner-demo-v2'
  assert page.evaluate('DIRECTORY_HANDLE_DB')=='chronos-planner-demo-v2-handles'
  assert page.evaluate('ui().theme')=='dark'
  assert page.evaluate('[ui().dayCount,ui().todayColumnIndex]')==[7,1]
  expect(page.locator('.column[data-key]')).to_have_count(9)
  expect(page.locator('.task')).to_have_count(8)
  history=page.evaluate('({done:state.__archive__,bin:state.__trash__})')
  assert len(history['done'])==len(history['bin'])==1
  assert page.evaluate('Date.now()-state.__archive__[0].archivedAt>23*3600000 && Date.now()-state.__archive__[0].archivedAt<25*3600000')
  assert page.evaluate('Date.now()-state.__trash__[0].deletedAt>23*3600000 && Date.now()-state.__trash__[0].deletedAt<25*3600000')
  assert page.evaluate('JSON.stringify(state).includes("@Irene") && !JSON.stringify(state).includes("@Ирина")')
  expect(page.locator('#settingsVersion')).to_contain_text('Chronos 2.2.29')
  page.locator('#settingsToggle').click()
  expect(page.locator('#visualThemePopoverActions [data-action="set-visual-theme"]')).to_have_count(23)
  expect(page.locator('#localePopoverActions [data-action="set-locale"]')).to_have_count(4)
  page.locator('#visualThemePopoverActions [data-visual-theme="focus.css"]').click()
  page.locator('#settingsToggle').click()
  page.locator('#localePopoverActions [data-locale="russian.locale.js"]').click()
  page.locator('#settingsToggle').click()
  expect(page.locator('#themeToggle')).to_be_visible()
  page.locator('#themeToggle').click()
  page.keyboard.press('Escape')
  assert page.evaluate('ui().theme')=='light'
  title=page.locator('.task-text').first
  title.click();title.fill('Changed demo task #work @Irene tomorrow');title.press('Enter')
  page.wait_for_function('localStorage.getItem(STORAGE_KEY).includes("Changed demo task")')
  page.reload()
  page.wait_for_function('activeVisualThemeId==="focus.css" && activeLocaleId==="russian.locale.js"')
  assert page.evaluate('ui().theme')=='light','system preference must not overwrite a saved manual choice'
  expect(page.locator('.task-text').first).to_have_text('Changed demo task work Irene tomorrow')
  assert page.evaluate('JSON.parse(localStorage.getItem(STORAGE_KEY)).__inbox__[0].text')=='Changed demo task #work @Irene tomorrow'
  page.locator('#settingsToggle').click()
  expect(page.locator('#visualThemePopoverActions [data-action="set-visual-theme"]')).to_have_count(23)
  expect(page.locator('#localePopoverActions [data-action="set-locale"]')).to_have_count(4)
  page.keyboard.press('Escape')
  page.evaluate('''async()=>{
   const denied={queryPermission:async()=>"denied"};
   visualThemeDirectoryHandle=denied;localeDirectoryHandle=denied;
   await refreshVisualThemes();await refreshLocales();
  }''')
  assert page.evaluate('[availableVisualThemes.length,availableLocales.length,activeVisualThemeId,activeLocaleId]')==[22,3,'focus.css','russian.locale.js']
  print('PASS catalogs, actual menu choices, persisted edits/language/theme and denied-folder fallback')

  theme_source=(root/'chronos-2.0/themes/focus.css').read_text(encoding='utf-8').replace('--chronos-theme-id: "focus"','--chronos-theme-id: "focus-custom"')
  page.evaluate('''async source=>{
   visualThemeDirectoryHandle={queryPermission:async()=>"granted",async *values(){yield {kind:"file",name:"focus.css",getFile:async()=>({text:async()=>source})}}};
   const locale='window.CHRONOS_LOCALE_PACK = '+JSON.stringify({chronosLocale:1,locale:'pl-PL',name:'Custom locale',shortLabel:'PL',messages:DEFAULT_LOCALE_PACK.messages})+';';
   localeDirectoryHandle={queryPermission:async()=>"granted",async *values(){yield {kind:"file",name:"russian.locale.js",getFile:async()=>({text:async()=>locale})}}};
   await refreshVisualThemes();await refreshLocales();
   selectVisualTheme('focus.css');selectLocale('russian.locale.js');
  }''',theme_source)
  assert page.evaluate('availableVisualThemes.filter(pack=>pack.id==="focus.css").length')==1,'folder and bundled theme IDs must not collide'
  assert page.evaluate('activeVisualTheme().themeId')=='focus-custom'
  assert page.evaluate('availableLocales.filter(pack=>pack.id==="russian.locale.js").length')==1
  assert page.evaluate('APP_LOCALE')=='pl-PL'
  page.evaluate('''async()=>{visualThemeDirectoryHandle=null;localeDirectoryHandle=null;await refreshVisualThemes();await refreshLocales();}''')
  print('PASS folder files replace filename and semantic collisions and remain selectable')

  blocker=context.new_page();blocker.goto(base+'/regular.html')
  blocker.evaluate('''async()=>{const r=indexedDB.open('chronos-planner-demo-v2-handles');globalThis.blockingDb=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));}''')
  dialogs=[]
  def answer_reset(dialog):
   dialogs.append(dialog.type);dialog.accept()
  page.on('dialog',answer_reset)
  page.locator('#demoReset').click()
  for _ in range(30):
   if 'alert' in dialogs or page.evaluate('activeVisualThemeId==="graphite-moss.css"'):break
   page.wait_for_timeout(20)
  title=page.locator('.task-text').first;title.click();title.fill('Edited after reset request');title.press('Enter')
  page.wait_for_function('localStorage.getItem(STORAGE_KEY).includes("Edited after reset request")')
  blocker.evaluate('''async()=>{blockingDb.close();const r=indexedDB.open('chronos-planner-demo-v2-handles');const db=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));db.close();}''')
  page.wait_for_timeout(200)
  assert page.evaluate('localStorage.getItem(STORAGE_KEY).includes("Edited after reset request")'),'a previously blocked reset must not erase later edits'
  page.remove_listener('dialog',answer_reset);blocker.close()
  print('PASS an open database in another tab cannot cause a delayed destructive reset')

  snapshot=page.evaluate('localStorage.getItem(STORAGE_KEY)')
  page.evaluate('dataFileHandle={name:"synthetic connected file"}')
  rejected=[]
  def reject_reset(dialog):
   rejected.append(dialog.type);dialog.accept()
  page.once('dialog',reject_reset);page.locator('#demoReset').click()
  assert rejected==['alert']
  assert page.evaluate('localStorage.getItem(STORAGE_KEY)')==snapshot
  page.evaluate('dataFileHandle=null')
  page.evaluate('''()=>{globalThis.realOpen=openHandleDatabase;openHandleDatabase=()=>new Promise(resolve=>globalThis.finishResetOpen=resolve);}''')
  page.once('dialog',lambda dialog:dialog.accept());page.locator('#demoReset').click()
  title=page.locator('.task-text').first;title.click();title.fill('Edited while reset was waiting');title.press('Enter')
  page.wait_for_function('localStorage.getItem(STORAGE_KEY).includes("Edited while reset was waiting")')
  page.evaluate('''async()=>{const db=await realOpen();openHandleDatabase=realOpen;finishResetOpen(db);}''')
  expect(page.locator('#demoReset')).to_be_enabled()
  assert page.evaluate('localStorage.getItem(STORAGE_KEY).includes("Edited while reset was waiting")')
  print('PASS reset refuses a connected file and expires consent after intervening edits')

  snapshot=page.evaluate('localStorage.getItem(STORAGE_KEY)')
  page.once('dialog',lambda dialog:dialog.dismiss())
  page.locator('#demoReset').click()
  assert page.evaluate('localStorage.getItem(STORAGE_KEY)')==snapshot
  page.once('dialog',lambda dialog:dialog.accept())
  with page.expect_navigation(wait_until='load'):
   page.locator('#demoReset').click()
  page.wait_for_function('activeVisualThemeId==="graphite-moss.css" && activeLocaleId==="default"')
  expect(page.locator('.task')).to_have_count(8)
  assert page.evaluate('ui().theme')=='dark'
  assert page.evaluate('Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith("chronos-planner-v2")))')==regular
  sentinel=page.evaluate('''async()=>{
   const request=indexedDB.open('chronos-planner-v2-handles');
   const db=await new Promise(resolve=>request.onsuccess=()=>resolve(request.result));
   const tx=db.transaction('handles'),read=tx.objectStore('handles').get('sentinel');
   const value=await new Promise(resolve=>read.onsuccess=()=>resolve(read.result));db.close();return value;
  }''')
  assert sentinel=='regular IDB sentinel'
  print('PASS reset confirmation and complete regular localStorage/IndexedDB isolation on the same origin')

  page.evaluate('''()=>{
   for(const key of Object.keys(state)) if(Array.isArray(state[key]) && key!==DIMENSIONS) state[key]=[];
   validateIncomingData(state);localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  }''')
  page.reload();expect(page.locator('.task')).to_have_count(0)
  assert not errors,errors
  context.close()

  for mode in ['light','corrupt','unavailable']:
   context=browser.new_context(color_scheme='light')
   page=context.new_page()
   if mode=='corrupt':page.add_init_script('localStorage.setItem("chronos-planner-demo-v2","original broken demo snapshot")')
   if mode=='unavailable':page.add_init_script('Storage.prototype.getItem=function(){throw new DOMException("blocked","SecurityError")}')
   page.goto(base+'/demo.html')
   if mode=='light':
    page.wait_for_function('activeVisualThemeId==="graphite-moss.css"')
    assert page.evaluate('ui().theme')=='light'
    expect(page.locator('.task')).to_have_count(8)
   else:
    expect(page.locator('.task')).to_have_count(0)
    if mode=='corrupt':assert page.evaluate('localStorage.getItem(RECOVERY_KEY)')=='original broken demo snapshot'
   context.close()
  print('PASS system-light first visit, no reseed after clearing, corruption recovery and blocked storage')

  context=browser.new_context(color_scheme='light')
  page=context.new_page();page.goto(base+'/demo.html')
  page.wait_for_function('activeVisualThemeId==="graphite-moss.css"')
  done=page.evaluate('state.__archive__[0]')
  page.locator('[data-action="archive"]').click()
  expect(page.locator('#binBody .bin-text')).to_have_count(1)
  expect(page.locator('#binBody .bin-text')).to_contain_text('Send the draft')
  expect(page.locator('#binBody .task-marker')).to_have_count(2)
  expect(page.locator('#binBody .bin-text button')).to_have_count(0)
  page.locator('#binBody [data-restore]').click()
  expect(page.locator('#binBody .bin-text')).to_have_count(0)
  restored=page.evaluate('id=>state[dateKey(todayStart())].find(task=>task.id===id)',done['id'])
  assert restored['text']==done['text'] and 'archivedAt' not in restored
  page.locator('#binTabTrash').click()
  expect(page.locator('#binBody .bin-text')).to_have_count(1)
  page.locator('#binBody [data-purge]').click()
  page.locator('#binBody [data-cancel-row]').click()
  expect(page.locator('#binBody .bin-text')).to_have_count(1)
  page.locator('#binBody [data-purge]').click()
  page.locator('#binBody [data-confirm-row]').click()
  expect(page.locator('#binBody .bin-text')).to_have_count(0)
  assert page.evaluate('state.__trash__.length')==0
  context.close()
  print('PASS populated Done/Bin, passive chips, restore and confirmed permanent deletion')

  for width in [320,390]:
   context=browser.new_context(viewport={'width':width,'height':844},is_mobile=True,has_touch=True,color_scheme='light')
   page=context.new_page();page.goto(base+'/demo.html')
   page.wait_for_function('activeVisualThemeId==="graphite-moss.css"')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   for button in page.locator('#demoToolbar :is(a,button)').all():
    bounds=button.bounding_box();assert bounds['width']>=44 and bounds['height']>=44
   page.locator('#settingsToggle').click()
   bounds=page.locator('#settingsPopover').bounding_box()
   assert bounds['x']>=7 and bounds['x']+bounds['width']<=width-7
   assert bounds['y']>=page.locator('.app-header').bounding_box()['y']+page.locator('.app-header').bounding_box()['height']
   expect(page.locator('#localePopoverActions [data-action="set-locale"]')).to_have_count(4)
   expect(page.locator('#visualThemePopoverActions [data-action="set-visual-theme"]')).to_have_count(23)
   context.close()
  print('PASS mobile toolbar, touch targets and real settings bounds at 320/390px')
 finally:
  browser.close();server.shutdown();server.server_close()

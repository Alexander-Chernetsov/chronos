from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json
import subprocess
import tempfile
import time
import base64
import math

root = Path(__file__).resolve().parents[1]

def assert_header_anchor(pg,popover_selector,trigger_selector):
 bounds=pg.locator(popover_selector).bounding_box()
 width=pg.evaluate('document.documentElement.clientWidth')
 expected=width-8-bounds['width']
 if pg.locator(popover_selector).evaluate('el=>el.matches(".task-marker-filter-popover,.editor-filter-popover")'):
  trigger=pg.locator(trigger_selector).bounding_box()
  expected=max(8,min(trigger['x'],expected))
 assert abs(bounds['x']-expected)<=1,(popover_selector,bounds)
 assert pg.locator(popover_selector).evaluate('el=>el.matches(":popover-open")')
 return True

def surface_contrast(control, surface_selector):
 # Bound translucent solid surfaces against both possible backdrop extremes.
 # Images/gradients need visual assessment; do not report them as solid colors.
 return control.evaluate('''(el,selector)=>{
  const surface=el.closest(selector),style=getComputedStyle(surface),text=getComputedStyle(el);
  if(style.backgroundImage!=='none') throw Error('Surface image requires visual assessment');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');
  function rgba(color){c.clearRect(0,0,1,1);c.fillStyle=color;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data];}
  function over(a,b){const alpha=a[3]/255;return a.slice(0,3).map((v,i)=>v*alpha+b[i]*(1-alpha)).concat(255);}
  function lum(a){const v=a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];}
  const bg=rgba(style.backgroundColor),fg=rgba(text.color);
  if(fg[3]!==255) throw Error('Translucent text requires visual assessment');
  const limits=[lum(over(bg,[0,0,0])),lum(over(bg,[255,255,255]))],l=lum(fg);
  if(l>=limits[0] && l<=limits[1]) return 1;
  return Math.min(...limits.map(value=>(Math.max(l,value)+.05)/(Math.min(l,value)+.05)));
 }''', surface_selector)

def gradient_wordmark_contrast(control):
 # Measure native-rendered gradient colors against the real composited header.
 # Hiding the glyphs and then exposing their gradient preserves the same geometry.
 pg=control.page
 original=control.get_attribute('style')
 box=control.bounding_box()
 left,top=math.ceil(box['x']),math.ceil(box['y'])
 clip={'x':left,'y':top,'width':math.floor(box['x']+box['width'])-left,
       'height':math.floor(box['y']+box['height'])-top}
 assert control.evaluate('el=>getComputedStyle(el).backgroundClip==="text" && getComputedStyle(el).backgroundImage.startsWith("linear-gradient(")')
 try:
  control.evaluate('el=>el.style.visibility="hidden"')
  background=pg.screenshot(clip=clip)
  control.evaluate('el=>{el.style.visibility="visible";el.style.backgroundClip="border-box";el.style.webkitBackgroundClip="border-box";}')
  foreground=pg.screenshot(clip=clip)
  assert control.bounding_box()==box,'Gradient wordmark moved during measurement'
 finally:
  control.evaluate('(el,value)=>value===null?el.removeAttribute("style"):el.setAttribute("style",value)',original)
 images=['data:image/png;base64,'+base64.b64encode(png).decode() for png in [background,foreground]]
 return pg.evaluate('''async images=>{
  const pixels=await Promise.all(images.map(async url=>{
   const bitmap=await createImageBitmap(await (await fetch(url)).blob());
   const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
   const result=context.getImageData(0,0,canvas.width,canvas.height).data;bitmap.close();return result;
  }));
  function lum(a,i){const v=[a[i],a[i+1],a[i+2]].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];}
  if(pixels[0].length!==pixels[1].length || !pixels[0].length) throw Error('Gradient geometry changed');
  let minimum=Infinity;
  for(let i=0;i<pixels[0].length;i+=4){
   if(pixels[0][i+3]!==255 || pixels[1][i+3]!==255) throw Error('Expected opaque rendered samples');
   const a=lum(pixels[0],i),b=lum(pixels[1],i);
   minimum=Math.min(minimum,(Math.max(a,b)+.05)/(Math.min(a,b)+.05));
  }
  return minimum;
 }''',images)

data = {
 '__schema__': 1, '__dimensions__': ['#','@','!'], '__dimensionColors__': {'#':85,'@':305,'!':25},
 '__ui__': {'dayCount':2,'collapsed':[],'todayColumnIndex':1,'theme':'light','view':'board','expandedKey':None,'filterLastEditor':'all'},
 '__inbox__': [
  {'id':1,'text':'Review #build @Ирина !🔥soon','comment':'Check details','lastEditedByAgent':False},
  {'id':2,'text':'Call #work @Ivan +home 🧭north','comment':'','lastEditedByAgent':True}],
 '__control__': [], '__archive__': [], '__trash__': []
}
with tempfile.TemporaryDirectory(prefix='chronos-dimension-browser-') as temporary, sync_playwright() as p:
 candidate=Path(temporary)/'candidate.html'
 subprocess.run(['node',str(root/'tools/build-standalone.mjs'),str(candidate)],check=True,cwd=root,capture_output=True)
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1200,'height':1000})
 page=context.new_page()
 errors=[]
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.add_init_script("localStorage.setItem('chronos-planner-v2', JSON.stringify("+json.dumps(data)+"));")
 page.goto(candidate.as_uri())
 page.set_default_timeout(8000)
 expect(page.locator('.task')).to_have_count(2)
 expect(page.locator('#dimensionFilterControls > div')).to_have_count(3)
 assert page.locator('#dimensionManagerToggle').evaluate('el=>!el.closest(".filter-control") && el.closest(".dimension-manager-control").nextElementSibling?.classList.contains("settings-control")')
 page.locator('#dimensionManagerToggle').click()
 assert assert_header_anchor(page,'#dimensionManagerPopover','#dimensionManagerToggle')
 expect(page.locator('#dimensionSettingsHeading')).to_have_text('Tag types')
 expect(page.locator('#newDimensionSymbol')).to_be_focused()
 unchanged=page.evaluate("localStorage.getItem('chronos-planner-v2')")
 for invalid in ['ab','#',';']:
  page.locator('#newDimensionSymbol').fill(invalid)
  assert page.evaluate("localStorage.getItem('chronos-planner-v2')")==unchanged
  page.locator('#newDimensionSymbol').press('Enter')
  expect(page.locator('#newDimensionSymbol')).to_have_attribute('aria-invalid','true')
  assert page.evaluate("localStorage.getItem('chronos-planner-v2')")==unchanged
 page.locator('#newDimensionSymbol').fill('+')
 page.get_by_role('button',name='Add',exact=True).click()
 page.locator('#newDimensionSymbol').fill('🧭')
 page.locator('#newDimensionSymbol').press('Enter')
 expect(page.locator('#dimensionFilterControls > div')).to_have_count(5)
 expect(page.get_by_role('button',name='Tags 🧭: north',exact=True)).to_be_visible()
 page.locator('#settingsToggle').click()
 expect(page.locator('#dimensionManagerPopover')).to_be_hidden()
 expect(page.locator('#settingsPopover #dimensionColors')).to_have_count(0)
 expect(page.locator('#settingsPopover #newDimensionSymbol')).to_have_count(0)
 page.get_by_role('button',name='Tags #: all',exact=True).click()
 assert assert_header_anchor(page,'.task-marker-filter-popover.open','.task-marker-filter-trigger[data-marker-kind="#"]')
 expect(page.locator('#settingsPopover')).to_be_hidden()
 page.get_by_role('button',name='build · 1 tasks',exact=True).click()
 expect(page.locator('.task')).to_have_count(1)
 selected=page.locator('.task-marker-filter-control[data-dimension="#"]')
 expect(selected.locator('.task-marker-filter-trigger')).to_have_text('#')
 expect(selected.locator('.task-marker-filter-dot')).to_be_visible()
 selected.locator('.task-marker-filter-trigger').click()
 expect(selected.locator('.task-marker-filter-selected')).to_have_text('#build')
 expect(selected.get_by_role('button',name='Clear filter #',exact=True)).to_have_text('×')
 page.keyboard.press('Escape')
 page.get_by_role('button',name='Tags @: all',exact=True).click()
 page.get_by_role('button',name='Ирина · 1 tasks',exact=True).click()
 expect(page.locator('.task')).to_have_count(1)
 page.locator('#clearFiltersButton').click()
 title=page.locator('.task[data-id="2"] .task-text')
 for suffix in [' rest', ',']:
  title.click()
  title.fill('Call #work'+suffix)
  title.evaluate('''el => {
   const range=document.createRange(); range.setStart(el.firstChild,8); range.collapse(true);
   const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
   el.dispatchEvent(new Event('input',{bubbles:true}));
  }''')
  expect(page.locator('#markerSuggestions')).to_be_visible()
  title.press('Enter')
  expect(page.locator('#markerSuggestions')).to_have_count(0)
  title.press('Enter')
  assert page.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2')).__inbox__[1].text")=='Call #work'+suffix
 title.click()
 title.fill('Call #wo')
 expect(page.locator('#markerSuggestions')).to_be_visible()
 title.press('Home')
 expect(page.locator('#markerSuggestions')).to_have_count(0)
 title.press('Enter')
 assert page.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2')).__inbox__[1].text")=='Call #wo'
 title.click()
 title.fill(data['__inbox__'][1]['text'])
 title.press('Enter')
 title.click()
 title.fill('Call 🧭no')
 expect(page.locator('#markerSuggestions')).to_be_visible()
 title.press('Enter')
 expect(title).to_have_text('Call 🧭north ')
 title.press('End')
 title.type('tomorrow')
 title.press('Enter')
 saved=page.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2'))")
 assert saved['__inbox__'][1]['text']=='Call 🧭north tomorrow',saved
 page.locator('#dimensionManagerToggle').click()
 page.get_by_role('button',name='Tag color 🧭',exact=True).click()
 row=page.locator('.dimension-color-row').filter(has=page.locator('.dimension-symbol',has_text='🧭'))
 expect(row.locator('.dimension-swatch')).to_have_count(18)
 expect(row.locator('.dimension-swatch[aria-pressed="true"]')).to_have_count(1)
 row.get_by_role('button',name='Hue 5°',exact=True).click()
 expect(row.locator('.dimension-palette')).to_be_hidden()
 expect(row.locator('.dimension-color-trigger')).to_have_attribute('aria-expanded','false')
 expect(row.locator('.dimension-color-trigger')).to_be_focused()
 row.locator('.dimension-color-trigger').click()
 expect(row.get_by_role('button',name='Hue 5°',exact=True)).to_have_attribute('aria-pressed','true')
 assert page.evaluate('state.__dimensionColors__["🧭"]')==5
 row.get_by_role('button',name='Hue 345°',exact=True).click()
 expect(row.locator('.dimension-palette')).to_be_hidden()
 row.locator('.dimension-color-trigger').click()
 expect(row.get_by_role('button',name='Hue 345°',exact=True)).to_have_attribute('aria-pressed','true')
 page.get_by_role('button',name='Disable tag type 🧭',exact=True).click()
 expect(page.locator('#dimensionManagerPopover')).to_be_visible()
 expect(page.locator('.task[data-id="2"] .task-text')).to_contain_text('🧭north')
 page.locator('#newDimensionSymbol').fill('🧭')
 page.locator('#newDimensionSymbol').press('Enter')
 saved=page.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2'))")
 assert saved['__dimensionColors__']['🧭']==345
 page.keyboard.press('Escape')
 expect(page.locator('#dimensionManagerToggle')).to_be_focused()
 title=page.locator('.task[data-id="2"] .task-text')
 title.click()
 title.fill('Call 🧭no')
 expect(page.locator('#markerSuggestions')).to_be_visible()
 title.press('Escape')
 expect(page.locator('#markerSuggestions')).to_have_count(0)
 title.press('Enter')
 saved=page.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2'))")
 assert saved['__inbox__'][1]['text']=='Call 🧭no'
 title.click()
 title.fill('Call 🧭unknown')
 expect(page.locator('#markerSuggestions')).to_have_count(0)
 title.press('Enter')
 saved=page.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2'))")
 assert saved['__inbox__'][1]['text']=='Call 🧭unknown'
 page.screenshot(path=str(Path(temporary)/'dimensions-candidate-stage2.png'),full_page=True)
 before=saved['__dimensionColors__']
 page.evaluate('clearLocalTasks()')
 saved=page.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2'))")
 assert saved['__dimensions__']==['#','@','!','+','🧭']
 assert saved['__dimensionColors__']==before
 assert saved['__inbox__']==[]
 expect(page.locator('#clearDataBtn')).to_be_disabled()
 assert not errors,errors
 context.close()

 def fresh(value, width=1200, touch=False, dark=False, height=1000):
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch,color_scheme='dark' if dark else 'light')
  pg=ctx.new_page()
  pg.set_default_timeout(8000)
  pg.on('pageerror',lambda e: errors.append(str(e)))
  raw=json.dumps(value,ensure_ascii=False)
  pg.add_init_script("localStorage.setItem('chronos-planner-v2',"+json.dumps(raw)+");")
  pg.goto(candidate.as_uri())
  return ctx,pg,raw

 def assert_first_line_alignment(pg,label):
  centers=pg.evaluate('''()=>{
   const el=document.querySelector('.task[data-id="1"]');
   const title=el.querySelector('.task-text'),first=title.querySelector('.task-marker');
   const r=first.getBoundingClientRect(),center=r.y+r.height/2;
   return [...el.querySelectorAll('.task-done-action,.task-trash-action,.task-menu-trigger')]
    .filter(control=>getComputedStyle(control).display!=='none')
    .map(control=>{const b=control.getBoundingClientRect();return {control:control.className,delta:b.y+b.height/2-center};});
  }''')
  assert all(abs(item['delta'])<=2 for item in centers),(label,centers)
  anchors=pg.evaluate("""()=>[...document.querySelectorAll('.task:has(.task-title-row > .last-editor-mark)')].map(card=>{
   const robot=card.querySelector('.last-editor-mark').getBoundingClientRect();
   const text=card.querySelector('.task-text');const range=document.createRange();
   range.setStart(text.firstChild,0);range.setEnd(text.firstChild,Math.min(1,text.firstChild.length||1));
   const first=range.getBoundingClientRect();
   return {overlap:robot.right>first.left+1,width:robot.width,height:robot.height,
    oldRail:!!card.querySelector('.task-left')};
  })""")
  assert anchors,('agent cards must be present',label)
  assert all(not item['oldRail'] and not item['overlap'] for item in anchors),(label,anchors)
  if pg.evaluate('matchMedia("(pointer: coarse), (max-width: 640px)").matches'):
   assert all(min(item['width'],item['height'])>=44 for item in anchors),(label,anchors)

 # Emoji-only values in ! are real markers, with a clickable popup and
 # the same one-value/toggle rules as names in the other dimensions.
 priority_data=json.loads(json.dumps(data))
 priority_data['__inbox__'][0]['text']='!⭐ !🔥 Review #build @Ирина'
 priority_data['__inbox__'][1]['text']='!🔥 Call #work @Ivan'
 ctx,pg,_=fresh(priority_data)
 bang=pg.locator('.task-marker-filter-trigger[data-marker-kind="!"]')
 expect(bang).to_be_enabled()
 bang.locator('.task-marker-filter-glyph').click()
 expect(pg.locator('.task-marker-filter-popover.open')).to_be_visible()
 expect(pg.get_by_role('button',name='⭐ · 1 tasks',exact=True)).to_be_visible()
 expect(pg.get_by_role('button',name='🔥 · 2 tasks',exact=True)).to_be_visible()
 pg.get_by_role('button',name='⭐ · 1 tasks',exact=True).click()
 expect(pg.locator('.task')).to_have_count(1)
 bang.click()
 expect(pg.locator('.task-marker-filter-popover.open .task-marker-filter-selected')).to_have_text('!⭐')
 assert_header_anchor(pg,'.task-marker-filter-popover.open','.task-marker-filter-trigger[data-marker-kind="!"]')
 pg.locator('#dimensionManagerToggle svg').click()
 expect(pg.locator('.task-marker-filter-popover.open')).to_have_count(0)
 expect(pg.locator('#dimensionManagerPopover')).to_be_visible()
 pg.locator('#settingsToggle').click()
 expect(pg.locator('#dimensionManagerPopover')).to_be_hidden()
 pg.locator('#dimensionManagerToggle').click()
 expect(pg.locator('#settingsPopover')).to_be_hidden()
 expect(pg.locator('#dimensionManagerPopover')).to_be_visible()
 ctx.close()

 # The author filter must not cover the relocated manager either.
 author_data=json.loads(json.dumps(priority_data))
 author_data['__dimensions__'].append('+')
 author_data['__dimensionColors__']['+']=190
 ctx,pg,_=fresh(author_data,320,touch=True,height=568)
 pg.locator('#editorFilterTrigger').click()
 assert pg.locator('#dimensionManagerToggle').evaluate('el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),'author popup covers the manager'
 pg.locator('#dimensionManagerToggle').click()
 expect(pg.locator('#editorFilterPopover')).to_be_hidden()
 expect(pg.locator('#dimensionManagerPopover')).to_be_visible()
 pg.keyboard.press('Escape')
 pg.locator('#editorFilterTrigger').click()
 pg.locator('#editorFilterPopover [data-editor-filter="agent"]').click()
 assert pg.evaluate('ui().filterLastEditor')=='agent'
 pg.locator('#editorFilterTrigger').click()
 pg.keyboard.press('Escape')
 expect(pg.locator('#editorFilterTrigger')).to_be_focused()
 ctx.close()

 # A wrapped header and a nonempty search must leave every header button
 # physically clickable while a dropdown is open, including ! at the end.
 crowded=json.loads(json.dumps(priority_data))
 crowded['__dimensions__']=['#','@','+','$','%','&','!']
 crowded['__dimensionColors__']={symbol:85 for symbol in crowded['__dimensions__']}
 crowded['__inbox__'][0]['text']='!⭐ !🔥 Review #averylongdimensionvalueforresponsiveheaderinspection @Ирина +home $cost %rate &team'
 crowded['__inbox__'] += [{'id':index+10,'text':f'!🔥 Review #project{index}','comment':'','lastEditedByAgent':False} for index in range(40)]
 ctx,pg,_=fresh(crowded,320,touch=True,height=568)
 pg.locator('[data-action="search"]').click()
 pg.locator('#boardSearchInput').fill('Review')
 pg.evaluate('setTaskMarkerFilter("#","#averylongdimensionvalueforresponsiveheaderinspection")')
 pg.locator('.task-marker-filter-trigger[data-marker-kind="#"]').click()
 bang=pg.locator('.task-marker-filter-trigger[data-marker-kind="!"]')
 assert bang.evaluate('el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),'! is covered by another popup'
 header=pg.locator('.app-header').bounding_box()
 popup=pg.locator('.task-marker-filter-popover.open').bounding_box()
 assert popup['y']>=header['y']+header['height'],('popup covers wrapped header',header,popup)
 assert pg.locator('.task-marker-filter-popover.open').evaluate('el=>el.scrollHeight>el.clientHeight'),'long filter should scroll'
 bang.click()
 expect(pg.locator('.task-marker-filter-control[data-dimension="!"] .task-marker-filter-popover')).to_be_visible()
 pg.locator('#dimensionManagerToggle svg').click()
 expect(pg.locator('#dimensionManagerPopover')).to_be_visible()
 pg.locator('#settingsToggle').click()
 expect(pg.locator('#dimensionManagerPopover')).to_be_hidden()
 expect(pg.locator('#settingsPopover')).to_be_visible()
 ctx.close()

 # Empty dimensions retain their manager; removing a selected dimension clears
 # only that filter and restores badges/color when the sign is added again.
 ctx,pg,_=fresh(data)
 pg.evaluate('setTaskMarkerFilter("#","#build")')
 expect(pg.locator('.task')).to_have_count(1)
 pg.locator('#dimensionManagerToggle').focus()
 pg.locator('#dimensionManagerToggle').press('Enter')
 pg.get_by_role('button',name='Disable tag type #',exact=True).click()
 expect(pg.locator('.task')).to_have_count(2)
 saved=pg.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2'))")
 assert saved['__inbox__']==data['__inbox__']
 assert saved['__dimensionColors__']['#']==85
 pg.locator('#newDimensionSymbol').fill('#');pg.locator('#newDimensionSymbol').press('Enter')
 assert pg.evaluate('activeDimensions()')==['@','!','#']
 assert pg.evaluate('activeFilter().markers')=={}
 for symbol in ['@','!','#']:
  pg.get_by_role('button',name='Disable tag type '+symbol,exact=True).click()
 expect(pg.locator('#dimensionFilterControls > div')).to_have_count(0)
 expect(pg.locator('#dimensionManagerToggle')).to_be_enabled()
 pg.keyboard.press('Escape')
 pg.locator('#dimensionManagerToggle').click()
 pg.locator('#newDimensionSymbol').fill('#');pg.locator('#newDimensionSymbol').press('Enter')
 expect(pg.get_by_role('button',name='Tags #: build',exact=True)).to_be_visible()
 pg.keyboard.press('Escape')
 pg.evaluate('openNewTask("__inbox__",true)')
 draft=pg.locator('.new-task-panel.open textarea')
 draft.fill('Unsaved bulk task')
 pg.locator('#dimensionManagerToggle').click()
 expect(pg.locator('#dimensionManagerPopover')).to_be_hidden()
 expect(draft).to_be_focused()
 expect(draft).to_have_value('Unsaved bulk task')
 ctx.close()

 # Historical tasks still count as data when every active bucket is empty.
 for bucket,stamp in [('__archive__','archivedAt'),('__trash__','deletedAt')]:
  historical=json.loads(json.dumps(data))
  historical['__inbox__']=[]
  historical[bucket]=[{**data['__inbox__'][0],stamp:int(time.time()*1000)}]
  ctx,pg,_=fresh(historical)
  expect(pg.locator('#bootErrors')).to_be_hidden()
  expect(pg.locator('#clearDataBtn')).to_be_enabled()
  ctx.close()

 # Incompatible cache stays recoverable and cannot be overwritten by autosave.
 for schema in [None,2]:
  invalid=json.loads(json.dumps(data))
  if schema is None: del invalid['__schema__']
  else: invalid['__schema__']=schema
  ctx,pg,raw=fresh(invalid)
  expect(pg.locator('#schemaBootError')).to_be_visible()
  assert pg.locator('#board').evaluate('(el)=>el.inert')
  pg.evaluate('save();openNewTask("__inbox__")')
  assert pg.evaluate("localStorage.getItem('chronos-planner-v2')")==raw
  assert pg.evaluate("localStorage.getItem('chronos-planner-v2-recovery')")==raw
  pg.evaluate('syncModalIsolation()')
  assert pg.locator('#board').evaluate('(el)=>el.inert')
  pg.evaluate('''async value => {
   window.showOpenFilePicker=async()=>[{getFile:async()=>new File([JSON.stringify(value)],'test.json')}];
   await openDataFile();
  }''',data)
  expect(pg.locator('#schemaBootError')).to_be_hidden()
  expect(pg.locator('.task')).to_have_count(2)
  ctx.close()

 ctx,pg,_=fresh(data)
 # Keyboard activation of a badge is a filter, not title editing.
 badge=pg.get_by_role('button',name='Tags #: build',exact=True)
 badge.focus();badge.press('Enter')
 expect(pg.locator('.task')).to_have_count(1)
 pg.locator('#clearFiltersButton').click()
 card=pg.locator('.task[data-id="1"]')
 height=card.bounding_box()['height'];card.hover()
 assert abs(card.bounding_box()['height']-height)<.5
 card.locator('.comment-preview').click()
 expect(pg.locator('#taskCommentText')).to_be_focused()
 pg.locator('#taskTitleInput').fill('Edited @Ир')
 expect(pg.locator('#markerSuggestions')).to_be_visible()
 pg.locator('#taskTitleInput').press('Enter')
 expect(pg.locator('#taskTitleInput')).to_have_value('Edited @Ирина ')
 pg.locator('#taskCommentText').fill('Updated comment')
 pg.locator('#taskCommentText').press('Control+Enter')
 expect(pg.locator('.task[data-id="1"] .comment-preview')).to_have_text('Updated comment')
 # The title/comment handoff saves title changes before opening the editor.
 title=pg.locator('.task[data-id="2"] .task-text')
 title.click();title.fill('Shift test #work');title.press('Shift+Enter')
 expect(pg.locator('#taskCommentText')).to_be_focused()
 expect(pg.locator('#taskTitleInput')).to_have_value('Shift test #work')
 pg.get_by_role('button',name='Close task editor',exact=True).click()
 ctx.close()

 responsive_data=json.loads(json.dumps(data))
 responsive_data['__dimensions__'].append('+')
 responsive_data['__dimensionColors__']['+']=190
 for width,height in [(1024,1000),(736,1000),(390,844),(320,568)]:
  ctx,pg,_=fresh(responsive_data,width,touch=width<800,height=height)
  pg.evaluate('state.__inbox__[0].text="!⭐ !🔥 Long first-line task with wrapping text #build @Ирина";state.__inbox__[0].lastEditedByAgent=true;render()')
  assert_first_line_alignment(pg,width)
  if width<800:
   card=pg.locator('.task[data-id="1"]')
   expect(card.locator('.task-menu-trigger')).to_be_visible()
   button_rect=card.locator('.task-menu-trigger').bounding_box()
   assert button_rect['width']>=44 and button_rect['height']>=44,button_rect
   assert card.locator('.task-action-drawer').evaluate('(el)=>getComputedStyle(el).opacity')=='1'
   positions=card.evaluate('''el=>{
    const content=el.querySelector('.task-content'),r=content.getBoundingClientRect(),a=el.querySelector('.task-action-drawer').getBoundingClientRect();
    return {right:r.right-parseFloat(getComputedStyle(content).paddingRight),left:a.left};
   }''')
   assert positions['right']<=positions['left']+1,positions
   touch_title=card.locator('.task-text')
   touch_title.tap();touch_title.fill('Touch @Ир')
   pg.locator('#markerSuggestions [role="option"]').first.tap()
   expect(touch_title).to_be_focused()
   touch_title.type('tail');touch_title.press('Enter')
   assert pg.evaluate("JSON.parse(localStorage.getItem('chronos-planner-v2')).__inbox__[0].text")=='Touch @Ирина tail'
   card.locator('.task-menu-trigger').click()
   pg.locator('#menu [data-comment]').click()
   expect(pg.locator('#taskCommentText')).to_be_focused()
   pg.get_by_role('button',name='Close task editor',exact=True).click()
  if not pg.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'):
   pg.screenshot(path=str(Path(temporary)/'dimensions-overflow.png'),full_page=True)
   print('Overflow',width,pg.evaluate('''()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.body.children].map(el=>({name:el.id||el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))})'''))
  assert pg.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),width
  pg.locator('[data-action="search"]').click()
  pg.evaluate('''()=>{
   const task=state.__inbox__[0];
   task.text+=' #averylongdimensionvalueforresponsiveheaderinspection';
   render();
   setTaskMarkerFilter('#','#averylongdimensionvalueforresponsiveheaderinspection');
  }''')
  assert pg.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),('long selected filter',width)
  def assert_popup_bounds():
   bounds=pg.locator('.task-marker-filter-popover.open').bounding_box()
   assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1,(width,bounds)
   assert pg.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),('open filter overflow',width)
  for attempt in range(3):
   pg.locator('.task-marker-filter-trigger').first.click()
   assert_popup_bounds()
   expect(pg.locator('.task-marker-filter-selected').first).to_have_text('#averylongdimensionvalueforresponsiveheaderinspection')
   expect(pg.locator('.task-marker-filter-selected').first).to_have_attribute('title', 'Selected: #averylongdimensionvalueforresponsiveheaderinspection')
   clear=pg.get_by_role('button',name='Clear filter #',exact=True)
   rect=clear.bounding_box()
   assert rect['x']>=0 and rect['x']+rect['width']<=width+1,('clear filter clipped',width,rect)
   assert rect['width']>=(44 if pg.evaluate('matchMedia("(pointer: coarse)").matches') else 32),('clear filter too small',width,rect)
   expect(pg.locator('.task-marker-filter-trigger').first).to_have_text('#')
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
   assert_popup_bounds()
   pg.evaluate('Promise.allSettled(document.querySelector(".search-control").getAnimations({subtree:true}).map(animation=>animation.finished))')
   assert_popup_bounds()
   pg.keyboard.press('Escape')
  pg.locator('.task-marker-filter-trigger').first.click()
  pg.locator('#dimensionManagerToggle').click()
  expect(pg.locator('.task-marker-filter-popover.open')).to_have_count(0)
  manager=pg.locator('#dimensionManagerPopover')
  expect(manager.locator('.dimension-help')).to_have_count(0)
  bounds=manager.bounding_box()
  maximum=190 if pg.evaluate('matchMedia("(pointer: coarse)").matches') else 180
  assert bounds['width']<=maximum+1,('manager too wide',width,bounds)
  assert pg.locator('#addDimensionForm button').bounding_box()['width']<bounds['width']*.6,('add button too wide',width)
  assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1,('manager horizontal',width,bounds)
  assert bounds['y']>=0 and bounds['y']+bounds['height']<=height+1,('manager vertical',width,bounds)
  assert pg.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),('manager overflow',width)
  row=pg.locator('#dimensionColors .dimension-color-row').first
  symbol=row.locator('.dimension-symbol').bounding_box()
  color=row.locator('.dimension-color-trigger').bounding_box()
  left_gap=color['x']-(symbol['x']+symbol['width'])
  remove=row.locator('.dimension-remove').bounding_box()
  right_gap=remove['x']-(color['x']+color['width'])
  assert min(left_gap,right_gap)>=15 and abs(left_gap-right_gap)<=1,('dimension spacing must be balanced',width,left_gap,right_gap)
  assert abs(remove['x']+remove['width']-(row.bounding_box()['x']+row.bounding_box()['width']))<=1,('dimension disable right edge',width)
  add_button=pg.locator('#addDimensionForm button').bounding_box()
  add_input=pg.locator('#newDimensionSymbol').bounding_box()
  assert abs((add_input['x']-bounds['x'])-(bounds['x']+bounds['width']-add_button['x']-add_button['width']))<=1,('dimension form side padding',width)
  expect(pg.locator('#addDimensionForm button')).to_have_text('+')
  expect(row.locator('.dimension-remove svg')).to_have_count(1)
  if pg.evaluate('matchMedia("(pointer: coarse)").matches'):
   assert remove['width']>=44 and remove['height']>=44,('dimension disable touch target',width,remove)
  pg.locator('#dimensionColors .dimension-color-trigger').first.click()
  palette=row.locator('.dimension-palette')
  expect(palette).to_be_visible()
  expect(palette.locator('.dimension-swatch')).to_have_count(18)
  assert palette.evaluate('el=>el.scrollWidth<=el.clientWidth'),('palette horizontal overflow',width)
  last=palette.locator('.dimension-swatch').last
  last.scroll_into_view_if_needed()
  last.click()
  expect(last).to_have_attribute('aria-pressed','true')
  expect(palette).to_be_hidden()
  for control in [pg.locator('#newDimensionSymbol'),pg.locator('#addDimensionForm button')]:
   control.scroll_into_view_if_needed()
   position=control.bounding_box()
   assert position['y']>=0 and position['y']+position['height']<=height+1,('manager add control clipped',width,position)
  pg.locator('.task-marker-filter-trigger').first.click()
  expect(manager).to_be_hidden()
  pg.keyboard.press('Escape')
  pg.evaluate('clearAllFilters();openExpandedColumn("__inbox__")')
  add=pg.locator('.expanded-column .quick-task-add')
  add.scroll_into_view_if_needed()
  position=add.bounding_box()
  assert position['y']+position['height']<=height+1,('expanded add control clipped',width,position)
  ctx.close()

 # Render all theme/scheme/hue combinations and measure actual computed colors.
 ctx,pg,_=fresh(data)
 pg.evaluate('state.__inbox__[0].text="!⭐ !🔥 Long first-line task with wrapping text #build @Ирина";state.__inbox__[0].lastEditedByAgent=true;render()')
 contrast=[]
 presets=pg.evaluate('DIMENSION_COLOR_PRESETS')
 colors_before=pg.evaluate('JSON.stringify(state.__dimensionColors__)')
 theme_colors=set()
 surfaces=[]
 primary=pg.locator('.column[data-key="__inbox__"] .new-task-panel .btn-primary')
 themes=sorted((root/'chronos-2.0/themes').glob('*.css'))
 for theme in themes:
  style=pg.add_style_tag(content=theme.read_text(encoding='utf-8'))
  for scheme in ['light','dark']:
   pg.evaluate('scheme=>document.documentElement.dataset.theme=scheme',scheme)
   if theme.name=='focus.css':
    pg.wait_for_function('''() => ['body','.app-header','.task','.modal','.context-menu'].every(selector=>{
     const style=getComputedStyle(document.querySelector(selector));
     return style.backgroundImage==='none' && style.boxShadow==='none' && style.backdropFilter==='none';
    })''')
   pg.evaluate('openNewTask(INBOX,true)')
   pg.mouse.move(1,1)
   surfaces.append((surface_contrast(primary,'.btn-primary'),4.5,theme.name,scheme,'primary'))
   primary.hover()
   surfaces.append((surface_contrast(primary,'.btn-primary'),4.5,theme.name,scheme,'primary hover'))
   # This is a product visibility minimum, not a WCAG requirement for logotypes.
   wordmark=pg.locator('.brand-wordmark')
   brand_ratio=gradient_wordmark_contrast(wordmark) if theme.name=='aurora.css' else surface_contrast(wordmark,'.app-header')
   surfaces.append((brand_ratio,3,theme.name,scheme,'brand'))
   for hue in presets:
    ratio=pg.evaluate('''({scheme,hue})=>{
     document.documentElement.dataset.theme=scheme;
     const el=document.querySelector('.task-marker');el.style.setProperty('--marker-hue',hue);
     const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');
     function rgba(color){ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];}
     function over(a,b){const alpha=a[3]/255;return a.slice(0,3).map((v,i)=>v*alpha+b[i]*(1-alpha)).concat(255);}
     function l(a){const v=a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];}
     const css=getComputedStyle(el),card=rgba(getComputedStyle(el.closest('.task')).backgroundColor);
     const base=over(card,scheme==='light'?[255,255,255,255]:[0,0,0,255]);
     const bg=over(rgba(css.backgroundColor),base),fg=over(rgba(css.color),bg),x=l(fg),y=l(bg);
     return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
    }''',{'scheme':scheme,'hue':hue})
    contrast.append((ratio,theme.name,scheme,hue))
   theme_colors.add(pg.locator('.task-marker').first.evaluate('el=>getComputedStyle(el).color'))
   assert pg.evaluate('JSON.stringify(state.__dimensionColors__)')==colors_before
   assert_first_line_alignment(pg,(theme.name,scheme))
   pg.set_viewport_size({'width':390,'height':844})
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
   assert_first_line_alignment(pg,(theme.name,scheme,'mobile'))
   pg.set_viewport_size({'width':1200,'height':1000})
   pg.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  style.evaluate('(el)=>el.remove()')
 worst=min(contrast)
 if worst[0]<4.5:
  failed={}
  for ratio,theme,scheme,hue in contrast:
   if ratio<4.5: failed[(theme,scheme)]=min(ratio,failed.get((theme,scheme),99))
  print('Contrast below 4.5:',failed)
 assert worst[0]>=4.5,worst
 assert not [row for row in surfaces if row[0]<row[1]], ('Theme surface contrast', [row for row in surfaces if row[0]<row[1]])
 print('PASS: %s theme surface checks; primary minimum %.2f; brand visibility minimum %.2f' %
       (len(surfaces),min(row[0] for row in surfaces if row[1]==4.5),min(row[0] for row in surfaces if row[1]==3)))
 assert len(theme_colors)>2,'Marker presentation must adapt to the theme and scheme'
 assert not errors,errors
 print(('PASS: isolated browser flows; %s themes x 2 schemes x %s hues; minimum text contrast ' % (len(themes),len(presets))) + ('%.2f (%s, %s, %s)'%worst))
 ctx.close()
 browser.close()

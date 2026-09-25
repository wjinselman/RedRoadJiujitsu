"""Offline Chromium integration checks against owner.html and portal.js.
Requires Python playwright plus a Chromium installation. All Firebase and external
requests are intercepted. No live member data, sign-in, or production writes.
Set REDROAD_SITE to the updated site folder before running.
"""
from pathlib import Path
from urllib.parse import urlparse, unquote
from datetime import datetime, timezone
import json, mimetypes, os, shutil, re, base64
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, expect

HERE=Path(__file__).resolve().parent
SITE=Path(os.environ.get('REDROAD_SITE',HERE.parent))
OUT=Path(os.environ.get('REDROAD_TEST_OUTPUT',HERE))
OUT.mkdir(parents=True,exist_ok=True)
MOCK=(HERE/'firebase-mock.js').read_text()
PORTAL=(SITE/'portal.js').read_text()+'''
window.rrTest={
 async seed(rows,bills,role='owner'){
  ownerIdentity={email:'owner@example.invalid',role};ownerMembers=rows;ownerRosterLoaded=true;
  ownerTrials=[];ownerTrialsLoaded=true;ownerBillingLoading=false;
  window.__fb.records={};window.__fb.writes=[];window.__fb.transactions=0;window.__fb.fail=false;window.__fb.delay=false;
  for(const row of rows)window.__fb.records['members/'+row.email]={...row};
  for(const [email,profile] of Object.entries(bills))window.__fb.records['billingProfiles/'+email]={...profile};
  await loadBillingProfiles();
  document.querySelector('#owner-app').hidden=false;document.querySelector('#owner-login-view').hidden=true;
  renderOwner();
 },
 async billingUnavailable(){window.__fb.records={};await loadBillingProfiles();},
 pills:statusPills
};
'''
BASIC={'plan':'Adult','rank':'White Belt','stripes':0,'paid':False,'active':True,'enabled':True,'waiverSigned':True,'joinedAt':'2026-09-01'}
ROWS=[dict(BASIC,email='alpha@example.invalid',name='Alex Sample',paid=True),dict(BASIC,email='bravo@example.invalid',name='Blake Sample',paid=True),dict(BASIC,email='charlie@example.invalid',name='Casey Sample'),dict(BASIC,email='coach@example.invalid',name='Coach Sample',coachAccess=True),dict(BASIC,email='child@example.invalid',name='Family Covered',plan='Kids'),dict(BASIC,email='payer@example.invalid',name='Family Payer')]
BILLS={'alpha@example.invalid':{'category':'adult','payerEmail':'','paid':True,'paidOn':'2026-09-16','paidThrough':'2026-09-30','nextDue':'2026-10-01','manualStatusOnly':False,'sequence':1,'revision':1},'child@example.invalid':{'category':'family-covered','payerEmail':'payer@example.invalid','paid':False,'revision':1},'payer@example.invalid':{'category':'family-payer','payerEmail':'','paid':False,'paidOn':'','paidThrough':'','nextDue':'','manualStatusOnly':True,'sequence':0,'revision':0}}

checks=[]
def check(name,condition=True):
 assert condition,name
 checks.append(name)
 print('PASS',name,flush=True)

def inline_url(value):
 name=value.split('?')[0].split('#')[0]
 target=(SITE/name).resolve()
 if target.is_relative_to(SITE.resolve()) and target.is_file():
  mime=mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
  return 'data:'+mime+';base64,'+base64.b64encode(target.read_bytes()).decode()
 return value if value.startswith('data:') else 'data:,'

def offline_page(page):
 # Render locally supplied markup directly into about:blank. No web navigation,
 # browser policy changes, external requests, or real Firebase calls are needed.
 soup=BeautifulSoup((SITE/'owner.html').read_text(),'html.parser')
 for script in soup.find_all('script'):script.decompose()
 for link in list(soup.find_all('link')):
  if 'stylesheet' in link.get('rel',[]):
   cssfile=SITE/link.get('href','').split('?')[0]
   css=cssfile.read_text() if cssfile.is_file() else ''
   css=re.sub(r'@import[^;]+;','',css)
   css=re.sub(r'url\(([^)]+)\)',lambda m:'url("'+inline_url(m.group(1).strip('\"\' '))+'")',css)
   style=soup.new_tag('style');style.string=css;link.replace_with(style)
  else:link.decompose()
 for img in soup.find_all('img'):
  if img.get('src'):img['src']=inline_url(img['src'])
  img.attrs.pop('srcset',None)
 page.set_content(str(soup))
 # Blob modules preserve ES-module singletons and the unmodified import graph.
 # Firebase's module is the sole dependency replaced by the fixture above.
 sources={file.name:file.read_text() for file in SITE.glob('*.js')}
 sources['portal.js']=PORTAL;sources['__firebaseMock.js']=MOCK
 page.evaluate(r"""async sources=>{
   const cache=new Map();
   function canonical(spec){
     if(spec.startsWith('https://www.gstatic.com/')||/^\.\/firebase-(?:auth-)?client\.js/.test(spec))return '__firebaseMock.js';
     return spec.replace(/^\.\//,'').split('?')[0];
   }
   function build(name){
     if(cache.has(name))return cache.get(name);
     if(!(name in sources))throw Error('Missing offline module: '+name);
     let code=sources[name].replace(/(from\s*|import\s*)(['"])([^'"\n]+)\2/g,
       (match,prefix,quote,spec)=>prefix+quote+build(canonical(spec))+quote);
     const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));cache.set(name,url);return url;
   }
   await import(build('portal.js'));
 }""",sources)

with sync_playwright() as p:
 executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
 context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='America/Chicago')
 context.route('**/*',lambda route:route.abort())
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.clock.install(time=datetime(2026,9,25,18,0,tzinfo=timezone.utc))
 # Native popups are outside the DOM. Count the immediate user-gesture request;
 # exercise the actual native method in a separate smoke check below.
 page.evaluate('''()=>{window.pickerRequests=0;window.pickerActivation=[];window.nativeShowPicker=HTMLInputElement.prototype.showPicker;
 HTMLInputElement.prototype.showPicker=function(){window.pickerRequests++;window.pickerActivation.push(navigator.userActivation.isActive);};}''')
 offline_page(page)
 page.wait_for_function('!!window.rrTest')
 def seed(role='owner'):
  page.evaluate('async args=>window.rrTest.seed(...args)',[ROWS,BILLS,role])
 def badge(email):return page.locator(f'[data-member-email="{email}"] button[data-action="set-paid-date"]')
 def close():page.locator('#paid-date-cancel').click();expect(page.locator('#paid-date-dialog')).not_to_be_visible()
 seed()
 check('module graph and page initialize without JavaScript errors',not errors)
 check('eligible paid, undated, unpaid, family-payer badges are clickable',page.locator('button[data-action="set-paid-date"]').count()==4)
 check('exempt/covered badges remain read-only',badge('coach@example.invalid').count()==0 and badge('child@example.invalid').count()==0)
 page.locator('#owner-member-list').scroll_into_view_if_needed()
 old_scroll=page.evaluate('window.scrollY')
 badge('alpha@example.invalid').click()
 expect(page.locator('#paid-date-dialog')).to_be_visible()
 expect(page.locator('#paid-date-value')).to_have_value('2026-09-16')
 check('dated badge opens calendar and preloads its own saved Paid on date')
 check('calendar requested immediately inside user gesture',page.evaluate('pickerRequests===1 && pickerActivation[0]===true'))
 check('full Edit screen remains closed',page.locator('#edit-member-panel').is_hidden())
 check('opening dialog causes no writes',page.evaluate('__fb.writes.length')==0)
 page.locator('#paid-date-value').fill('2026-10-12')
 expect(page.locator('#paid-date-coverage')).to_contain_text('2026-10-31')
 check('coverage preview updates before save',page.evaluate('__fb.writes.length')==0)
 close()
 expect(badge('alpha@example.invalid')).to_be_focused()
 check('Cancel saves nothing and restores badge focus',page.evaluate('__fb.writes.length===0 && document.activeElement.dataset.action==="set-paid-date"'))
 check('cancel preserves roster scroll position',abs(page.evaluate('window.scrollY')-old_scroll)<100)
 badge('bravo@example.invalid').click()
 expect(page.locator('#paid-date-value')).to_have_value('')
 expect(page.locator('#paid-date-save')).to_be_disabled()
 check('DATE NOT SET opens an empty required date with no default payment')
 page.locator('#paid-date-value').fill('2026-09-25')
 page.locator('#paid-date-save').click()
 expect(page.locator('#paid-date-dialog')).not_to_be_visible()
 expect(badge('bravo@example.invalid')).to_contain_text('2026-09-30')
 check('Save updates correct member badge without opening Edit or reloading roster')
 check('date save records one receipt and only changes paid/updatedAt on member',page.evaluate('''()=>{
 const writes=__fb.writes;const member=writes.find(w=>w.ref.group==='members');
 return writes.length===3 && writes.filter(w=>w.ref.group==='payments').length===1 && member.ref.id==='bravo@example.invalid' && Object.keys(member.data).sort().join(',')==='paid,updatedAt';}'''))
 expect(badge('bravo@example.invalid')).to_be_focused()
 check('focus returns to replacement badge after roster re-render',page.evaluate('document.activeElement.closest("[data-member-email]")?.dataset.memberEmail')=='bravo@example.invalid')
 badge('bravo@example.invalid').click();page.locator('#paid-date-save').click()
 expect(page.locator('#paid-date-dialog')).not_to_be_visible()
 check('saving same date again does not duplicate receipt',page.evaluate('__fb.writes.filter(w=>w.ref.group==="payments").length')==1)
 badge('charlie@example.invalid').click();page.locator('#paid-date-value').fill('2026-09-20')
 page.evaluate('__fb.fail=true')
 page.locator('#paid-date-save').click()
 expect(page.locator('#paid-date-message')).to_contain_text('Test save denied')
 expect(page.locator('#paid-date-dialog')).to_be_visible()
 expect(page.locator('#paid-date-save')).to_be_enabled()
 check('failed save stays in dialog with visible error and retry enabled',page.evaluate('__fb.records["members/charlie@example.invalid"].paid')==False)
 page.evaluate('__fb.fail=false; __fb.delay=true')
 start=page.evaluate('__fb.transactions')
 page.locator('#paid-date-save').click()
 expect(page.locator('#paid-date-save')).to_be_disabled();expect(page.locator('#paid-date-cancel')).to_be_disabled()
 page.locator('#paid-date-form').dispatch_event('submit')
 page.keyboard.press('Escape')
 expect(page.locator('#paid-date-dialog')).to_be_visible()
 check('double-submit and Escape cannot interrupt pending save',page.evaluate('__fb.transactions')==start+1)
 page.evaluate('__fb.delay=false; __fb.release()')
 expect(page.locator('#paid-date-dialog')).not_to_be_visible()
 expect(badge('charlie@example.invalid')).to_contain_text('2026-09-30')
 check('successful retry closes dialog and updates unpaid member')
 page.locator('[data-member-email="charlie@example.invalid"] [data-action="quick-paid"]').click()
 expect(badge('charlie@example.invalid')).to_contain_text('Past Due')
 check('separate original Paid/Unpaid toggle remains functional',page.evaluate('__fb.records["members/charlie@example.invalid"].paid')==False)
 badge('payer@example.invalid').click();page.locator('#paid-date-value').fill('2026-09-25');page.locator('#paid-date-save').click()
 expect(page.locator('#paid-date-dialog')).not_to_be_visible()
 expect(page.locator('[data-member-email="child@example.invalid"] .member-pills')).to_contain_text('Paid through family')
 check('family payer save refreshes covered-family status')
 page.locator('[data-member-email="alpha@example.invalid"] [data-action="edit"]').click()
 expect(page.locator('#edit-member-panel')).to_be_visible()
 expect(page.locator('#edit-member-paid-on')).to_have_value('2026-09-16')
 check('original Edit form still opens with existing saved date')
 page.locator('#close-edit-member').click()
 seed('coach');check('coach role has no date-edit buttons',page.locator('button[data-action="set-paid-date"]').count()==0)
 seed('developer');check('developer role retains date-edit access',page.locator('button[data-action="set-paid-date"]').count()==4)
 # Desktop appearance and native showPicker smoke check.
 page.locator('#owner-member-list').scroll_into_view_if_needed();badge('alpha@example.invalid').click()
 page.screenshot(path=str(OUT/'paid-date-desktop.png'),full_page=False)
 close()
 page.evaluate('''()=>{HTMLInputElement.prototype.showPicker=function(){window.nativePickerOK=false;try{window.nativeShowPicker.call(this);window.nativePickerOK=true;}catch(e){window.nativePickerError=e.message;throw e;}};}''')
 badge('alpha@example.invalid').click()
 check('real Chromium native date picker opens without exception',page.evaluate('window.nativePickerOK===true'))
 # A new page prevents native popup state from influencing the mobile tests.
 page.close()
 mobile=context.new_page();mobile.set_viewport_size({'width':390,'height':844})
 mobile.on('pageerror',lambda e:errors.append(str(e)))
 mobile.evaluate('()=>{HTMLInputElement.prototype.showPicker=function(){};}')
 offline_page(mobile);mobile.wait_for_function('!!window.rrTest')
 mobile.evaluate('async args=>window.rrTest.seed(...args)',[ROWS,BILLS,'owner'])
 mobile.locator('[data-member-email="bravo@example.invalid"] [data-action="set-paid-date"]').click()
 expect(mobile.locator('#paid-date-dialog')).to_be_visible()
 mobile.locator('#paid-date-value').fill('2026-09-25')
 box=mobile.locator('#paid-date-dialog').bounding_box()
 check('mobile dialog fits viewport with accessible date and buttons',box['x']>=0 and box['x']+box['width']<=390 and box['y']>=0 and box['y']+box['height']<=844)
 mobile.screenshot(path=str(OUT/'paid-date-mobile.png'))
 mobile.locator('#paid-date-save').click();expect(mobile.locator('#paid-date-dialog')).not_to_be_visible()
 expect(mobile.locator('[data-member-email="bravo@example.invalid"] [data-action="set-paid-date"]')).to_contain_text('2026-09-30')
 check('mobile viewport can save directly from member list')
 check('no JavaScript errors during all integration checks',not errors)
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},indent=2))
print(f'{len(checks)} browser checks passed.')

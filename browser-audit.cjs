const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.REDROAD_TEST_OUTPUT||path.join(__dirname,'results'));fs.mkdirSync(out,{recursive:true});
const mock=fs.readFileSync(path.join(root,'tests/firebase-mock.js'),'utf8').replace("{email:'owner@example.invalid',emailVerified:true}","null").replace('export const onAuthStateChanged=()=>()=>{};',"export const onAuthStateChanged=(_,cb)=>{queueMicrotask(()=>cb(auth.currentUser));return ()=>{};};");
(async()=>{const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let checks=0;const results=[];
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='www.gstatic.com'||/^\/firebase-(client|auth-client|kiosk-client)\.js$/.test(url.pathname))return route.fulfill({contentType:'application/javascript',body:mock});
   if(url.hostname!=='redroad.test')return route.fulfill({status:200,body:''});
   const file=path.join(root,decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Missing'});
   const ext=path.extname(file),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml','.pdf':'application/pdf'}[ext]||'application/octet-stream';
   return route.fulfill({contentType:mime,body:fs.readFileSync(file)});
  });
  for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.html')&&x!=='admin-demo.html')){
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://redroad.test/'+file);await page.waitForTimeout(100);
   const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,title:document.title}));
   results.push({file,width,errors,overflow:layout.scroll-layout.width});assert.equal(errors.length,0,file+' '+errors.join(';'));assert.ok(layout.scroll<=layout.width+2,`${file} ${width}: overflow ${layout.scroll-layout.width}`);checks+=2;
   if(file==='owner.html'){
    await page.evaluate(()=>{document.querySelector('#owner-app').hidden=false;document.querySelector('#owner-login-view').hidden=true;RRDiagnostics.showAdmin(true);});
    await page.locator('#diagnostics-card').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'dashboard-'+width+'.png'),fullPage:false});
    assert.equal(await page.locator('#diagnostics-card').isVisible(),true);checks++;
   }
   await page.close();
  }
  await context.close();
 }
}finally{await browser.close();fs.writeFileSync(path.join(out,'browser-audit.json'),JSON.stringify({checks,results},null,2));}
console.log('Browser checks passed:',checks);
})().catch(e=>{console.error(e);process.exitCode=1;});

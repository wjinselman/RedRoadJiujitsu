const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../family-admin.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
async function setup({fail=false,role='owner'}={}){
 const dom=new JSDOM('<a id="staff-family-link" href="#staff-family">Families</a><section id="staff-family"></section>',{url:'https://test.invalid/owner.html',runScripts:'outside-only'});
 const w=dom.window, calls=[];
 const children=[{id:'a',name:'Alex Sample',guardianEmail:' PARENT@example.invalid ',status:'active',rank:'White',stripes:0},{id:'b',name:'Blair Sample',guardianEmail:'parent@example.invalid',status:'active',rank:'Grey',stripes:1}];
 const members=[{id:'parent@example.invalid',name:'Parent Sample'},{id:'other@example.invalid',name:'Other Parent'}];
 const auth={currentUser:{uid:'owner'}};
 const exports={auth,db:{},collection:(_,name)=>name,query:name=>name,limit:()=>{},startAfter:()=>{},getDocsFromServer:async name=>{if(fail)throw Error();return {docs:(name==='children'?children:members).map(c=>({id:c.id,data:()=>c}))};},doc:(_,collection,id)=>({collection,id}),getDocFromServer:async ref=>{calls.push({waiver:ref.id});return {exists:()=>true,data:()=>({})};},approveChild:async(child,payload)=>{calls.push({id:child.id,payload});Object.assign(children.find(c=>c.id===child.id),payload,{guardianEmail:payload.parentEmail});},attachWaiverPrint:(_,node)=>node.textContent='Test waiver'};
 const context=dom.getInternalVMContext();const mock=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});const module=new vm.SourceTextModule(source,{context});await module.link(()=>mock);await module.evaluate();await module.namespace.showFamilyAdmin({role});return {dom,w,d:w.document,api:module.namespace,calls,auth};
}

test('siblings group by normalized guardian; section, family and editor collapse independently',async()=>{
 const e=await setup(),d=e.d;assert.equal(d.querySelectorAll('.family-group').length,1);assert.equal(d.querySelectorAll('.family-child-row').length,2);assert.equal(d.querySelector('.family-parent strong').textContent,'Parent Sample');
 const panel=d.querySelector('.family-panel');assert.equal(panel.open,false);d.querySelector('#staff-family-link').click();assert.equal(panel.open,true);
 const group=d.querySelector('.family-group');group.querySelector('summary').click();assert.equal(group.open,false);group.querySelector('summary').click();assert.equal(group.open,true);
 const editor=d.querySelector('.family-child-editor');assert.equal(editor.open,false);editor.querySelector('summary').click();assert.equal(editor.open,true);panel.querySelector('summary').click();assert.equal(panel.open,false);assert.equal(e.calls.length,0);e.dom.window.close();
});
test('saving moves one child to its new family and preserves sibling drafts',async()=>{
 const e=await setup(),d=e.d;d.querySelector('#staff-family-link').click();
 const forms=[...d.querySelectorAll('form')];const sibling=forms[1].elements.namedItem('rank');sibling.value='Yellow';sibling.dispatchEvent(new e.w.Event('input',{bubbles:true}));
 const payer=forms[0].elements.namedItem('parentEmail');payer.value='other@example.invalid';payer.dispatchEvent(new e.w.Event('change',{bubbles:true}));forms[0].dispatchEvent(new e.w.Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(e.calls.length,1);assert.equal(e.calls[0].id,'a');assert.equal(e.calls[0].payload.parentEmail,'other@example.invalid');assert.equal(d.querySelectorAll('.family-group').length,2);assert.equal(d.querySelector('form[data-child-id="b"] [name=rank]').value,'Yellow');assert.equal(d.querySelector('.family-panel').open,true);assert.match(d.body.textContent,/Changes saved/);e.dom.window.close();
});
test('waivers target child IDs and disallowed roles clear the directory',async()=>{const e=await setup();e.d.querySelector('.family-child-actions>button').click();await tick();assert.equal(e.calls[0].waiver,'a');await e.api.showFamilyAdmin({role:'coach'});assert.equal(e.d.querySelector('#staff-family').hidden,true);assert.equal(e.d.querySelectorAll('.family-child-row').length,0);e.dom.window.close();});
test('load failure shows retry and no fabricated family',async()=>{const e=await setup({fail:true});assert.equal(e.d.querySelectorAll('.family-group').length,0);assert.match(e.d.querySelector('[role=status]').textContent,/could not load/);e.dom.window.close();});


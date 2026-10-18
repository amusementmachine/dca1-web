import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile('public/index.html','utf8');
const code=(await readFile('public/app.js','utf8')).replace(/import\('https:[^']+'\)/g,'Promise.resolve(window.__sdk)');
async function setup(){
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test'}); const w=dom.window;
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({}, {get:()=>()=>{},set:()=>true});
 let authCallback; const listeners=new Map(); const auth={currentUser:null};
 const state={allowed:true,pending:null};
 w.fetch=async()=>({ok:true,json:async()=>({projectId:'demo-dca1'})});
 w.__sdk={initializeApp:x=>x,getAuth:()=>auth,getFirestore:()=>({}),GoogleAuthProvider:class{},signInWithPopup:async()=>{},signOut:async()=>authCallback(null),onAuthStateChanged:(_,f)=>{authCallback=f;},doc:(_,a,b)=>`${a}/${b}`,collection:(_,a)=>a,query:a=>a,orderBy:()=>{},limit:()=>{},getDoc:async()=>{if(state.pending)await state.pending; return {exists:()=>state.allowed};},onSnapshot:(ref,ok,error)=>{listeners.set(ref,{ok,error});return()=>listeners.delete(ref);}};
 await w.eval(code); return {dom,w,state,listeners,login:async(uid='owner')=>{auth.currentUser=uid?{uid,email:'owner@example.test'}:null;await authCallback(auth.currentUser);},$:id=>w.document.getElementById(id)};
}
test('renders current, safe text, history and narratives; clears on signout',async()=>{
 const h=await setup();await h.login();assert.equal(h.$('app').hidden,false);
 h.listeners.get('dashboard/current').ok({exists:()=>true,data:()=>({updated_at:new Date().toISOString(),portfolio:{available_usd:100},wave:{score:24,phase:1},current_thinking:{headline:'Market view'},assistant_response:'<img src=x onerror=alert(1)>',direction:['Observe']}),metadata:{fromCache:false}});
 assert(h.$('kpis').textContent.includes('$100.00'));assert(!h.$('kpis').textContent.includes('$0.00'));assert.equal(h.$('response').querySelector('img'),null);assert(h.$('thinking').textContent.includes('Market view'));
 h.listeners.get('iterations').ok({docs:[{id:'1',data:()=>({timestamp:'2026-10-18T16:00:00Z',wave:{score:24},assistant_response:'Saved response',insights:['Observed'],direction:['Wait']})},{id:'2',data:()=>({timestamp:'2026-10-17T16:00:00Z',wave:{score:null}})}]});
 assert.equal(h.$('iterationCount').textContent,'2');assert(h.$('journal').textContent.includes('Saved response'));assert.equal(h.$('historyTable').querySelectorAll('tr').length,2);
 await h.login(null);assert.equal(h.$('app').hidden,true);assert(!h.$('response').textContent.includes('onerror'));assert.equal(h.listeners.size,0);h.dom.window.close();
});
test('handles empty, denied and failed reads',async()=>{
 const h=await setup();await h.login();h.listeners.get('dashboard/current').ok({exists:()=>false});assert(h.$('status').textContent.includes('waiting'));
 h.listeners.get('iterations').ok({docs:[]});assert(h.$('journal').textContent.includes('No mirrored'));
 h.listeners.get('dashboard/current').error({code:'unavailable',message:'Offline'});assert.equal(h.$('retry').hidden,false);
 h.listeners.get('dashboard/current').error({code:'permission-denied',message:'Denied'});assert.equal(h.$('app').hidden,true);assert.equal(h.listeners.size,0);
 h.state.allowed=false;await h.login('other');assert(h.$('gateMessage').textContent.includes('other'));h.dom.window.close();
});
test('signout invalidates a pending authorization check',async()=>{
 const h=await setup();let resolve;h.state.pending=new Promise(r=>resolve=r);const pending=h.login();await h.login(null);resolve();await pending;assert.equal(h.$('app').hidden,true);assert.equal(h.listeners.size,0);h.dom.window.close();
});
test('startup failure produces an actionable state',async()=>{
 const dom=new JSDOM(html,{runScripts:'outside-only'});dom.window.__sdk={};await dom.window.eval(code);assert(dom.window.document.getElementById('status').textContent.includes('could not connect'));dom.window.close();
});

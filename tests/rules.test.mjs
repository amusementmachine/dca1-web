import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,collection,query,orderBy,limit,getDocs,deleteDoc} from 'firebase/firestore';
test('only allowlisted users read dashboard; clients cannot write or self-authorize',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-dca1',firestore:{rules:await readFile('firestore.rules','utf8'),host:'127.0.0.1',port:8180}});
 try {
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'access/owner'),{});await setDoc(doc(db,'dashboard/current'),{wave:{score:24}});await setDoc(doc(db,'iterations/one'),{timestamp:'2026-10-18T16:00:00Z'});});
 const owner=env.authenticatedContext('owner').firestore(); const other=env.authenticatedContext('other').firestore(); const anon=env.unauthenticatedContext().firestore();
 await assertSucceeds(getDoc(doc(owner,'dashboard/current')));await assertSucceeds(getDoc(doc(owner,'access/owner')));
 await assertSucceeds(getDocs(query(collection(owner,'iterations'),orderBy('timestamp','desc'),limit(200))));
 for(const db of [owner,other,anon]) {
  await assertFails(setDoc(doc(db,'dashboard/current'),{bad:true}));await assertFails(setDoc(doc(db,'iterations/new'),{}));await assertFails(setDoc(doc(db,'access/other'),{}));await assertFails(deleteDoc(doc(db,'access/owner')));await assertFails(getDoc(doc(db,'private/rules')));
 }
 for(const db of [other,anon])await assertFails(getDoc(doc(db,'dashboard/current')));
 await assertFails(getDoc(doc(other,'access/owner')));await assertFails(getDocs(collection(owner,'access')));
 await env.withSecurityRulesDisabled(c=>deleteDoc(doc(c.firestore(),'access/owner')));await assertFails(getDoc(doc(owner,'dashboard/current')));
 }finally{await env.cleanup();}
});


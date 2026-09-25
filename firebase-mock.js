// In-memory browser fixture. This file never authenticates or connects to Firebase.
export const state=window.__fb || (window.__fb={records:{},writes:[],reads:[],transactions:0,fail:false,delay:false});
export const firebaseConfigured=true,db={};
export const auth=window.__auth || (window.__auth={currentUser:{email:'owner@example.invalid',emailVerified:true}});
export const doc=(_,group,id)=>({group,id});
export const collection=(_,group)=>({group});
export const where=(...args)=>({where:args});
export const orderBy=(...args)=>({orderBy:args});
export const startAfter=doc=>({after:doc.id});
export const limit=n=>({limit:n});
export const query=(target,...constraints)=>({...target,constraints});
export const serverTimestamp=()=>({timestamp:true});
const snap=(id,data)=>({id,exists:()=>data!==undefined,data:()=>data});
export async function getDoc(ref){state.reads.push(ref);return snap(ref.id,state.records[ref.group+'/'+ref.id]);}
export const getDocFromServer=getDoc;
export async function getDocs(ref){
 state.reads.push(ref);
 let rows=Object.entries(state.records).filter(([key])=>key.startsWith(ref.group+'/')).map(([key,data])=>snap(key.slice(ref.group.length+1),data));
 const cap=ref.constraints?.find(c=>c.limit)?.limit||250;
 return {docs:rows.slice(0,cap)};
}
export const getDocsFromServer=getDocs;
export async function setDoc(ref,data,options){
 const key=ref.group+'/'+ref.id;state.records[key]=options?.merge?{...state.records[key],...data}:data;
 state.writes.push({ref,data,options});
}
export async function deleteDoc(ref){delete state.records[ref.group+'/'+ref.id];state.writes.push({delete:ref});}
export function writeBatch(){const pending=[];return {set:(ref,data,options)=>pending.push({ref,data,options}),delete:ref=>pending.push({delete:ref}),commit:async()=>{for(const item of pending){if(item.delete)await deleteDoc(item.delete);else await setDoc(item.ref,item.data,item.options);}}};}
export async function runTransaction(_,fn){
 state.transactions++;const pending=[];
 const result=await fn({get:getDoc,set:(ref,data,options)=>pending.push({ref,data,options}),delete:ref=>pending.push({delete:ref})});
 if(state.delay)await new Promise(resolve=>{state.release=resolve;});
 if(state.fail)throw Error('Test save denied. No payment was saved.');
 for(const item of pending){if(item.delete)await deleteDoc(item.delete);else await setDoc(item.ref,item.data,item.options);}
 return result;
}
export const documentId=()=> '__name__';
export const onAuthStateChanged=()=>()=>{};
export const signInWithEmailAndPassword=async()=>({user:auth.currentUser});
export const createUserWithEmailAndPassword=signInWithEmailAndPassword;
export const signInAnonymously=signInWithEmailAndPassword;
export const sendPasswordResetEmail=async()=>{};
export const sendEmailVerification=async()=>{};
export const updatePassword=async()=>{};
export const reauthenticateWithCredential=async()=>{};
export const EmailAuthProvider={credential:()=>({})};
export const signOut=async()=>{auth.currentUser=null;};
export const deleteUser=async()=>{};
export const isSignInWithEmailLink=()=>false;
export const signInWithEmailLink=signInWithEmailAndPassword;

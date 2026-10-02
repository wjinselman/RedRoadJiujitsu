/* Failure reporting uses its own Firebase Auth instance. It never signs a
   visitor into/out of the website or reads member, payment or waiver data. */
import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {getAuth,setPersistence,browserLocalPersistence,inMemoryPersistence,signInAnonymously} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {getFirestore,doc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {firebaseConfig,firebaseConfigured} from './firebase-config.js';
let ready;
export function getDiagnosticTransport(){
  if(!ready)ready=(async()=>{
    if(!firebaseConfigured)throw Error('Reporting is not configured');
    const name='redroad-diagnostics-only';
    const app=getApps().find(item=>item.name===name)||initializeApp(firebaseConfig,name);
    const auth=getAuth(app);
    try{await setPersistence(auth,browserLocalPersistence);}catch{await setPersistence(auth,inMemoryPersistence);}
    await auth.authStateReady();
    const user=auth.currentUser||(await signInAnonymously(auth)).user;
    if(!user.isAnonymous)throw Error('Unexpected reporting identity');
    return {uid:user.uid,sdk:{db:getFirestore(app),doc,setDoc,serverTimestamp}};
  })();
  return ready;
}

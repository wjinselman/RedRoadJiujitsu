(() => {
  const form = document.querySelector('#waiver-form');
  if (!form) return;
  const dob = document.querySelector('#dob');
  const minorFields = document.querySelector('#minor-fields');
  const guardianName = document.querySelector('#guardianName');
  const relationship = document.querySelector('#relationship');
  const signatureName = document.querySelector('#signatureName');
  const signaturePreview = document.querySelector('#signaturePreview');
  const signatureDate = document.querySelector('#signatureDate');
  const success = document.querySelector('#waiver-success');
  signatureDate.value = new Date().toISOString().slice(0,10);
  const params = new URLSearchParams(location.search);
  [['participantName','name'],['dob','dob'],['email','email'],['phone','phone']].forEach(([id,key])=>{ const el=document.getElementById(id); const v=params.get(key); if(el&&v) el.value=v; });

  function ageFromDob(value){
    if(!value) return null;
    const birth = new Date(value+'T12:00:00');
    const now = new Date();
    let age = now.getFullYear()-birth.getFullYear();
    const m=now.getMonth()-birth.getMonth();
    if(m<0 || (m===0 && now.getDate()<birth.getDate())) age--;
    return age;
  }
  function syncMinor(){
    const age=ageFromDob(dob.value); const minor=age!==null && age<18;
    minorFields.hidden=!minor;
    guardianName.required=minor; relationship.required=minor;
  }
  dob.addEventListener('change',syncMinor);
  syncMinor();
  signatureName.addEventListener('input',()=>{ signaturePreview.textContent=signatureName.value.trim()||'Your signature'; });

  function downloadReceipt(record){
    const text = JSON.stringify(record,null,2);
    const blob = new Blob([text],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`red-road-waiver-${record.receiptId}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  form.addEventListener('submit', e=>{
    e.preventDefault(); syncMinor();
    if(!form.reportValidity()) return;
    const fd=new FormData(form);
    const age=ageFromDob(fd.get('dob'));
    const signer=String(fd.get('signatureName')||'').trim();
    const participant=String(fd.get('participantName')||'').trim();
    if(age>=18 && signer.toLowerCase()!==participant.toLowerCase()){
      if(!confirm('The participant and signature names are different. Continue only if this is intentional.')) return;
    }
    const record={
      receiptId:`RR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
      waiverVersion:'Red Road Liability Waiver PDF supplied 2026-09-14',
      signedAt:new Date().toISOString(),
      participantName:participant,dob:fd.get('dob'),email:String(fd.get('email')||'').trim(),phone:String(fd.get('phone')||'').trim(),address:String(fd.get('address')||'').trim(),
      emergencyContact:{name:String(fd.get('emergencyName')||'').trim(),phone:String(fd.get('emergencyPhone')||'').trim()},
      minor:age<18,guardianName:String(fd.get('guardianName')||'').trim(),relationship:String(fd.get('relationship')||'').trim(),
      electronicSignature:signer,signatureDate:fd.get('signatureDate'),
      acknowledgments:{readAgreement:true,voluntary:true,electronicConsent:true}
    };
    localStorage.setItem('redroad:lastWaiver',JSON.stringify(record));
    success.hidden=false;
    success.innerHTML=`<strong>Waiver signed in test mode.</strong><br>Receipt ${record.receiptId} was created on this device. A copy will download now. Production still needs secure server-side storage before this should be treated as the academy's legal record.`;
    downloadReceipt(record);
    success.scrollIntoView({behavior:'smooth',block:'center'});
  });
})();

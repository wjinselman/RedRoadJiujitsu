(() => {
 const form=document.querySelector('#enroll-form'); if(!form) return;
 const params=new URLSearchParams(location.search); if(params.get('program')==='kids') document.querySelector('#program').value='Kids';
 form.addEventListener('submit',e=>{
   e.preventDefault(); if(!form.reportValidity()) return;
   const fd=new FormData(form); const record=Object.fromEntries(fd.entries()); record.createdAt=new Date().toISOString();
   localStorage.setItem('redroad:pendingEnrollment',JSON.stringify(record));
   const q=new URLSearchParams({name:record.name||'',dob:record.dob||'',email:record.email||'',phone:record.phone||''});
   location.href='waiver.html?'+q.toString();
 });
})();

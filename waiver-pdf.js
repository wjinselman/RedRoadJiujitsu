/* Creates a local printable packet from an already-authorized record.
   The supplied agreement is copied unchanged; the stored electronic signature
   is an explicitly labeled addendum, never a fabricated handwritten signature. */
export const AGREEMENT_VERSION = 'Red Road Liability Waiver PDF supplied 2026-09-14';
const AGREEMENT_SHA256 = '52beb56fddff42b277a41fa687623db9a14afffcc65a237b393c50e78958e864';

export async function buildWaiverPdf(record, agreementBytes, fontBytes, pdfLib, fontkit) {
  if (!record?.electronicSignature || !record?.receiptId) throw new Error('This record does not contain a signature and receipt ID. Ask staff to review it before printing.');
  if (record.waiverVersion !== AGREEMENT_VERSION) throw new Error('This signature references a different agreement version. Retrieve that original agreement before printing a combined packet.');
  const digest = await crypto.subtle.digest('SHA-256', agreementBytes);
  const checksum = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
  if (checksum !== AGREEMENT_SHA256) throw new Error('The agreement file does not match this release. Printing stopped so the wrong terms are not attached to a signed record.');
  const { PDFDocument, rgb } = pdfLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const textColor = rgb(.10,.12,.15), muted = rgb(.36,.39,.43), red = rgb(.68,.06,.10);
  const supported = new Set(font.getCharacterSet());
  const clean = value => {
    const result = String(value ?? 'Not recorded').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim() || 'Not recorded';
    if ([...result].some(char => !supported.has(char.codePointAt(0)))) throw new Error('This record contains characters the print font cannot reproduce. Keep the original record; do not substitute a spelling.');
    return result;
  };
  const wrap = (value, width, size=10) => {
    const lines=[]; let line='';
    for(const word of clean(value).split(' ')) {
      if(font.widthOfTextAtSize(line ? `${line} ${word}` : word,size)<=width){line=line?`${line} ${word}`:word;continue;}
      if(line){lines.push(line);line='';}
      for(const char of word){if(font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}line+=char;}
    }
    if(line)lines.push(line);return lines;
  };
  let page, y;
  const summaryPages=[];
  const draw=(text,x,atY,size=10,color=textColor)=>page.drawText(clean(text),{x,y:atY,size,font,color});
  const newPage = () => {
    page=pdf.addPage([612,792]);summaryPages.push(page);
    page.drawRectangle({x:42,y:746,width:528,height:4,color:red});
    draw('RED ROAD JIUJITSU LLC',42,717,18);
    draw('SIGNED WAIVER / ELECTRONIC SIGNATURE RECORD',42,695,9,muted);
    y=670;
  };
  newPage();
  const signatureLines=wrap(record.electronicSignature,496,17);
  draw('RECORDED SIGNATURE (TYPED)',42,y,8,muted);y-=25;
  signatureLines.forEach(line=>{draw(line,42,y,17);y-=22;});y-=12;
  const fields = [
    ['Participant',record.participantName], ['Receipt ID',record.receiptId],
    ['Date of birth',record.dob], ['Minor participant',record.minor===true?'Yes - guardian details below':record.minor===false?'No':'Not recorded'],
    ['Signed timestamp (stored)',record.signedAt], ['Signature date (entered)',record.signatureDate],
    ['Email',record.email], ['Phone',record.phone],
    ['Address',record.address], ['Parent / legal guardian',record.guardianName||'Not recorded / not applicable'],
    ['Relationship',record.relationship||'Not recorded / not applicable'], ['Emergency contact',record.emergencyName],
    ['Emergency phone',record.emergencyPhone], ['Photo/video release',record.photoVideoReleaseAccepted===true?`Accepted; initials: ${record.photoVideoInitials||'Not recorded'}`:record.photoVideoReleaseAccepted===false?'Declined':'Not recorded on this version'],
    ['Agreement version',record.waiverVersion], ['Record type',record.trialClass?'Free-trial waiver':record.standalone?'Waiver-only submission':'Member waiver']
  ];
  if(record.trialClass)fields.push(['Trial program',record.trialProgram],['Preferred trial date',record.trialDate],['Trial pass valid through',record.trialExpiresOn]);
  for(let i=0;i<fields.length;i+=2){
    const pair=fields.slice(i,i+2).map(([label,value])=>({label,lines:wrap(value,246)}));
    const height=Math.max(...pair.map(item=>item.lines.length))*14+28;
    if(y-height<76)newPage();
    pair.forEach((item,col)=>{
      const x=42+col*270;draw(item.label.toUpperCase(),x,y,7.5,muted);
      item.lines.forEach((line,n)=>draw(line,x,y-16-n*14,10));
    });y-=height;
  }
  const note='This addendum reproduces stored signature fields. The original agreement follows unchanged. Blank signature lines in that agreement are not a new signature request. This is not a certificate-based digital signature.';
  const noteLines=wrap(note,528,8);
  if(y-noteLines.length*12<70)newPage();
  noteLines.forEach(line=>{draw(line,42,y-6,8,muted);y-=12;});
  summaryPages.forEach((item,i)=>item.drawText(`Signature record ${i+1} of ${summaryPages.length}  |  Private participant information`,{x:42,y:34,size:8,font,color:muted}));
  const original = await PDFDocument.load(agreementBytes);
  for (const originalPage of await pdf.copyPages(original,original.getPageIndices())) pdf.addPage(originalPage);
  pdf.setTitle(`Signed Waiver - ${clean(record.participantName)} - ${clean(record.receiptId)}`);
  pdf.setAuthor('Red Road Jiujitsu LLC');
  pdf.setSubject('Stored electronic signature record with referenced agreement');
  return pdf.save();
}

export function attachWaiverPrint(record,target){
  const actions=document.createElement('div');actions.className='flow-actions waiver-print-actions';
  const button=document.createElement('button');button.type='button';button.className='btn btn-red';button.textContent='Print / Save Signed Waiver';
  const status=document.createElement('p');status.className='portal-muted';status.setAttribute('role','status');
  const download=document.createElement('a');download.className='btn btn-dark';download.textContent='Download Signed PDF';download.hidden=true;
  const previewLink=document.createElement('a');previewLink.className='btn btn-dark';previewLink.textContent='Open Printable PDF';previewLink.target='_blank';previewLink.rel='noopener';previewLink.hidden=true;
  actions.append(button,previewLink,download);target.append(actions,status);
  let url=null;
  const filename=`RedRoad-Signed-Waiver-${String(record.receiptId).replace(/[^a-z0-9_-]/gi,'-')}.pdf`;
  const cleanup=()=>{if(url)URL.revokeObjectURL(url);};
  addEventListener('pagehide',cleanup,{once:true});
  const removalObserver=new MutationObserver(()=>{if(!target.contains(actions)){cleanup();removeEventListener('pagehide',cleanup);removalObserver.disconnect();}});
  removalObserver.observe(target,{childList:true});
  button.addEventListener('click',async()=>{
    if(button.disabled)return;
    button.disabled=true;button.setAttribute('aria-busy','true');
    status.textContent='Preparing the signed record and the full agreement…';
    let preview=null;
    try {
      preview=window.open('about:blank','_blank');
      if(preview){preview.opener=null;preview.document.title='Preparing signed waiver';preview.document.body.textContent='Preparing your signed waiver. Keep this tab open.';}
      if(!url){
        const [{default:fontkit},pdfLib,agreementResponse,fontResponse]=await Promise.all([
          import('./vendor/fontkit.es.min.js'),import('./vendor/pdf-lib.esm.min.js'),
          fetch('assets/red-road-liability-waiver.pdf'),fetch('assets/fonts/DejaVuSans.ttf')
        ]);
        if(!agreementResponse.ok||!fontResponse.ok)throw new Error('The agreement or print font could not be loaded. Check the connection and try again.');
        const bytes=await buildWaiverPdf(record,await agreementResponse.arrayBuffer(),await fontResponse.arrayBuffer(),pdfLib,fontkit);
        url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      }
      previewLink.href=url;previewLink.hidden=false;
      download.href=url;download.download=filename;download.hidden=false;
      if(preview&&!preview.closed)preview.location.replace(url);
      status.textContent='Ready. Use the PDF viewer’s Print button, or download a copy. Keep this private document secure.';
    }catch(error){if(preview&&!preview.closed)preview.close();status.textContent=error.message||'The PDF could not be prepared. Your saved waiver is unchanged.';}
    finally{button.disabled=false;button.removeAttribute('aria-busy');}
  });
}

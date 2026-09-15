const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');const assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {buildWaiverPdf,AGREEMENT_VERSION}=await import(pathToFileURL(path.join(root,'waiver-pdf.js')));
 const pdfLib=await import(pathToFileURL(path.join(root,'vendor/pdf-lib.esm.min.js')));
 const {default:fontkit}=await import(pathToFileURL(path.join(root,'vendor/fontkit.es.min.js')));
 const agreement=fs.readFileSync(path.join(root,'assets/red-road-liability-waiver.pdf'));const font=fs.readFileSync(path.join(root,'assets/fonts/DejaVuSans.ttf'));
 const record={participantName:'Alex Example',receiptId:'RR-PRINT-QA-ONLY',dob:'2015-02-01',signedAt:'2026-09-15T19:05:00.000Z',signatureDate:'2026-09-15',email:'example@example.invalid',phone:'555-0100',address:'123 Example Street, Test City',minor:true,guardianName:'Renée Example',relationship:'Parent',emergencyName:'Sam Example',emergencyPhone:'555-0101',photoVideoReleaseAccepted:false,photoVideoInitials:'',electronicSignature:'Renée Example',waiverVersion:AGREEMENT_VERSION,trialClass:true,trialProgram:'Kids / Bullyproof',trialDate:'2026-09-17',trialExpiresOn:'2026-10-17'};
 const bytes=await buildWaiverPdf(record,agreement,font,pdfLib,fontkit);fs.writeFileSync(path.join(require('node:os').tmpdir(),'redroad-signed-waiver-QA-only.pdf'),bytes);
 const pdf=await pdfLib.PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=14);
 await assert.rejects(buildWaiverPdf({...record,waiverVersion:'Other agreement'},agreement,font,pdfLib,fontkit),/different agreement/);
 await assert.rejects(buildWaiverPdf(record,Buffer.from('wrong file'),font,pdfLib,fontkit),/does not match/);
 await assert.rejects(buildWaiverPdf({...record,electronicSignature:''},agreement,font,pdfLib,fontkit),/signature and receipt/);
 console.log(JSON.stringify({pages:pdf.getPageCount(),agreementPages:13,signaturePages:pdf.getPageCount()-13,bytes:bytes.length,versionMismatch:'blocked',wrongAgreement:'blocked',missingSignature:'blocked'}));
})();

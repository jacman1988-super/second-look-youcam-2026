const $=s=>document.querySelector(s);let timer;let generation=0,remainingTaskCap=null,keyVerificationAttempted=false;
const status=t=>$('#status').textContent=t;
const verificationMessages=Object.freeze({
 not_requested:'Key has not been verified. Verification runs only when you press Verify key.',
 pending:'Read-only key verification is in progress. No image generation was requested.',
 authenticated:'Key authenticated by the read-only YouCam feature-cost endpoint. No image generation was requested. This does not verify Clothes V4 output or free unit balance.',
 failed:'Read-only key verification did not confirm authentication. No image generation was requested. No automatic retry was made.'
});
async function refresh(initial=false){try{const r=await fetch('/api/status');if(!r.ok)throw Error('Local status rejected.');const d=await r.json();if(!d||typeof d.live!=='boolean')throw Error('Invalid local status.');remainingTaskCap=d.remainingTaskCap;$('#mode').textContent=d.live?(remainingTaskCap===0?'YOUCAM API · GENERATION DISABLED':'YOUCAM API · READY FOR MANUAL TEST'):'LOCAL PROTOTYPE · NO API CALLS';$('#localConnectPanel').hidden=!d.localConnectEnabled;$('#localCap').textContent=`Remaining local generation cap: ${d.remainingTaskCap}.`+(remainingTaskCap===0?' Image generation is disabled.':'');if(remainingTaskCap===0)$('#generate').disabled=true;const saved=d.verification?.state;if(Object.hasOwn(verificationMessages,saved)){keyVerificationAttempted=saved!=='not_requested';$('#verifyStatus').textContent=verificationMessages[saved];}$('#verifyKey').disabled=!d.live||keyVerificationAttempted;if(initial&&remainingTaskCap===0)$('#connectStatus').textContent=d.live?'Key loaded in local server RAM. Image generation is disabled (local cap 0).':'Image generation is disabled (local cap 0). Loading a key starts no verification or generation.';if(initial&&generation===0&&d.live)status('Local key loaded in server RAM. '+(saved==='authenticated'?'Read-only key authentication was confirmed. ':'It has not been authenticated by a completed read-only check. ')+'Opening this page starts no generation.'+(remainingTaskCap===0?' Image generation is disabled.':''));return d;}catch{$('#mode').textContent='LOCAL SERVER STATUS UNAVAILABLE';$('#verifyKey').disabled=true;$('#localCap').textContent='Local generation cap could not be confirmed.';if(!initial||generation===0)status('Local server status could not be confirmed. No new generation was started.');}}
const connectErrors=new Map([
 ['Only localhost requests are allowed.','The local host guard blocked this request.'],
 ['Cross-origin request blocked.','The same-origin guard blocked this request.'],
 ['Cross-site request blocked.','The cross-site guard blocked this request.'],
 ['Local key entry is disabled. No provider request was made.','Local key entry is disabled in this server.'],
 ['Use the local connection form. No provider request was made.','The request content type was rejected.'],
 ['Local connection could not be completed. Check the key and try again. No provider request was made.','The local input format or request size was rejected.']
]);
async function connectError(r){let category='The local server rejected this request.';try{const d=await r.json();category=connectErrors.get(d?.error)||category;}catch{}const code=Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:'unknown';return `Local connection failed (HTTP ${code}). ${category} No generation was started.`;}
function keyFormatIssue(token){
 // Static reasons only: never include the token, a fragment, or its length.
 if(/^Bearer\s/i.test(token))return 'A Bearer prefix is present. Paste the API key alone.';
 if(/["'\u2018\u2019\u201c\u201d`]/.test(token))return 'Quotation marks are present. Paste the API key without quotes.';
 if(/[*\u2022\u25cf\u2026]/.test(token))return 'A masking or truncation character is present. Copy the complete secret from its creation dialog.';
 if(/\s/.test(token))return 'Whitespace is present inside the key. Paste the secret as one token.';
 if(/[^\x00-\x7f]/.test(token))return 'A non-ASCII character is present. Copy the original API secret without changing its characters.';
 if(/[\x00-\x1f\x7f]/.test(token))return 'A control character is present. Copy the original API secret again.';
 if(token.length>4096)return 'The input exceeds the supported size limit. Paste only the API secret.';
 if(/=[^=]/.test(token))return 'Padding is present before the end of the token. Copy the original API secret again.';
 if(!/^[-A-Za-z0-9._~+/]+=*$/.test(token))return 'A character outside standard Bearer token syntax is present. Copy the original API secret again.';
 return null;
}
refresh(true);
$('#connectForm').onsubmit=async e=>{e.preventDefault();if($('#connectButton').disabled)return;const input=$('#apiKey');let apiKey=input.value.trim();input.value='';$('#connectButton').disabled=true;
 try{
  if(!apiKey){$('#connectStatus').textContent='Paste your YouCam API key, then choose Load key locally. No generation was started.';return;}
  const issue=keyFormatIssue(apiKey);if(issue){$('#connectStatus').textContent=`The local key format is invalid. ${issue} No connection or provider request was made by this attempt. No generation was started.`;return;}
  $('#connectStatus').textContent='Connecting to the local server. No generation is being started.';
  const request=fetch('/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey})});apiKey='';
  const r=await request;if(!r.ok){$('#connectStatus').textContent=await connectError(r);return;}
  keyVerificationAttempted=false;$('#verifyStatus').textContent='Key has not been verified. Verification is a separate read-only action.';
  const config=await refresh();if(!config?.live){$('#connectStatus').textContent='The local connection request was accepted, but readiness could not be confirmed. No generation was started.';return;}
  $('#connectStatus').textContent='Key loaded into local server RAM. It has not been verified with YouCam. No provider request or generation was made.';
  status(remainingTaskCap===0?'Local key loaded. Image generation is disabled. Verify key is a separate read-only check.':'Local key loaded. Choose Preview with YouCam only when ready to start the separate manual test. No generation has been started by loading the key.');
 }catch{$('#connectStatus').textContent='Could not reach the local connection endpoint. Check that the local server is running. No generation was started.';}
 finally{apiKey='';input.value='';$('#connectButton').disabled=false;}
};
function safeVerificationError(text){return typeof text==='string'&&[
 /^YouCam rejected the request \(HTTP (?:[1-5]\d{2}|unknown); API (?:[1-5]\d{2}|unknown); (?:unclassified provider rejection|authentication rejected|access denied|request validation rejected|endpoint not found|rate or quota limit|provider service failure)\)\. No automatic retry was made\.$/,
 /^YouCam request could not be completed \((?:unclassified local transport failure|request timed out|request aborted|local header encoding rejected|network connection failed|TLS connection failed)\)\. No automatic retry was made\.$/,
 /^YouCam returned an unusable response \(HTTP (?:[1-5]\d{2}|unknown); (?:invalid or unreadable JSON|missing feature cost data)\)\. No automatic retry was made\.$/
].some(pattern=>pattern.test(text));}
$('#verifyKey').onclick=async()=>{if($('#verifyKey').disabled)return;keyVerificationAttempted=true;$('#verifyKey').disabled=true;$('#connectButton').disabled=true;$('#verifyStatus').textContent='Checking authentication with one read-only feature-cost request. No image generation.';
 try{const r=await fetch('/api/verify-key',{method:'POST'});const d=await r.json();if(!r.ok){const code=Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:'unknown';$('#verifyStatus').textContent=(safeVerificationError(d?.error)?d.error:`Key verification was rejected (HTTP ${code}).`)+' No image generation was requested.';return;}if(d?.authenticated!==true)throw Error('Invalid local verification response.');$('#verifyStatus').textContent='Key authenticated by the read-only YouCam feature-cost endpoint. No image generation was requested. This does not verify Clothes V4 output or free unit balance.';
 }catch{$('#verifyStatus').textContent='Key verification could not be confirmed. No image generation was requested. No automatic retry was made.';}finally{$('#connectButton').disabled=false;}
};
$('#demo').onclick=()=>{generation++;clearTimeout(timer);$('#original').hidden=true;$('#overlay').hidden=true;$('#illustration').hidden=false;$('.empty').hidden=true;$('#compare').disabled=true;$('#generate').disabled=remainingTaskCap===0;$('#previewLabel').textContent='OFFLINE WALKTHROUGH';status('Illustration only — this walkthrough sends no photos and starts no API task. Any previously started task may still finish.');};
$('#clear').onclick=()=>{generation++;clearTimeout(timer);for(const id of ['original','result']){$('#'+id).removeAttribute('src');$('#'+id).hidden=true;}$('#overlay').hidden=true;$('#illustration').hidden=true;$('.empty').hidden=false;$('#form').reset();$('#compare').disabled=true;$('#generate').disabled=remainingTaskCap===0;$('#previewLabel').textContent='YOUR NEXT SECOND LOOK';status('Photos cleared from this page. This does not cancel an already started YouCam task or delete provider copies.');};
$('#compare').oninput=e=>$('#overlay').style.clipPath=`inset(0 ${100-e.target.value}% 0 0)`;
$('#form').onsubmit=async e=>{e.preventDefault();const current=++generation;clearTimeout(timer);$('#generate').disabled=true;
 try{const config=await refresh();if(current!==generation)return;if(!config?.live)throw Error('Live mode is off. No photos were loaded or sent. The offline walkthrough is available below.');if(config.remainingTaskCap===0)throw Error('Image generation is disabled by the local task cap. No generation was requested.');
 const src=$('#person').value.trim(),ref=$('#garment').value.trim();for(const v of [src,ref]){const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use public HTTPS photo URLs without embedded credentials.');}
 const r=await fetch('/api/try-on',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({src_file_url:src,ref_file_url:ref,consent:$('#consent').checked})});const d=await r.json();if(current!==generation)return;if(!r.ok)throw Error(d.error);
 $('#compare').value='50';$('#overlay').style.clipPath='inset(0 50% 0 0)';
 $('#illustration').hidden=true;$('.empty').hidden=true;$('#original').src=src;$('#original').hidden=false;$('#overlay').hidden=true;$('#previewLabel').textContent='YOUCAM IS PREPARING YOUR LOOK';status('YouCam generation started. Please wait.');
 let tries=0;const poll=async()=>{if(current!==generation)return;try{const r=await fetch('/api/result?id='+encodeURIComponent(d.taskId));const result=await r.json();if(current!==generation)return;if(!r.ok)throw Error(result.error);if(result.status==='success'&&result.url){$('#result').src=result.url;$('#result').hidden=false;$('#overlay').hidden=false;$('#compare').disabled=false;$('#previewLabel').textContent='ORIGINAL / AI STYLE PREVIEW';status('Preview ready. Compare details, then check measurements and condition before buying.');$('#generate').disabled=remainingTaskCap===0;}else if(result.status==='error')throw Error(result.error||'The images could not be processed.');else if(++tries>=45)throw Error('Still processing after 6 minutes. Check the YouCam console; do not create duplicate tasks.');else timer=setTimeout(poll,8000);}catch(e){if(current===generation){status(e.message);$('#generate').disabled=remainingTaskCap===0;}}};timer=setTimeout(poll,8000);
 }catch(e){if(current===generation){status(e.message);$('#generate').disabled=remainingTaskCap===0;}}};
function checks(){return [...document.querySelectorAll('.verify')].map(e=>e.checked);}
for(const c of document.querySelectorAll('.verify'))c.onchange=()=>{$('#verdict').replaceChildren(document.createTextNode(`${checks().filter(Boolean).length} / 3 checks complete`));const s=document.createElement('small');s.textContent='Keep the listing photo as your source of truth.';$('#verdict').append(s);};
$('#export').onclick=()=>{const names=['Actual measurements checked','Condition, repairs and fabric checked','Seller photos and return terms checked'];const text='SECOND LOOK — DECISION NOTES\n'+new Date().toISOString().slice(0,10)+'\n\n'+names.map((n,i)=>(checks()[i]?'[x] ':'[ ] ')+n).join('\n')+'\n\nAI preview is not proof of fit, colour, condition or authenticity.\nNo photo URLs are included in these notes.\n';const u=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const a=document.createElement('a');a.href=u;a.download='second-look-notes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};

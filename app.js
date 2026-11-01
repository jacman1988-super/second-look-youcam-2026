const $=s=>document.querySelector(s);let timer;let generation=0;
const status=t=>$('#status').textContent=t;
async function refresh(initial=false){try{const r=await fetch('/api/status');if(!r.ok)throw Error('Local status rejected.');const d=await r.json();if(!d||typeof d.live!=='boolean')throw Error('Invalid local status.');$('#mode').textContent=d.live?'YOUCAM API · READY FOR MANUAL TEST':'LOCAL PROTOTYPE · NO API CALLS';$('#localConnectPanel').hidden=!d.localConnectEnabled;$('#localCap').textContent=`Remaining local generation cap: ${d.remainingTaskCap}.`;if(initial&&generation===0&&d.live)status('Local key loaded in server RAM; it has not been verified with YouCam. Opening this page starts no generation.');return d;}catch{$('#mode').textContent='LOCAL SERVER STATUS UNAVAILABLE';$('#localCap').textContent='Local generation cap could not be confirmed.';if(!initial||generation===0)status('Local server status could not be confirmed. No new generation was started.');}}
const connectErrors=new Map([
 ['Only localhost requests are allowed.','The local host guard blocked this request.'],
 ['Cross-origin request blocked.','The same-origin guard blocked this request.'],
 ['Cross-site request blocked.','The cross-site guard blocked this request.'],
 ['Local key entry is disabled. No provider request was made.','Local key entry is disabled in this server.'],
 ['Use the local connection form. No provider request was made.','The request content type was rejected.'],
 ['Local connection could not be completed. Check the key and try again. No provider request was made.','The local input format or request size was rejected.']
]);
async function connectError(r){let category='The local server rejected this request.';try{const d=await r.json();category=connectErrors.get(d?.error)||category;}catch{}const code=Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:'unknown';return `Local connection failed (HTTP ${code}). ${category} No generation was started.`;}
refresh(true);
$('#connectForm').onsubmit=async e=>{e.preventDefault();if($('#connectButton').disabled)return;const input=$('#apiKey');let apiKey=input.value.trim();input.value='';$('#connectButton').disabled=true;
 try{
  if(!apiKey){$('#connectStatus').textContent='Paste your YouCam API key, then choose Load key locally. No generation was started.';return;}
  if(apiKey.length<16||apiKey.length>4096||/[\u0000-\u001f\u007f]/.test(apiKey)){$('#connectStatus').textContent='The local key format is invalid. Use 16–4096 characters without control characters. No generation was started.';return;}
  $('#connectStatus').textContent='Connecting to the local server. No generation is being started.';
  const request=fetch('/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey})});apiKey='';
  const r=await request;if(!r.ok){$('#connectStatus').textContent=await connectError(r);return;}
  const config=await refresh();if(!config?.live){$('#connectStatus').textContent='The local connection request was accepted, but readiness could not be confirmed. No generation was started.';return;}
  $('#connectStatus').textContent='Key loaded into local server RAM. It has not been verified with YouCam. No provider request or generation was made.';
  status('Local key loaded. Choose Preview with YouCam only when ready to start the separate manual test. No generation has been started by loading the key.');
 }catch{$('#connectStatus').textContent='Could not reach the local connection endpoint. Check that the local server is running. No generation was started.';}
 finally{apiKey='';input.value='';$('#connectButton').disabled=false;}
};
$('#demo').onclick=()=>{generation++;clearTimeout(timer);$('#original').hidden=true;$('#overlay').hidden=true;$('#illustration').hidden=false;$('.empty').hidden=true;$('#compare').disabled=true;$('#generate').disabled=false;$('#previewLabel').textContent='OFFLINE WALKTHROUGH';status('Illustration only — this walkthrough sends no photos and starts no API task. Any previously started task may still finish.');};
$('#clear').onclick=()=>{generation++;clearTimeout(timer);for(const id of ['original','result']){$('#'+id).removeAttribute('src');$('#'+id).hidden=true;}$('#overlay').hidden=true;$('#illustration').hidden=true;$('.empty').hidden=false;$('#form').reset();$('#compare').disabled=true;$('#generate').disabled=false;$('#previewLabel').textContent='YOUR NEXT SECOND LOOK';status('Photos cleared from this page. This does not cancel an already started YouCam task or delete provider copies.');};
$('#compare').oninput=e=>$('#overlay').style.clipPath=`inset(0 ${100-e.target.value}% 0 0)`;
$('#form').onsubmit=async e=>{e.preventDefault();const current=++generation;clearTimeout(timer);$('#generate').disabled=true;
 try{const config=await refresh();if(current!==generation)return;if(!config?.live)throw Error('Live mode is off. No photos were loaded or sent. The offline walkthrough is available below.');
 const src=$('#person').value.trim(),ref=$('#garment').value.trim();for(const v of [src,ref]){const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use public HTTPS photo URLs without embedded credentials.');}
 const r=await fetch('/api/try-on',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({src_file_url:src,ref_file_url:ref,consent:$('#consent').checked})});const d=await r.json();if(current!==generation)return;if(!r.ok)throw Error(d.error);
 $('#compare').value='50';$('#overlay').style.clipPath='inset(0 50% 0 0)';
 $('#illustration').hidden=true;$('.empty').hidden=true;$('#original').src=src;$('#original').hidden=false;$('#overlay').hidden=true;$('#previewLabel').textContent='YOUCAM IS PREPARING YOUR LOOK';status('YouCam generation started. Please wait.');
 let tries=0;const poll=async()=>{if(current!==generation)return;try{const r=await fetch('/api/result?id='+encodeURIComponent(d.taskId));const result=await r.json();if(current!==generation)return;if(!r.ok)throw Error(result.error);if(result.status==='success'&&result.url){$('#result').src=result.url;$('#result').hidden=false;$('#overlay').hidden=false;$('#compare').disabled=false;$('#previewLabel').textContent='ORIGINAL / AI STYLE PREVIEW';status('Preview ready. Compare details, then check measurements and condition before buying.');$('#generate').disabled=false;}else if(result.status==='error')throw Error(result.error||'The images could not be processed.');else if(++tries>=45)throw Error('Still processing after 6 minutes. Check the YouCam console; do not create duplicate tasks.');else timer=setTimeout(poll,8000);}catch(e){if(current===generation){status(e.message);$('#generate').disabled=false;}}};timer=setTimeout(poll,8000);
 }catch(e){if(current===generation){status(e.message);$('#generate').disabled=false;}}};
function checks(){return [...document.querySelectorAll('.verify')].map(e=>e.checked);}
for(const c of document.querySelectorAll('.verify'))c.onchange=()=>{$('#verdict').replaceChildren(document.createTextNode(`${checks().filter(Boolean).length} / 3 checks complete`));const s=document.createElement('small');s.textContent='Keep the listing photo as your source of truth.';$('#verdict').append(s);};
$('#export').onclick=()=>{const names=['Actual measurements checked','Condition, repairs and fabric checked','Seller photos and return terms checked'];const text='SECOND LOOK — DECISION NOTES\n'+new Date().toISOString().slice(0,10)+'\n\n'+names.map((n,i)=>(checks()[i]?'[x] ':'[ ] ')+n).join('\n')+'\n\nAI preview is not proof of fit, colour, condition or authenticity.\nNo photo URLs are included in these notes.\n';const u=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const a=document.createElement('a');a.href=u;a.download='second-look-notes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};

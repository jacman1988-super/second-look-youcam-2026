import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const host='https://yce-api-01.makeupar.com/s2s/v2.0';
// Local single-user prototype. Key stays in server memory and is never logged or sent to the browser.
let key=process.env.YOUCAM_API_KEY;
let live=!!key && process.env.YOUCAM_ENABLE_LIVE==='yes';
const localConnectEnabled=process.env.YOUCAM_ALLOW_LOCAL_CONNECT==='yes';
const jobs=new Set(); let started=0,verificationAttempted=false,keyRevision=0;
let verificationState='not_requested';
const verificationMessages=Object.freeze({
 not_requested:'Key has not been verified. Verification runs only when you press Verify key.',
 pending:'Read-only key verification is in progress. No image generation was requested.',
 authenticated:'Key authenticated by the read-only YouCam feature-cost endpoint. No image generation was requested. This does not verify Clothes V4 output or free unit balance.',
 failed:'Read-only key verification did not confirm authentication. No image generation was requested. No automatic retry was made.'
});
const configuredLimit=process.env.YOUCAM_MAX_TASKS;
const parsedLimit=configuredLimit===undefined||configuredLimit.trim()===''?1:Number(configuredLimit);
const limit=Number.isFinite(parsedLimit)?Math.min(3,Math.max(0,Math.floor(parsedLimit))):1;
// Transport guard only. The provider documents an opaque API key, not a
// character alphabet. Keep printable ASCII unchanged; reject whitespace and
// control characters before placing it in the fixed Authorization header.
// Loading a key does not establish authentication or completeness.
function bearerToken(value){
 if(typeof value!=='string')throw Error('Invalid local key.');
 const token=value.trim();
 if(!token||token.length>4096||!/^[\x21-\x7e]+$/.test(token))throw Error('Invalid local key.');
 return token;
}
// Only bounded numeric statuses and our own static labels may reach the UI.
// Provider messages, tokens, URLs, response bodies and headers are never echoed.
class YouCamDiagnosticError extends Error{}
class YouCamRequestError extends YouCamDiagnosticError{
 constructor(httpStatus,apiStatus,errorCode){
  const code=value=>Number.isInteger(value)&&value>=100&&value<=599?value:null;
  const httpCode=code(httpStatus),apiCode=code(apiStatus),effective=httpCode>=400?httpCode:apiCode;
  let category='unclassified provider rejection';
  if(errorCode==='InvalidAccessToken'||effective===401)category='authentication rejected';
  else if(effective===403)category='access denied';
  else if(effective===400||effective===422)category='request validation rejected';
  else if(effective===404)category='endpoint not found';
  else if(effective===429)category='rate or quota limit';
  else if(effective>=500)category='provider service failure';
  super(`YouCam rejected the request (HTTP ${httpCode??'unknown'}; API ${apiCode??'unknown'}; ${category}). No automatic retry was made.`);
 }
}
function transportFailure(error){
 const codes=[error?.code,error?.cause?.code];let category='unclassified local transport failure';
 if(error?.name==='TimeoutError'||codes.some(c=>['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(c)))category='request timed out';
 else if(error?.name==='AbortError'||codes.includes('ABORT_ERR'))category='request aborted';
 else if(codes.some(c=>['ERR_INVALID_CHAR','ERR_HTTP_INVALID_HEADER_VALUE'].includes(c))||[error?.message,error?.cause?.message].some(m=>typeof m==='string'&&/^Cannot convert argument to a ByteString because the character at index \d+ has a value of \d+ which is greater than 255\.?$/.test(m)))category='local header encoding rejected';
 else if(codes.some(c=>['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','UND_ERR_SOCKET'].includes(c))||error?.message==='fetch failed')category='network connection failed';
 else if(codes.some(c=>['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID'].includes(c)))category='TLS connection failed';
 return new YouCamDiagnosticError(`YouCam request could not be completed (${category}). No automatic retry was made.`);
}
function protocolFailure(httpStatus,reason){
 const code=Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:'unknown';
 return new YouCamDiagnosticError(`YouCam returned an unusable response (HTTP ${code}; ${reason}). No automatic retry was made.`);
}
async function api(path,options={},featureCost=false){
 let token;try{token=bearerToken(key);}catch{throw new YouCamDiagnosticError('Local Bearer token format was rejected before sending a provider request. No automatic retry was made.');}
 let r;try{r=await fetch(host+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000)});}catch(error){throw transportFailure(error);}
 let d;try{d=await r.json();}catch(error){if(!r.ok)throw new YouCamRequestError(r.status);if(error?.name==='TimeoutError'||error?.name==='AbortError'||error?.cause?.code||error?.code)throw transportFailure(error);throw protocolFailure(r.status,'invalid or unreadable JSON');}
 if(!r.ok||d?.status>=400)throw new YouCamRequestError(r.status,d?.status,d?.error_code);
 if(featureCost){if(!d||typeof d!=='object'||!d.result||typeof d.result!=='object'||!Array.isArray(d.result.skus))throw protocolFailure(r.status,'missing feature cost data');return;}
 if(!d||typeof d!=='object'||Array.isArray(d)||!d.data||typeof d.data!=='object'||Array.isArray(d.data))throw protocolFailure(r.status,'missing result data');
 if(options.method==='POST'&&(typeof d.data.task_id!=='string'||!d.data.task_id.trim()||d.data.task_id.length>1024||/[\u0000-\u001f\u007f]/.test(d.data.task_id)))throw protocolFailure(r.status,'missing or invalid task identifier');
 return d.data;
}
export function validateTask(body){
 if(!body||body.consent!==true)throw Error('Confirm permission to use both images.');
 for(const k of ['src_file_url','ref_file_url']){const u=new URL(body[k]);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use public HTTPS image links without embedded credentials.');}
 return {src_file_url:body.src_file_url,ref_file_url:body.ref_file_url,garment_category:'full_body'};
}
async function body(req,maxBytes=8000){const chunks=[];let bytes=0,tooLarge=false;for await(const c of req){bytes+=Buffer.byteLength(c);if(bytes>maxBytes)tooLarge=true;else chunks.push(c);}if(tooLarge)throw Error('Request too large.');return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const safeErrors=new Set(['Confirm permission to use both images.','Use public HTTPS image links without embedded credentials.','Request too large.','YouCam rejected the request. Check your key, free unit balance and image requirements in the console.']);
export const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  // A malicious domain can resolve to loopback. Do not trust its Host header
  // merely because this server only listens on the loopback interface.
  const port=req.socket.localPort;
  const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  if(port===80){allowedHosts.add('127.0.0.1');allowedHosts.add('localhost');}
  if(!allowedHosts.has(req.headers.host))return json(res,403,{error:'Only localhost requests are allowed.'});
  // Block cross-site browser requests to the local spending endpoint.
  const origin=req.headers.origin;if(url.pathname.startsWith('/api/')&&origin&&origin!==`http://${req.headers.host}`)return json(res,403,{error:'Cross-origin request blocked.'});
  if(url.pathname.startsWith('/api/')&&req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Cross-site request blocked.'});
  if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{live,localConnectEnabled,remainingTaskCap:Math.max(0,limit-started),verification:{state:verificationState,message:verificationMessages[verificationState]}});
  if(req.method==='POST'&&url.pathname==='/api/connect'){
   if(!localConnectEnabled)return json(res,403,{error:'Local key entry is disabled. No provider request was made.'});
   if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return json(res,415,{error:'Use the local connection form. No provider request was made.'});
   try{
    const data=await body(req,6144),candidate=bearerToken(data?.apiKey);
    key=candidate;live=true;verificationAttempted=false;verificationState='not_requested';keyRevision++;
    // Connecting replaces only the in-memory credential. It never resets the
    // process generation cap, task history, or makes a provider request.
    return json(res,200,{live:true,remainingTaskCap:Math.max(0,limit-started)});
   }catch{return json(res,400,{error:'Local connection could not be completed. Check the key and try again. No provider request was made.'});}
  }
  if(req.method==='POST'&&url.pathname==='/api/verify-key'){
   if(!live)return json(res,409,{error:'Load a local key before requesting verification. No generation was started.'});
   if(verificationAttempted)return json(res,429,{error:'One verification attempt has already been made for this key load. No generation was started.'});
   verificationAttempted=true;verificationState='pending';const revision=keyRevision;
   // Explicit read-only V2 request. No images, task endpoint or generation-counter change.
   try{await api('/credit/feature-cost?page_size=20',{method:'GET'},true);}catch(error){if(revision===keyRevision)verificationState='failed';throw error;}
   if(revision!==keyRevision)return json(res,409,{error:'The local key changed during verification. No generation was started.'});
   verificationState='authenticated';return json(res,200,{authenticated:true,remainingTaskCap:Math.max(0,limit-started)});
  }
  if(req.method==='POST'&&url.pathname==='/api/try-on'){
   if(!live)return json(res,409,{error:'Live mode is off. No API units have been used. Configure a free account and enable live mode only after confirming the balance.'});
   const payload=validateTask(await body(req));if(started>=limit)return json(res,429,{error:'Local task cap reached. No more generations will be started in this session.'});
   started++;const d=await api('/task/cloth-v4',{method:'POST',body:JSON.stringify(payload)});jobs.add(d.task_id);return json(res,202,{taskId:d.task_id});
  }
  if(req.method==='GET'&&url.pathname==='/api/result'){
   const id=url.searchParams.get('id');if(!jobs.has(id))return json(res,404,{error:'Unknown task.'});
   const d=await api('/task/cloth-v4/'+encodeURIComponent(id));return json(res,200,{status:d.task_status,url:d.results?.url||null,error:d.error?'YouCam could not process these images.':null});
  }
  const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
  if(req.method!=='GET'||!files[url.pathname])return json(res,404,{error:'Not found'});
  const file=files[url.pathname];res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':'text/css','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' https: blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(await readFile(resolve(root,file)));
 }catch(e){json(res,400,{error:e instanceof YouCamDiagnosticError?e.message:e.message==='Invalid URL'?'Enter two valid public HTTPS image links.':safeErrors.has(e.message)?e.message:'The local request could not be completed. Check the local settings before retrying.'});}
});
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT)||4177;server.listen(port,'127.0.0.1',()=>console.log('Second Look: http://127.0.0.1:'+port+' (live mode '+(live?'enabled':'disabled')+')'));}

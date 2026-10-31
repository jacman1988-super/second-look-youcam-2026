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
const jobs=new Set(); let started=0;
const limit=Math.min(3,Math.max(0,Number(process.env.YOUCAM_MAX_TASKS)||1));
async function api(path,options={}){
 const r=await fetch(host+path,{...options,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000)});
 const d=await r.json(); if(!r.ok||d.status>=400)throw Error('YouCam rejected the request. Check your key, free unit balance and image requirements in the console.');return d.data;
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
  if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{live,localConnectEnabled,remainingTaskCap:Math.max(0,limit-started)});
  if(req.method==='POST'&&url.pathname==='/api/connect'){
   if(!localConnectEnabled)return json(res,403,{error:'Local key entry is disabled. No provider request was made.'});
   if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return json(res,415,{error:'Use the local connection form. No provider request was made.'});
   try{
    const data=await body(req,6144),candidate=data?.apiKey;
    if(typeof candidate!=='string'||candidate.length<16||candidate.length>4096||/[\u0000-\u001f\u007f]/.test(candidate)||!candidate.trim())throw Error('Invalid key.');
    key=candidate;live=true;
    // Connecting replaces only the in-memory credential. It never resets the
    // process generation cap, task history, or makes a provider request.
    return json(res,200,{live:true,remainingTaskCap:Math.max(0,limit-started)});
   }catch{return json(res,400,{error:'Local connection could not be completed. Check the key and try again. No provider request was made.'});}
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
  const file=files[url.pathname];res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':'text/css','Content-Security-Policy':"default-src 'self'; img-src 'self' https: blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(await readFile(resolve(root,file)));
 }catch(e){json(res,400,{error:e.message==='Invalid URL'?'Enter two valid public HTTPS image links.':safeErrors.has(e.message)?e.message:'The local request could not be completed. Check the local settings before retrying.'});}
});
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT)||4177;server.listen(port,'127.0.0.1',()=>console.log('Second Look: http://127.0.0.1:'+port+' (live mode '+(live?'enabled':'disabled')+')'));}

// Local, in-memory bridge for verified browser-read wiki timelines. No data written to disk.
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
const networkFetch=globalThis.fetch;
const fetch=async(url,options={})=>{
  if(!url.includes('/info/lfs/')&&!url.includes('github-cloud.s3')&&!url.includes('s3.amazonaws.com'))return networkFetch(url,{...options,signal:AbortSignal.timeout(25000)});
  const config=['silent','show-error','location','max-time = 45','url = '+JSON.stringify(url),'request = '+JSON.stringify(options.method||'GET')];
  for(const [k,v] of Object.entries(options.headers||{}))config.push('header = '+JSON.stringify(k+': '+v));
  if(options.body!==undefined)config.push('data-binary = '+JSON.stringify(String(options.body)));
  config.push('write-out = "\\n%{http_code}"');
  const result=spawnSync('curl.exe',['--config','-'],{input:config.join('\n'),encoding:'utf8',maxBuffer:1000000});
  if(result.status!==0)throw Error('LFS transport failed (curl '+result.status+')');
  const pos=result.stdout.lastIndexOf('\n'),status=Number(result.stdout.slice(pos+1)),body=result.stdout.slice(0,pos);
  return {ok:status>=200&&status<300,status,json:async()=>JSON.parse(body)};
};
const repo='buaa-yaoqiu/ForestallBear',nonce=randomBytes(16).toString('hex');
const media=`https://media.githubusercontent.com/media/${repo}/master/`;
const pets=(await(await fetch(media+'data/pets.json')).json()).pets;
const base=n=>n.replace(/（首领形态）$/,'');
function resolve(node){
  let name=node.href?decodeURIComponent(node.href.split('/').pop()):node.name;
  let exact=pets.find(p=>p.name===name);if(exact)return exact.name;
  const matches=pets.filter(p=>base(p.name)===name);if(matches.length===1)return matches[0].name;
  const qualified=pets.filter(p=>p.name.startsWith(node.name+'（')&&node.sub?.includes(p.name.match(/（(.+)）/)?.[1]));
  return qualified.length===1?qualified[0].name:null;
}
async function publish(chains){
  console.log('Reading remote evolution snapshot');
  const previous=await(await fetch(media+'data/evolutions.json',{cache:'no-store'})).json();
  const edges=new Map(),verified=new Set(),unmatched=new Set();
  for(const page of chains)for(const chain of page.chains){let last=null;
    for(const node of chain.nodes){const name=resolve(!node.href&&page.url?{...node,href:page.url}:node);if(!name){unmatched.add(node.name);last=null;continue;}
      verified.add(name);if(!edges.has(name))edges.set(name,new Set());if(last&&last!==name)edges.get(name).add(last);last=name;
    }
  }
  const entries=Object.fromEntries(pets.map(p=>[p.name,verified.has(p.name)?{previous:[...(edges.get(p.name)||[])],verified:true}:previous.entries[p.name]||{previous:[],verified:false}]));
  const data={source:'https://wiki.biligame.com/nrc/精灵图鉴',retrievedAt:new Date().toISOString(),method:'Per-page evolution timeline DOM, all branches, explicit linked forms',entries,unmatched:[...unmatched]};
  const buffer=Buffer.from(JSON.stringify(data));const oid=createHash('sha256').update(buffer).digest('hex');
  const cred=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
  const token=cred.stdout.match(/^password=(.+)$/m)?.[1];if(!token)throw Error('GitHub authentication unavailable');
  console.log('Uploading LFS snapshot: '+buffer.length+' bytes');
  const batch=await fetch(`https://github.com/${repo}.git/info/lfs/objects/batch`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from('buaa-yaoqiu:'+token).toString('base64'),Accept:'application/vnd.git-lfs+json','Content-Type':'application/vnd.git-lfs+json'},body:JSON.stringify({operation:'upload',transfers:['basic'],objects:[{oid,size:buffer.length}]})});
  if(!batch.ok)throw Error('LFS batch '+batch.status);const object=(await batch.json()).objects[0];if(object.error)throw Error(object.error.message);
  if(object.actions?.upload){const action=object.actions.upload;const put=await fetch(action.href,{method:'PUT',headers:action.header,body:buffer});if(!put.ok)throw Error('LFS upload '+put.status);}
  if(object.actions?.verify){const action=object.actions.verify;const check=await fetch(action.href,{method:'POST',headers:{...action.header,'Content-Type':'application/json'},body:JSON.stringify({oid,size:buffer.length})});if(!check.ok)throw Error('LFS verify '+check.status);}
  console.log('Updating remote Git pointer');
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'ForestallBear'};
  const endpoint=`https://api.github.com/repos/${repo}/contents/data/evolutions.json`;
  const old=await(await fetch(endpoint,{headers})).json();
  const pointer=`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${buffer.length}\n`;
  const result=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify({message:'Update evolution chains from verified wiki page timelines',sha:old.sha,content:Buffer.from(pointer).toString('base64')})});if(!result.ok)throw Error('GitHub update '+result.status);
  return {verified:Object.values(entries).filter(e=>e.verified).length,total:pets.length,withPrevious:Object.values(entries).filter(e=>e.previous.length).length,unmatched:[...unmatched],commit:(await result.json()).commit.sha};
}
createServer(async(req,res)=>{
  if(req.url!=='/'+nonce){res.writeHead(404);res.end();return;}
  if(req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<form method="post"><label>WIKI进化链数据<textarea name="chains" style="width:90vw;height:60vh"></textarea></label><button>上传已核实进化链</button></form>');return;}
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>5000000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  try{const input=new URLSearchParams(Buffer.concat(chunks).toString());const result=await publish(JSON.parse(input.get('chains')));res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(JSON.stringify(result));console.log(JSON.stringify(result));}catch(e){console.log('Import error: '+e.message);res.writeHead(500);res.end(e.message);}
}).listen(4174,'127.0.0.1',()=>console.log('Import URL: http://127.0.0.1:4174/'+nonce));

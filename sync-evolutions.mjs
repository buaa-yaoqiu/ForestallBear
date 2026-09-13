// Fetch in memory and publish directly to GitHub; no local data files.
import {spawnSync} from 'node:child_process';
const repository='buaa-yaoqiu/ForestallBear';
const response=await fetch(`https://media.githubusercontent.com/media/${repository}/master/data/pets.json`,{cache:'no-store'});
if(!response.ok)throw Error('Cannot load remote catalog');
const {pets}=await response.json();
const decode=s=>s.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim();
const base=name=>name.replace(/（[^）]*）/g,'').trim();
const byBase=new Map();for(const p of pets){const key=base(p.name);byBase.set(key,[...(byBase.get(key)||[]),p.name]);}
const edges=new Map(),seen=new Set(),failures=[];
const names=[...byBase.keys()];let cursor=0,done=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<names.length){const name=names[cursor++];
  try {
    const url='https://wiki.biligame.com/nrc/'+encodeURIComponent(name);
    const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(String(r.status));
    const html=await r.text();
    const section=html;
    const branches=section.split(/<div class="roco-evo-timeline[^>]*>/).slice(1);
    for(const branch of branches){let previous=[];
      for(const node of branch.split(/<div class="roco-evo-node[^>]*>/).slice(1)){
        const raw=decode(node.match(/class="roco-evo-name-main">([\s\S]*?)<\/div>/)?.[1]||'');
        const sub=decode(node.match(/class="roco-evo-name-sub">([\s\S]*?)<\/div>/)?.[1]||'');
        let candidates=byBase.get(raw)||[];
        const explicit=candidates.filter(n=>n.includes('（')&&sub.includes(n.match(/（(.*?)）/)?.[1]));
        if(explicit.length)candidates=explicit;
        else if(candidates.includes(raw))candidates=[raw];
        else if(candidates.length!==1)candidates=[];
        for(const candidate of candidates){seen.add(candidate);if(!edges.has(candidate))edges.set(candidate,new Set());for(const prev of previous)if(prev!==candidate)edges.get(candidate).add(prev);}
        previous=candidates;
      }
    }
  }catch(error){failures.push({name,error:error.message});}
  done++;if(done%50===0)console.log(`Evolution pages ${done}/${names.length}`);
}}));
const entries=Object.fromEntries(pets.map(p=>[p.name,{previous:[...(edges.get(p.name)||[])],verified:seen.has(p.name)}]));
const data={source:'https://wiki.biligame.com/nrc',retrievedAt:new Date().toISOString(),entries,failures};
if(seen.size<100)throw Error('Insufficient verified pages; refusing to replace remote snapshot');
console.log(JSON.stringify({pets:pets.length,verified:seen.size,withPrevious:[...edges.values()].filter(v=>v.size).length,failedPages:failures.length}));
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
const token=credential.stdout?.match(/^password=(.+)$/m)?.[1];if(!token)throw Error('GitHub authentication unavailable');
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json','User-Agent':'ForestallBear-data-sync'};
const url=`https://api.github.com/repos/${repository}/contents/data/evolutions.json`;
const old=await fetch(url,{headers});const sha=old.ok?(await old.json()).sha:undefined;
if(!old.ok&&old.status!==404)throw Error('Cannot check remote evolution file');
const result=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Add verified wiki evolution links for morph mechanic',content:Buffer.from(JSON.stringify(data)).toString('base64'),sha})});
if(!result.ok)throw Error(`Publish failed ${result.status}`);
console.log('Evolution mapping published directly to GitHub.');

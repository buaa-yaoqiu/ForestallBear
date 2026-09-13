import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {pets}=require('./engine.js');
const images={};
await mkdir('assets',{recursive:true});
let imageCursor=0,completed=0;
await Promise.all(Array.from({length:8},async()=>{while(imageCursor<pets.length){const pet=pets[imageCursor++];
  const path=`assets/${pet.name}.png`;
  let data;
  try{data=await readFile(path);}catch{
    let response;for(let attempt=0;attempt<3;attempt++){try{response=await fetch(pet.image,{signal:AbortSignal.timeout(30000)});if(response.ok)break;}catch(error){if(attempt===2)throw error;}}
    if(!response)throw Error(`Missing image: ${pet.name}`);
    if(!response.ok)throw Error(`Image fetch failed: ${pet.name} ${response.status}`);
    data=Buffer.from(await response.arrayBuffer());
    if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Not PNG: ${pet.name}`);
    await writeFile(path,data);
  }
  let portrait,mime;
  try {portrait=await readFile(`assets/thumbs/${pet.name}.webp`);mime='image/webp';}
  catch {portrait=data;mime='image/png';}
  images[pet.name]=`data:${mime};base64,${portrait.toString('base64')}`;
  completed++;if(completed%100===0)console.log(`Images ${completed}/${pets.length}`);
}}));
images.logo=`data:image/jpeg;base64,${(await readFile('先发拿下.jpg')).toString('base64')}`;
for(const name of ['先发拿下','大发雷霆','冰点你咯'])images[name]=`data:image/jpeg;base64,${(await readFile(name+'.jpg')).toString('base64')}`;
const assets=`globalThis.BEAR_ASSETS=${JSON.stringify(images)};`;
await writeFile('assets.js',assets);
let html=await readFile('index.html','utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${''}</style>`);
const css=await readFile('style.css','utf8');
html=html.replace('<style></style>',()=>`<style>${css}</style>`);
for(const file of ['assets.js','data/pets.js','engine.js','app.js']){
  const source=await readFile(file,'utf8');
  html=html.replace(`<script src="${file}"></script>`,()=>`<script>${source.replace(/<\/script/gi,'<\\/script')}</script>`);
}
await mkdir('dist',{recursive:true});
await writeFile('dist/月牙雪熊斩杀计算器.html',html);
console.log(`Built offline HTML (${(Buffer.byteLength(html)/1024).toFixed(0)} KB), ${pets.length} embedded pet images.`);

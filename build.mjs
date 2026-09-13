import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {pets}=require('./engine.js');
const images={};
await mkdir('assets',{recursive:true});
for(const pet of pets){
  const path=`assets/${pet.name}.png`;
  let data;
  try{data=await readFile(path);}catch{
    const response=await fetch(pet.image,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`Image fetch failed: ${pet.name} ${response.status}`);
    data=Buffer.from(await response.arrayBuffer());
    if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Not PNG: ${pet.name}`);
    await writeFile(path,data);
  }
  images[pet.name]=`data:image/png;base64,${data.toString('base64')}`;
}
images.logo=`data:image/jpeg;base64,${(await readFile('先发拿下.jpg')).toString('base64')}`;
for(const name of ['先发拿下','大发雷霆','冰点你咯'])images[name]=`data:image/jpeg;base64,${(await readFile(name+'.jpg')).toString('base64')}`;
const assets=`globalThis.BEAR_ASSETS=${JSON.stringify(images)};`;
await writeFile('assets.js',assets);
let html=await readFile('index.html','utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${''}</style>`);
const css=await readFile('style.css','utf8');
html=html.replace('<style></style>',()=>`<style>${css}</style>`);
for(const file of ['assets.js','engine.js','app.js']){
  const source=await readFile(file,'utf8');
  html=html.replace(`<script src="${file}"></script>`,()=>`<script>${source.replace(/<\/script/gi,'<\\/script')}</script>`);
}
await mkdir('dist',{recursive:true});
await writeFile('dist/月牙雪熊斩杀计算器.html',html);
console.log(`Built offline HTML (${(Buffer.byteLength(html)/1024).toFixed(0)} KB), ${pets.length} embedded pet images.`);

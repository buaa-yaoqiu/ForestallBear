import {readFile,writeFile,mkdir} from 'node:fs/promises';
const images={};
for(const name of ['先发拿下','大发雷霆','冰点你咯'])images[name]='data:image/jpeg;base64,'+(await readFile(name+'.jpg')).toString('base64');
images.logo=images['先发拿下'];
await writeFile('assets.js','globalThis.BEAR_ASSETS='+JSON.stringify(images)+';');
const css=await readFile('style.css','utf8');
let html=await readFile('index.html','utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+''+'</style>');
html=html.replace('<style></style>',()=>'<style>'+css+'</style>');
for(const file of ['assets.js','engine.js','app.js','bootstrap.js']){const source=await readFile(file,'utf8');html=html.replace('<script src="'+file+'"></script>',()=>'<script>'+source.split('</script').join('<\\/script')+'</script>');}
await mkdir('dist',{recursive:true});
await writeFile('dist/月牙雪熊斩杀计算器.html',html);
console.log('Built remote-data page: '+Math.round(Buffer.byteLength(html)/1024)+' KB (emotes only).');

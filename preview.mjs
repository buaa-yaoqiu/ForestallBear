// Preview only the deliverable on loopback; no filesystem browsing or arbitrary paths.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
createServer(async (req,res)=>{
  if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404);res.end();return;}
  try {
    const html=await readFile(new URL('./dist/月牙雪熊斩杀计算器.html',import.meta.url));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
  } catch {res.writeHead(503);res.end('Build in progress');}
}).listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173 (single HTML only)'));

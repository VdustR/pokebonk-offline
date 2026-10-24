import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
const root=path.resolve(process.argv[2]??'build/game');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.woff':'font/woff','.woff2':'font/woff2','.ogg':'audio/ogg','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(url.pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||req.method!=='GET'){res.writeHead(403);res.end();return;}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT??8098),'127.0.0.1',()=>console.log('PokéBonk SPA ready; all saves are browser-local.'));

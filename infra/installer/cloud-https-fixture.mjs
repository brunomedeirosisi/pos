import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { createPrivateKey, createHash } from 'node:crypto';
import { readFile, writeFile, appendFile, access } from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2];
const config=JSON.parse(await readFile(path.join(directory,'fixture.json'),'utf8'));
const key=createPrivateKey({key:config.key,format:'jwk'}).export({type:'pkcs8',format:'pem'});
const cert='-----BEGIN CERTIFICATE-----\n'+config.certificate+'\n-----END CERTIFICATE-----';
const sockets=new Set();
const track=socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));};
const server=https.createServer({key,cert,minVersion:'TLSv1.2',maxVersion:'TLSv1.2'},async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=Buffer.concat(chunks).toString();
  const mode=req.headers['x-test-mode']??'valid';
  await appendFile(path.join(directory,'requests.jsonl'),JSON.stringify({path:req.url,method:req.method,mode,tls:req.socket.getProtocol(),bodySha256:createHash('sha256').update(body).digest('hex')})+'\n');
  if(mode==='redirect'){res.writeHead(req.method==='POST'?307:302,{location:'https://loja.example.com/sink','content-type':'application/json'});res.end('{}');return;}
  if(mode==='large'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({padding:'x'.repeat(70000)}));return;}
  if(mode==='html'){res.writeHead(200,{'content-type':'text/html'});res.end('<html>not a POS</html>');return;}
  if(mode==='invalid-json'){res.writeHead(200,{'content-type':'application/json'});res.end('{');return;}
  if(mode==='forbidden'){res.writeHead(403,{'content-type':'application/json'});res.end(body);return;}
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify(req.url==='/api/v1/store-info'?{store_id:config.storeId,print_mode:'queue'}:{store_id:config.storeId,printer_id:config.printerId,display_name:'Synthetic cloud printer'}));
});
server.on('connection',track);server.on('tlsClientError',()=>{});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const proxy=http.createServer();
proxy.on('connect',(req,socket)=>{
  track(socket);
  if(!['loja.example.com:443','other.example.com:443'].includes(req.url)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  const upstream=net.connect(server.address().port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');socket.pipe(upstream);upstream.pipe(socket);});
  track(upstream);upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
await writeFile(path.join(directory,'ready.json'),JSON.stringify({proxyPort:proxy.address().port}));
const timer=setInterval(async()=>{if(await access(path.join(directory,'stop')).then(()=>true,()=>false)){clearInterval(timer);for(const socket of sockets)socket.destroy();proxy.close();server.close();}},100);

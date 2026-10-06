/** Live HTTP acceptance against our already-running demo only; no cloud calls. */
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdir,writeFile,readFile} from 'node:fs/promises';

const base=process.env.BOOTH_TEST_URL || 'http://127.0.0.1:4377';
async function api(url,body){
 const response=await fetch(base+url,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal(response.status,200,`${url}: ${response.status}`);
 return response.json();
}
const health=await api('/api/health');
assert.equal(health.mode,'demo','Never run live smoke against a paid provider');
const styles=await api('/api/styles');
const bundled=JSON.parse(await readFile('config/styles/styles.json','utf8'));
assert.equal(styles.length,bundled.filter(style=>style.enabled).length);
for (const expected of bundled.filter(style=>style.enabled && style.exampleUrl.endsWith('.webp'))) {
 const style=styles.find(s=>s.id===expected.id); assert.ok(style);
 const cover=await fetch(base+style.exampleUrl); assert.equal(cover.status,200);
 assert.ok((await sharp(Buffer.from(await cover.arrayBuffer())).metadata()).width >= 600);
}
const photo=await sharp('assets/examples/film-v2.webp').resize({width:640}).jpeg().toBuffer();
const session=await api('/api/sessions',{styleId:styles[0].id});
await api(`/api/sessions/${session.id}/photo`,{dataUrl:`data:image/jpeg;base64,${photo.toString('base64')}`,orientation:'portrait'});
const started=await api(`/api/sessions/${session.id}/generate`,{});assert.ok(started.pickupUrl);
let ready;
for(let i=0;i<60;i++){
 ready=await api(`/api/sessions/${session.id}`);
 if(ready.status!=='generating')break;
 await new Promise(resolve=>setTimeout(resolve,100));
}
assert.equal(ready.status,'ready');assert.equal(ready.images.length,1);
const preview=await fetch(base+ready.images[0].previewUrl);assert.equal(preview.status,200);
const token=new URL(ready.pickupUrl).pathname.split('/').at(-1);
const pickup=await api(`/api/pickup/${token}`);assert.equal(pickup.images.length,1);
const lanPickup=await fetch(`${health.pickupBaseUrl}/api/pickup/${token}`);
assert.equal(lanPickup.status,200,'Pickup API accepts LAN Host');
const lanAdmin=await fetch(`${health.pickupBaseUrl}/api/admin`);
assert.equal(lanAdmin.status,403,'Admin API is not exposed on LAN Host');
const full=await fetch(base+pickup.images[0].downloadUrl);assert.equal(full.status,200);
const forbidden=await fetch(`${base}/api/pickup/${token}/images/${'not-this-session'}`);assert.equal(forbidden.status,404);
await api(`/api/sessions/${session.id}/end`,{});
assert.equal((await api(`/api/pickup/${token}`)).images.length,1);
await mkdir('docs/evidence',{recursive:true});
await writeFile('docs/evidence/demo-preview.jpg',Buffer.from(await preview.arrayBuffer()));
const report={at:new Date().toISOString(),mode:health.mode,checks:['HTTP health / styles','JPEG upload of generated reference artwork (no personal photo)','1 demo result + free original','pickup link issued at generation','image download 200','other image download 404','pickup survives session end','LAN address pickup 200 / admin 403 (same machine only)'],status:'passed',limitations:['Not a browser interaction test','No actual camera','No phone test','No Seedream call']};
await writeFile('docs/evidence/live-http.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

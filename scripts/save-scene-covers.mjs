import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const base='docs/sources/prompt-import-2026-09-29';
const jobs=JSON.parse(readFileSync(base+'/cover-jobs.json','utf8'));
mkdirSync(base+'/covers',{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const images=[];
for(const job of jobs){
 const raw=readFileSync(job.source),sha256=hash(raw);
 const original=`${base}/covers/scene-${job.code.toLowerCase()}.png`;
 const cover=`assets/examples/scene-${job.code.toLowerCase()}.webp`;
 if(existsSync(original)&&hash(readFileSync(original))!==sha256)throw Error('Refuse replacing original '+original);
 if(!existsSync(original))copyFileSync(job.source,original);
 const metadata=await sharp(raw).metadata();
 await sharp(raw).resize({width:1200,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:91}).toFile(cover);
 writeFileSync(original.replace('.png','-prompt.txt'),job.prompt);
 images.push({code:job.code,provider:job.provider,original,cover,source:job.source,width:metadata.width,height:metadata.height,sha256,promptSha256:hash(job.prompt),coverSha256:hash(readFileSync(cover))});
}
writeFileSync(base+'/covers/manifest.json',JSON.stringify({images},null,2)+'\n');
console.log({saved:images.length,codes:images.map(x=>x.code)});

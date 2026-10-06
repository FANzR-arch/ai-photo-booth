// Package original Codex images with prompts, hashes, a local gallery, and an overview.
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const dir=dirname(fileURLToPath(import.meta.url));
const {jobs}=JSON.parse(readFileSync(join(dir,'generation-jobs.json'),'utf8'));
const sources=JSON.parse(readFileSync(join(dir,'source-map.json'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const images=[];
for(const job of jobs){
  const source=sources[job.code];
  if(!source)continue;
  const raw=readFileSync(source),sha256=hash(raw);
  const filename='scene-'+job.code+'.png',target=join(dir,filename);
  if(existsSync(target)&&hash(readFileSync(target))!==sha256)throw Error('Refusing to replace '+target);
  if(!existsSync(target))copyFileSync(source,target);
  const metadata=await sharp(raw).metadata();
  writeFileSync(join(dir,'scene-'+job.code+'-prompt.txt'),job.generationPrompt,'utf8');
  images.push({code:job.code,title:job.name,provider:'codex-imagegen',source,file:filename,
    width:metadata.width,height:metadata.height,bytes:raw.length,sha256,
    promptFile:'scene-'+job.code+'-prompt.txt',promptSha256:hash(job.generationPrompt),
    originalPromptFile:job.file,visualReview:'reviewed in chat'});
}
writeFileSync(join(dir,'manifest.json'),JSON.stringify({date:'2026-10-06',purpose:'fictional adult photography style samples',images},null,2)+'\n');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const cards=images.map(i=>'<figure><a href="'+i.file+'"><img loading="lazy" src="'+i.file+'" alt="'+escape(i.title)+'"></a><figcaption><b>'+escape(i.title)+'</b><small>'+i.width+' × '+i.height+' · <a href="'+i.promptFile+'">本次提示词</a> · <a href="'+i.file+'">PNG 原图</a></small></figcaption></figure>').join('\n');
writeFileSync(join(dir,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新风格场景样片 11–30</title><style>*{box-sizing:border-box}body{margin:0;padding:40px;background:#eeeae4;color:#282522;font:16px/1.6 system-ui,sans-serif}header{max-width:1600px;margin:0 auto 32px}h1{font-size:30px;margin:0 0 8px}p{margin:0;color:#67625b}main{max-width:1600px;margin:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:28px}figure{margin:0}img{display:block;width:100%;height:420px;object-fit:contain;background:#dfdad3}figcaption{padding-top:12px}b{display:block;font-size:15px}small{display:block;margin-top:4px;font-size:12px;color:#777}a{color:inherit}footer{max-width:1600px;margin:36px auto 0;color:#777;font-size:13px}</style><header><h1>新风格场景样片 11–30</h1><p>2026-10-06 · Codex 内置生图 · '+images.length+'/20 张 · 虚构成年模特。点击图片查看原图。</p></header><main>'+cards+'</main><footer>这是摄影风格样片，未验证 Seedream 真人身份保持效果。原始提示词与本次生成提示词分别保留。</footer></html>','utf8');
const cols=5,cellW=250,cellH=355,margin=20,rows=Math.ceil(images.length/cols);
const layers=[];
for(let n=0;n<images.length;n++){
  const i=images[n],left=margin+(n%cols)*cellW,top=margin+Math.floor(n/cols)*cellH;
  layers.push({input:await sharp(join(dir,i.file)).resize(230,310,{fit:'contain',background:'#e7e1d8'}).png().toBuffer(),left,top});
  layers.push({input:Buffer.from('<svg width="230" height="32"><text x="8" y="24" font-size="19" font-family="Arial" fill="#35302a">'+i.code+'</text></svg>'),left,top:top+315});
}
await sharp({create:{width:cols*cellW+margin*2,height:rows*cellH+margin*2,channels:3,background:'#f1ede6'}}).composite(layers).png().toFile(join(dir,'overview.png'));
console.log(JSON.stringify({saved:images.length,codes:images.map(i=>i.code),dimensions:images.map(i=>[i.code,i.width,i.height])}));

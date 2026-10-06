// Reuse the kids-cover archive/encode/manifest workflow for the 46 portrait revisions.
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
const base='docs/sources/portrait-covers-2026-10';
const jobs=JSON.parse(readFileSync(base+'/generation-jobs.json','utf8'));
const status='Original illustrations of fictional people, not verified Seedream results';
const hash=v=>createHash('sha256').update(v).digest('hex');
const manifestPath=base+'/manifest.json';
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{source:'Codex built-in imagegen',tool:'built-in imagegen',status,images:[]};
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const [mode]=process.argv.slice(2);
if(mode==='--batch'){
 const sources=JSON.parse(readFileSync(base+'/sources.json','utf8'));
 for(const job of jobs){
  const record=sources[job.id];
  if(!record)continue;
  const raw=readFileSync(record.source),sha256=hash(raw);
  const prior=manifest.images.find(i=>i.id===job.id);
  if(prior?.sha256===sha256&&prior.review.notes===record.notes)continue;
  const original=base+'/'+job.id+'.png',promptPath=base+'/'+job.id+'-prompt.txt';
  if(existsSync(original)&&hash(readFileSync(original))!==sha256){
   const rejected=base+'/rejected';
   mkdirSync(rejected,{recursive:true});
   const previous=hash(readFileSync(original)).slice(0,12);
   copyFileSync(original,rejected+'/'+job.id+'-'+previous+'.png');
   if(prior)writeFileSync(rejected+'/'+job.id+'-'+previous+'.json',JSON.stringify(prior,null,2)+'\n');
  }
  copyFileSync(record.source,original);
  writeFileSync(promptPath,job.prompt,'utf8');
  const meta=await sharp(raw).metadata();
  if(meta.format!=='png')throw Error('Expected generated PNG for '+job.id);
  let encoded,quality=88;
  do{
   encoded=await sharp(raw).resize(720,960,{fit:'cover',position:'centre'}).webp({quality}).toBuffer();
   if(encoded.length<=160000)break;
   quality-=2;
  }while(quality>=60);
  if(encoded.length>160000)throw Error('Cover exceeds 160 KB: '+job.id);
  writeFileSync(job.cover,encoded);
  const entry={id:job.id,themeId:job.themeId,name:job.name,purpose:job.purpose,subject:job.subject,subjectCount:job.subjectCount,
   source:record.source,original,cover:job.cover,width:meta.width,height:meta.height,sha256,coverSha256:hash(encoded),
   prompt:job.prompt,coverPrompt:job.prompt,promptSha256:hash(job.prompt),status,coverWidth:720,coverHeight:960,coverBytes:encoded.length,quality,
   oldExampleUrl:job.oldExampleUrl,oldExampleUrls:job.oldExampleUrls,
   review:{status:record.passed?'passed':'pending',notes:record.notes,method:'Individual visual inspection of generated original and final cover overview',gaze:job.gaze}};
  manifest.images=[...manifest.images.filter(i=>i.id!==job.id),entry].sort((a,b)=>jobs.findIndex(j=>j.id===a.id)-jobs.findIndex(j=>j.id===b.id));
 }
 manifest.summary={themes:36,images:manifest.images.length,reviewedImages:manifest.images.filter(i=>i.review.status==='passed').length,coverBytes:manifest.images.reduce((n,i)=>n+i.coverBytes,0)};
 writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(manifest.summary));
}else if(mode==='--overview'){
 if(manifest.images.length!==46||manifest.images.some(i=>i.review.status!=='passed'))throw Error('Require all 46 individually reviewed images');
 const images=manifest.images,cols=8,tw=216,th=288,label=54,gap=16,margin=24,header=88;
 const width=margin*2+cols*tw+(cols-1)*gap,height=header+Math.ceil(images.length/cols)*(th+label+gap)+margin;
 const layers=[{input:Buffer.from('<svg width="'+width+'" height="'+header+'"><text x="24" y="36" font-size="28" font-family="Microsoft YaHei" fill="#252525">旧主题封面重做 · 36 个主题 / 46 张</text><text x="24" y="65" font-size="17" font-family="Microsoft YaHei" fill="#666">Codex 内置生图 · 原创虚构人物 · 非 Seedream 实测</text></svg>'),left:0,top:0}];
 for(let n=0;n<images.length;n++){
  const i=images[n],left=margin+(n%cols)*(tw+gap),top=header+Math.floor(n/cols)*(th+label+gap);
  layers.push({input:await sharp(i.cover).resize(tw,th).png().toBuffer(),left,top});
  layers.push({input:Buffer.from('<svg width="'+tw+'" height="'+label+'"><text x="8" y="20" font-size="15" font-family="Consolas" fill="#333">'+i.id+'</text><text x="8" y="43" font-size="16" font-family="Microsoft YaHei" fill="#333">'+escape(i.name)+(i.id.startsWith('self-')?(i.id.endsWith('-a')?' · 女':' · 男'):'')+'</text></svg>'),left,top:top+th});
 }
 await sharp({create:{width,height,channels:3,background:'#faf8f4'}}).composite(layers).png().toFile(base+'/overview.png');
 const pairs=4,bw=144,bh=192,pairGap=12,groupGap=24,bl=56;
 const bwidth=margin*2+pairs*(bw*2+pairGap)+(pairs-1)*groupGap,bheight=header+Math.ceil(images.length/pairs)*(bh+bl+gap)+margin;
 const beforeLayers=[{input:Buffer.from('<svg width="'+bwidth+'" height="'+header+'"><text x="24" y="36" font-size="27" font-family="Microsoft YaHei" fill="#252525">封面新旧对比 · 每组左旧 / 右新</text><text x="24" y="65" font-size="17" font-family="Microsoft YaHei" fill="#666">旧稿只作对比保留，右侧为本次最终封面</text></svg>'),left:0,top:0}];
 for(let n=0;n<images.length;n++){
  const i=images[n],j=jobs.find(j=>j.id===i.id),urls=j.oldExampleUrls??[j.oldExampleUrl];
  const oldUrl=urls[i.id.endsWith('-b')?1:0]??urls[0];
  const left=margin+(n%pairs)*(bw*2+pairGap+groupGap),top=header+Math.floor(n/pairs)*(bh+bl+gap);
  const old=base+'/before/'+path.basename(oldUrl);
  beforeLayers.push({input:await sharp(old).resize(bw,bh,{fit:'contain',background:'#e8e3dc'}).png().toBuffer(),left,top});
  beforeLayers.push({input:await sharp(i.cover).resize(bw,bh).png().toBuffer(),left:left+bw+pairGap,top});
  beforeLayers.push({input:Buffer.from('<svg width="'+(bw*2+pairGap)+'" height="'+bl+'"><text x="4" y="21" font-size="15" font-family="Consolas" fill="#333">'+i.id+'</text><text x="4" y="45" font-size="16" font-family="Microsoft YaHei" fill="#333">'+escape(i.name)+'</text></svg>'),left,top:top+bh});
 }
 await sharp({create:{width:bwidth,height:bheight,channels:3,background:'#faf8f4'}}).composite(beforeLayers).png().toFile(base+'/before-after.png');
 const cards=images.map(i=>'<figure><a href="'+i.id+'.png"><img loading="lazy" src="../../../'+i.cover+'" alt="'+escape(i.name)+'"></a><figcaption><b>'+i.id+' · '+escape(i.name)+'</b><small><a href="'+i.id+'.png">PNG 原图</a> · <a href="'+i.id+'-prompt.txt">本次提示词</a></small></figcaption></figure>').join('');
 writeFileSync(base+'/index.html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>旧主题封面重做 · 46 张</title><style>*{box-sizing:border-box}body{margin:0;padding:36px;background:#f5f2ec;color:#282522;font:16px/1.6 system-ui,sans-serif}header,main,footer{max-width:1760px;margin:auto}h1{font-size:30px;margin:0 0 8px}header p{color:#746e65;margin:0 0 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:24px}figure{margin:0}img{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#dfdad3}figcaption{padding-top:10px}b{display:block;font-size:14px}small{display:block;font-size:12px;color:#777}a{color:inherit}footer{padding-top:32px;color:#777;font-size:13px}</style><header><h1>旧主题封面重做</h1><p>36 个主题 · 46 张 · 2026-10-06 · <a href="overview.png">总览</a> · <a href="before-after.png">新旧对比</a></p></header><main>'+cards+'</main><footer>原创虚构人物风格样片，使用 Codex 内置生图；未经 Seedream 真人生成验证。</footer></html>','utf8');
 console.log(JSON.stringify({overview:base+'/overview.png',beforeAfter:base+'/before-after.png',gallery:base+'/index.html',images:images.length}));
}else throw Error('Usage: node scripts/save-portrait-covers.mjs --batch | --overview');

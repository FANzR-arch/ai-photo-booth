import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6)??'seedream-scenes-2026-09-29';
if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(run)) throw Error('Invalid run name');
const dir=path.resolve('docs/evidence',run);
const input=JSON.parse(readFileSync(path.join(dir,'input.json'),'utf8'));
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const all=readdirSync(dir).filter(f=>/^\d\d[A-Z]?-hq(?:-v\d+)?\.json$/.test(f)).map(f=>JSON.parse(readFileSync(path.join(dir,f),'utf8'))).filter(e=>e.status==='succeeded').sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
const entries=[...new Map(all.map(e=>[e.code,e])).values()].sort((a,b)=>a.code.localeCompare(b.code));
if(!entries.length) throw Error('No completed scenes in this run');
const cols=Math.min(4,entries.length), w=360;
const rowHeights=Array.from({length:Math.ceil(entries.length/cols)},(_,row)=>Math.max(...entries.slice(row*cols,(row+1)*cols).map(e=>Math.min(470,Math.round(340*e.height/e.width))))+60);
const rowTops=rowHeights.map((_,row)=>rowHeights.slice(0,row).reduce((a,b)=>a+b,0));
const images=[];
for(let i=0;i<entries.length;i++){
 const e=entries[i];
 const row=Math.floor(i/cols), imageHeight=rowHeights[row]-60;
 const img=await sharp(path.join(dir,e.output)).resize(340,imageHeight,{fit:'contain',background:'#eeeae3'}).toBuffer();
 const label=Buffer.from(`<svg width="360" height="50"><rect width="360" height="50" fill="#eeeae3"/><text x="12" y="23" font-family="Arial" font-size="19" fill="#212520">${e.code} · ${e.width} × ${e.height}</text></svg>`);
 images.push({input:img,left:(i%cols)*w+10,top:rowTops[row]+10},{input:label,left:(i%cols)*w,top:rowTops[row]+imageHeight+10});
}
await sharp({create:{width:w*cols,height:rowHeights.reduce((a,b)=>a+b,0),channels:3,background:'#eeeae3'}}).composite(images).jpeg({quality:94}).toFile(path.join(dir,'contact-sheet.jpg'));
// Same pixels, same crop and display size: isolate preview encoding from generation randomness.
const sample=entries.find(e=>e.code==='02A');
if(sample){
 const crop={left:340,top:240,width:640,height:640};
 const low=await sharp(path.join(dir,sample.id+'-old-preview.jpg')).resize(sample.width,sample.height).toBuffer();
 const high=await sharp(path.join(dir,sample.id+'-preview.jpg')).resize(sample.width,sample.height).toBuffer();
 const parts=await Promise.all([low,high].map(b=>sharp(b).extract(crop).toBuffer()));
 const labels=Buffer.from('<svg width="1280" height="52"><rect width="1280" height="52" fill="#eeeae3"/><g fill="#292d29" font-size="22" font-family="Arial"><text x="16" y="34">OLD PREVIEW / 600 x 800 / JPEG 75</text><text x="656" y="34">NEW PREVIEW / 1200 x 1600 / JPEG 92</text></g></svg>');
 await sharp({create:{width:1280,height:692,channels:3,background:'#eeeae3'}}).composite([{input:labels,left:0,top:0},{input:parts[0],left:0,top:52},{input:parts[1],left:640,top:52}]).png().toFile(path.join(dir,'preview-detail-comparison.png'));
}
const cards=entries.map(e=>`<article><header><b>${e.code} ${e.name}</b><span>${e.width} × ${e.height} · ${(e.elapsedMs/1000).toFixed(1)} s</span></header><a href="${e.rawFile}" target="_blank"><img src="${e.output}" loading="lazy"></a><p><a href="${e.rawFile}" download>下载上游原图</a> · <a href="${e.id}-prompt.txt">实际提示词</a></p><details><summary>比较同一成片的旧预览与新预览</summary><div class="compare"><figure><img src="${e.id}-old-preview.jpg"><figcaption>旧：600×800 内 / JPEG 75</figcaption></figure><figure><img src="${e.id}-preview.jpg"><figcaption>新：1600×1600 内 / JPEG 92 · 4:4:4</figcaption></figure></div><p>同一张成片，仅预览编码不同；请在桌面浏览器放大比较。点击上方大图看原尺寸。</p></details></article>`).join('');
writeFileSync(path.join(dir,'review.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${entries.length} 个单人模板实测</title><style>body{margin:0;background:#eeeae3;color:#252a26;font:16px/1.6 system-ui}main{max-width:1500px;margin:auto;padding:30px}h1{font-size:34px;font-weight:500}a{color:#8a3d28}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:22px}article{padding:16px;background:#fffdf7;border:1px solid #d8d5ca;border-radius:8px}header{display:flex;flex-direction:column;margin-bottom:14px}header span{font-size:13px;color:#777}img{width:100%;height:auto;display:block}article>a>img{height:440px;object-fit:contain;background:#e5e1d8}details{border-top:1px solid #ddd;padding-top:12px;font-size:13px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:8px}figure{margin:12px 0}.source{width:150px;float:right;margin:0 0 20px 20px}p{font-size:14px}</style><main><img class="source" src="input.jpg" alt="本轮参考照片"><h1>${entries.length} 个单人模板 · Seedream 实测</h1><p>批次：${escape(run)}。本次归一化底图 ${input.width}×${input.height}，不插值放大；输出约 220 万像素。高分辨率输出不代表恢复了原图缺失的真实细节。</p><p>5 个双人模板继续暂留。实测图片只保存在本地评审目录，不进入公共模板封面，不适用拍照亭的 10 分钟清理。</p><p>模型：${escape(input.model)}。采用自动适配造型的提示词，未额外传入性别标签。人物表情、动作、道具和文字仍需要逐图确认。</p><p><a href="contact-sheet.jpg">查看总览</a> · <a href="input.jpg">查看输入</a>${existsSync(path.join(dir,'01-baseline.jpg'))?' · <a href="01-baseline.jpg">成人礼旧尺寸对照</a>':''}${existsSync(path.join(dir,'report.md'))?' · <a href="report.md">质感评审记录</a>':''}</p><section>${cards}</section></main></html>`);
console.log({completed:entries.length,contactSheet:path.join(dir,'contact-sheet.jpg'),review:path.join(dir,'review.html')});

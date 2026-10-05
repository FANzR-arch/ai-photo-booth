import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { importedScenes, adaptScenePrompt } from '../packages/shared/imported-scenes';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { orientedSize, orientationRatio } from '../packages/shared/photo-orientation';
import { generationPrompt } from '../apps/server/generation-prompt';
import { normalizeSourcePhoto, fullPhoto, previewPhoto } from '../apps/server/photo-quality';
import type { Style } from '../packages/shared/types';
const styles:Style[]=JSON.parse(readFileSync('config/styles/styles.json','utf8'));

test('imported scenes keep source provenance and physical actions while softening expressive faces', () => {
 const sourceDir='docs/sources/prompt-import-2026-09-29/单张照片提示词';
 for(const scene of importedScenes){
  const filename=readdirSync(sourceDir).find(name=>name.startsWith(scene.code+'｜'))!;
  const source=readFileSync(path.join(sourceDir,filename),'utf8');
  const style=styles.find(s=>s.id===scene.id)!;
  assert.equal(style.prompt,adaptScenePrompt(source,scene.people,scene.code),scene.id);
  assert.doesNotMatch(style.prompt!,/露上排牙齿|露出整齐上排牙齿|露齿灿烂微笑|开心露齿微笑|嘴巴自然张开|眼睛睁大，嘴形成自然的小O形|像做一个俏皮亲吻表情/,scene.id);
 }
 const prompt=(id:string)=>styles.find(s=>s.id===id)!.prompt!;
 assert.match(prompt('island-surprise'),/两只手的食指都指向自己的胸口/);
 assert.match(prompt('island-coconut'),/食指指向观看者/);
 assert.match(prompt('wedding-bride'),/分别叉在两侧腰部/);
});

test('all kept source scenes exist once and are available; scenes without covers are retired',()=>{
 assert.equal(importedScenes.length,12);
 assert.equal(importedScenes.filter(s=>s.people===1).length,12);
 const retired=JSON.parse(readFileSync('config/styles/retired-styles.json','utf8'));
 for(const id of ['wedding-flash','film-street-couple','film-surf-couple','wedding-heart-couple','mirror-couple','city','brand']){assert.ok(Object.hasOwn(retired,id),id);assert.equal(styles.some(s=>s.id===id),false,id);}
 for(const scene of importedScenes){
  const matches=styles.filter(s=>s.id===scene.id);assert.equal(matches.length,1);
  const style=matches[0];assert.equal(style.enabled,scene.people===1);assert.equal(style.sceneOrientation,scene.orientation);
  const prompt=generationPrompt(style,'theme',scene.orientation);
  assert.doesNotMatch(prompt,/参考图[123]|以上一张|与上一张|没有指定文字的场景一律有字/);
  assert.match(prompt,/年龄感/);assert.match(prompt,/自然细纹/);
  assert.match(prompt,/只生成本场景明确指定的文字/);
  assert.doesNotMatch(prompt,/不新增文字、商标或道具|不增加帽子、假发/);
  if(scene.code!=='01') assert.match(generationPrompt(style,'keep',scene.orientation),/覆盖上文的换装描述/);
  const [w,h]=orientedSize(style.size,scene.orientation).split('x').map(Number);
  const [a,b]=orientationRatio(scene.orientation).split(':').map(Number);
  assert.equal(w/h,a/b);assert.ok(w*h>=2_200_000&&w*h<=2_359_296);
 }
});

test('source orientation and texture survive normalization, full output is never resized, previews support dense displays',async()=>{
 const source=await sharp({create:{width:3392,height:1908,channels:3,background:'#536d82'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const normalized=await sharp(await normalizeSourcePhoto(source)).metadata();
 assert.equal(normalized.width,1728);assert.equal(normalized.height,3072);assert.equal(normalized.exif,undefined);assert.equal(normalized.chromaSubsampling,'4:4:4');
 const generated=await sharp({create:{width:1824,height:1216,channels:3,background:'#536d82'}}).png().toBuffer();
 const full=await sharp(await fullPhoto(generated)).metadata();
 const preview=await sharp(await previewPhoto(generated)).metadata();
 assert.equal(full.width,1824);assert.equal(full.height,1216);assert.equal(preview.width,1600);assert.equal(preview.height,1067);
 assert.equal(preview.chromaSubsampling,'4:4:4');
 const small=await sharp({create:{width:320,height:480,channels:3,background:'#536d82'}}).png().toBuffer();
 assert.equal((await sharp(await previewPhoto(small)).metadata()).width,320);
});

test('single scenes adapt wardrobe without forcing a template gender or cutting long hair',()=>{
 const get=(code:string)=>styles.find(s=>s.sourceCode===code)!;
 for(const code of ['06','08','09A','09B','10A']){
  const style=get(code);
  assert.match(style.prompt!,/女装/);assert.match(style.prompt!,/男装/);
  const prompt=generationPrompt(style,'theme',style.sceneOrientation!);
  assert.match(prompt,/自动适配人物造型/);
  assert.match(prompt,/不能仅凭长短发决定造型/);
  assert.match(prompt,/无法明确适配时采用主题同色系的中性/);
  assert.match(prompt,/不要将男女两套衣物混合到同一个人/);
  const keep=generationPrompt(style,'keep',style.sceneOrientation!);
  assert.ok(keep.indexOf('用户选择：保留原服装，覆盖上文的换装描述')>keep.indexOf(style.prompt!));
 }
 assert.match(get('08').prompt!,/男装方案：香槟银灰色合身西装外套/);
 assert.doesNotMatch(get('08').prompt!,/穿浅银香槟色抹胸礼服/);
 assert.match(get('09A').prompt!,/胸花小字随造型采用“新娘”或“新郎”/);
 assert.match(get('09B').prompt!,/女装方案：象牙白缎面婚纱/);
 assert.doesNotMatch(get('09B').prompt!,/短发整齐|金色小字准确为“新郎”/);
 assert.doesNotMatch(get('10B').prompt!,/短发自然蓬松、略带凌乱发束/);
 assert.match(get('10B').prompt!,/长发不剪短，短发不加长/);
 assert.match(get('10A').prompt!,/男装方案：奶黄色小花纹宽松短袖度假衬衫/);
 for(const style of styles){
  assert.match(generationPrompt(style,'theme',style.sceneOrientation??'portrait'),/不输出、标注或保存性别判断/);
 }
});

test('enabled imported scenes use distinct generated cover files with preserved provenance',async()=>{
 const manifest=JSON.parse(readFileSync('docs/sources/prompt-import-2026-09-29/covers/manifest.json','utf8'));
 assert.equal(manifest.images.length,12);
 assert.equal(new Set(manifest.images.map((i:any)=>i.sha256)).size,12);
 for(const scene of importedScenes.filter(s=>s.people===1)){
  const entry=manifest.images.find((i:any)=>i.code===scene.code);assert.ok(entry);
  assert.equal(entry.cover,'assets'+styles.find(s=>s.id===scene.id)!.exampleUrl);
  assert.equal(createHash('sha256').update(readFileSync(entry.original)).digest('hex'),entry.sha256);
  assert.equal(createHash('sha256').update(readFileSync(entry.cover)).digest('hex'),entry.coverSha256);
  const m=await sharp(entry.cover).metadata();assert.ok(m.width!>=1000);assert.ok(m.height!>=750);
 }
});

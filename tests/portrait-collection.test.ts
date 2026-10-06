import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { portraitCollection } from '../packages/shared/portrait-collection';
import { kidsCollection } from '../packages/shared/kids-collection';
import { purposes, recommendedFrame, captureGuide, isRealistic } from '../packages/shared/portrait-experience';
import { photoCategories, photoCategoryFor, categoryStyles, photoPurposeFor } from '../packages/shared/photo-categories';
import type { Style } from '../packages/shared/types';
import { generationPrompt } from '../apps/server/generation-prompt';
import { importedScenes } from '../packages/shared/imported-scenes';

test('every bundled template has one explicit content category and enabled covers are unique', () => {
 const styles:Style[]=JSON.parse(readFileSync('config/styles/styles.json','utf8'));
 const active=styles.filter(s=>s.enabled);
 assert.equal(active.length,121);
 assert.equal(styles.some(s=>s.id==='natural'),false);
 assert.equal(new Set(active.map(s=>s.exampleUrl)).size,active.length);
 for(const style of styles) {
  const count=photoCategories.filter(p=>(p.styles as readonly string[]).includes(style.id)).length;
  assert.equal(count,1,`${style.id} must have one explicit category`);
 }
 const counts=Object.fromEntries(photoCategories.map(p=>[p.id,categoryStyles(styles,p.id).length]));
 assert.deepEqual(counts,{portrait:25,professional:6,celebration:7,wedding:2,together:16,lifestyle:11,'kids-adventure':23,'kids-career':15,creative:16,other:0});
 assert.deepEqual(photoCategories.flatMap(p=>categoryStyles(styles,p.id)).map(s=>s.id).sort(),active.map(s=>s.id).sort());
 assert.equal(photoCategoryFor('doctor-folder'),'professional');
 assert.equal(photoCategoryFor('wedding-groom'),'wedding');
 assert.equal(photoCategoryFor('island-coconut'),'lifestyle');
 assert.equal(photoCategoryFor('memory-03'),'lifestyle');
 assert.equal(photoCategoryFor('film'),'lifestyle');
 assert.equal(photoPurposeFor(styles.find(s=>s.id==='wedding-groom')!),'memory');
 assert.equal(photoPurposeFor({...styles.find(s=>s.id==='wedding-groom')!,subjectCount:2}),'together');
 const custom={...active[0],id:'custom-real-photo',name:'自定义写真'};
 assert.deepEqual(categoryStyles([custom],'other'),[custom]);
 assert.equal(categoryStyles([custom],'creative').length,0);
 assert.equal(categoryStyles([{...custom,enabled:false}],'other').length,0);
});
test('30 imported styles have matching covers, purpose, guidance and preserved originals', async () => {
 const styles:Style[]=JSON.parse(readFileSync('config/styles/styles.json','utf8'));
 const manifest=JSON.parse(readFileSync('docs/sources/portrait-covers-2026-10/manifest.json','utf8'));
 assert.equal(portraitCollection.length,30);
 for(const purpose of ['self','together','memory']) assert.equal(portraitCollection.filter(s=>s.purpose===purpose).length,10);
 assert.equal(new Set(styles.map(s=>s.id)).size,styles.length);
 for(const entry of portraitCollection){
  const style=styles.find(s=>s.id===entry.id)!;
  assert.ok(style?.enabled);
  assert.ok((purposes.find(p=>p.id===entry.purpose)!.styles as readonly string[]).includes(entry.id));
  assert.ok(isRealistic(entry.id));
  assert.equal(recommendedFrame(entry.id,entry.purpose),entry.frame);
  assert.equal(captureGuide(entry.id,entry.purpose==='together'),entry.guide);
  assert.match(generationPrompt(style,'keep','portrait'),/按实际人数逐人保留/);
  assert.ok(style.outfitPrompt, 'clothing is controlled separately from the visual theme');
  assert.match(style.prompt!,/动作：/);
  assert.ok(style.prompt!.length<=160, `${entry.id}: theme prompt stays compact`);
  assert.doesNotMatch(style.prompt!,/主体为一位虚构|一对约\d|两位约\d|三位约\d/);
  const metadata=await sharp('assets'+style.exampleUrl).metadata();
  assert.equal(metadata.width! / metadata.height!,.75);
  if(entry.purpose==='self') {
   assert.equal(style.exampleUrls?.length,2);
   assert.equal(style.exampleUrl,style.exampleUrls![0]);
   for(const url of style.exampleUrls!) {
    const cover=manifest.images.find((i:any)=>'assets'+url===i.cover);
    assert.ok(cover);
    const m=await sharp(cover.cover).metadata();
    assert.equal(m.width,m.height!*.75);
    assert.equal(createHash('sha256').update(readFileSync(cover.original)).digest('hex'),cover.sha256);
   }
  }
  const source=manifest.images.find((i:any)=>i.cover==='assets'+style.exampleUrl);
  assert.equal(createHash('sha256').update(readFileSync(source.original)).digest('hex'),source.sha256);
 }
});
test('36 refreshed portrait themes have 46 verified covers and preserve old migration history', async () => {
 const base='docs/sources/portrait-covers-2026-10';
 const manifest=JSON.parse(readFileSync(base+'/manifest.json','utf8'));
 const baseline:Style[]=JSON.parse(readFileSync(base+'/baseline-styles.json','utf8'));
 const oldMigrations=JSON.parse(readFileSync(base+'/baseline-migration.json','utf8'));
 const styles:Style[]=JSON.parse(readFileSync('config/styles/styles.json','utf8'));
 const migrations=JSON.parse(readFileSync('config/styles/scene-quality-migration.json','utf8'));
 const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
 const themes=new Set<string>(manifest.images.map((i:any)=>i.themeId));
 assert.equal(manifest.tool,'built-in imagegen');
 assert.equal(manifest.status,'Original illustrations of fictional people, not verified Seedream results');
 assert.equal(manifest.images.length,46);
 assert.equal(themes.size,36);
 assert.equal(new Set(manifest.images.map((i:any)=>i.id)).size,46);
 assert.equal(new Set(manifest.images.map((i:any)=>i.sha256)).size,46);
 for(const style of styles) {
  if(importedScenes.some(scene=>scene.batch==='2026-10-06'&&scene.id===style.id))continue;
  const before=baseline.find(s=>s.id===style.id)!;
  assert.ok(before,style.id);
  const omitCovers=({exampleUrl,exampleUrls,...rest}:Style)=>rest;
  assert.deepEqual(omitCovers(style),omitCovers(before),style.id+' only cover fields may change');
  if(!themes.has(style.id)) {
   assert.deepEqual(style,before,style.id+' remains unchanged');
   continue;
  }
  const images=manifest.images.filter((i:any)=>i.themeId===style.id);
  const urls=style.id.startsWith('self-')
   ? ['/examples/'+style.id+'-v2-a.webp','/examples/'+style.id+'-v2-b.webp']
   : ['/examples/'+style.id+'-v2.webp'];
  assert.equal(style.exampleUrl,urls[0],style.id);
  if(style.id.startsWith('self-'))assert.deepEqual(style.exampleUrls,urls);
  assert.deepEqual(images.map((i:any)=>i.cover),urls.map(url=>'assets'+url));
  const history=migrations[style.id].exampleUrl;
  assert.ok(Array.isArray(history),style.id);
  assert.ok(history.includes(hash(JSON.stringify(before.exampleUrl))),style.id+' previous primary cover migrates');
  for(const [key,previous] of Object.entries(oldMigrations[style.id]??{})) {
   if(key==='exampleUrl')for(const value of Array.isArray(previous)?previous:[previous])assert.ok(history.includes(value),style.id+' older cover history');
   else assert.deepEqual(migrations[style.id][key],previous,style.id+' other migration fields unchanged');
  }
  for(const image of images) {
   assert.equal(image.status,manifest.status);
   assert.equal(image.review.status,'passed');
   assert.ok(image.review.notes.length>0);
   assert.equal(image.original,base+'/'+image.id+'.png');
   assert.equal(hash(readFileSync(image.original)),image.sha256);
   assert.equal(hash(readFileSync(image.cover)),image.coverSha256);
   assert.equal(readFileSync(image.original.replace('.png','-prompt.txt'),'utf8'),image.coverPrompt);
   assert.equal(hash(image.coverPrompt),image.promptSha256);
   const metadata=await sharp(image.cover).metadata();
   assert.equal(metadata.format,'webp');assert.equal(metadata.width,720);assert.equal(metadata.height,960);
   assert.ok(statSync(image.cover).size<=160000,image.cover);
  }
 }
 for(const id of ['cinema','business','cartoon'])assert.equal(existsSync('assets/examples/'+id+'.svg'),false);
 for(const id of ['editorial','film','festival'])assert.equal(existsSync('assets/examples/'+id+'-reference.png'),false);
 assert.ok(existsSync('assets/examples/anime-reference.png'));
 assert.ok(existsSync('assets/examples/anime-cast.png'));
 assert.ok(existsSync(base+'/overview.png'));
 assert.ok(existsSync(base+'/before-after.png'));
});

test('children themes have matching original covers, migration hashes, guidance and compact prompts', async () => {
 const styles:Style[]=JSON.parse(readFileSync('config/styles/styles.json','utf8'));
 const manifest=JSON.parse(readFileSync('docs/sources/kids-covers/manifest.json','utf8'));
 const migrations=JSON.parse(readFileSync('config/styles/scene-quality-migration.json','utf8'));
 const doubles=new Set(['kids-castle','kids-fairy','kids-ballet']);
 const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
 assert.equal(manifest.tool,'built-in imagegen');
 assert.equal(manifest.status,'Original illustrations of fictional children, not verified Seedream results');
 assert.equal(manifest.images.length,41);
 assert.equal(new Set(manifest.images.map((image:any)=>image.id)).size,41);
 assert.equal(new Set(manifest.images.map((image:any)=>image.sha256)).size,41);
 assert.equal(kidsCollection.length,38);
 for(const entry of kidsCollection){
  const style=styles.find(s=>s.id===entry.id)!;
  assert.ok(style?.enabled, entry.id);
  assert.equal(photoCategoryFor(entry.id),entry.category);
  assert.equal(isRealistic(entry.id),entry.realistic);
  assert.equal(recommendedFrame(entry.id,'memory'),entry.frame);
  assert.equal(captureGuide(entry.id),entry.guide);
  assert.ok(style.outfitPrompt, entry.id);
  assert.ok(style.prompt!.length<=140, entry.id);
  const urls=doubles.has(entry.id)?[`/examples/${entry.id}-a.webp`,`/examples/${entry.id}-b.webp`]:[`/examples/${entry.id}.webp`];
  assert.equal(style.exampleUrl,urls[0]);
  if(doubles.has(entry.id)) assert.deepEqual(style.exampleUrls,urls);
  else assert.equal(style.exampleUrls,undefined);
  assert.equal(migrations[entry.id].exampleUrl,hash(JSON.stringify(`/examples/${entry.id}.svg`)),entry.id);
  assert.equal(existsSync(`assets/examples/${entry.id}.svg`),false);
  for(const url of urls){
   const cover='assets'+url;
   assert.ok(existsSync(cover),cover);
   const metadata=await sharp(cover).metadata();
   assert.equal(metadata.format,'webp');assert.equal(metadata.width,720);assert.equal(metadata.height,960);
   assert.ok(statSync(cover).size<=150000,cover);
   const image=manifest.images.find((image:any)=>image.cover===cover);
   assert.ok(image,cover);assert.equal(image.themeId,entry.id);
   assert.equal(image.original,`docs/sources/kids-covers/${image.id}.png`);
   assert.equal(hash(readFileSync(image.original)),image.sha256);
   assert.equal(hash(readFileSync(cover)),image.coverSha256);
   assert.equal(readFileSync(image.original.replace('.png','-prompt.txt'),'utf8'),image.prompt);
   assert.equal(image.review.status,'passed');
  }
  // Costumes and props come from the theme; named characters and real logos stay out.
  assert.doesNotMatch(style.prompt!+style.outfitPrompt,/迪士尼|漫威|奥特曼|乐高|哈利|艾莎|NASA/, entry.id);
 }
 assert.match(generationPrompt(styles.find(s=>s.id==='kids-dino')!,'keep','portrait'),/儿童保持本人年龄的稚气头身比例/);
 assert.doesNotMatch(generationPrompt(styles.find(s=>s.id==='self-01')!,'keep','portrait'),/儿童保持/);
});

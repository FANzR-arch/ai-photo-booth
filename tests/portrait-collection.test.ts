import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { portraitCollection } from '../packages/shared/portrait-collection';
import { purposes, recommendedFrame, captureGuide, isRealistic } from '../packages/shared/portrait-experience';
import { photoCategories, photoCategoryFor, categoryStyles, photoPurposeFor } from '../packages/shared/photo-categories';
import type { Style } from '../packages/shared/types';
import { generationPrompt } from '../apps/server/generation-prompt';

test('every bundled template has one explicit content category and enabled covers are unique', () => {
 const styles:Style[]=JSON.parse(readFileSync('config/styles/styles.json','utf8'));
 const active=styles.filter(s=>s.enabled);
 assert.equal(active.length,63);
 assert.equal(styles.some(s=>s.id==='natural'),false);
 assert.equal(new Set(active.map(s=>s.exampleUrl)).size,active.length);
 for(const style of styles) {
  const count=photoCategories.filter(p=>(p.styles as readonly string[]).includes(style.id)).length;
  assert.equal(count,1,`${style.id} must have one explicit category`);
 }
 const counts=Object.fromEntries(photoCategories.map(p=>[p.id,categoryStyles(styles,p.id).length]));
 assert.deepEqual(counts,{portrait:13,professional:5,celebration:6,wedding:2,together:10,lifestyle:11,creative:16,other:0});
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
 const manifest=JSON.parse(readFileSync('docs/sources/portrait-covers/manifest.json','utf8'));
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
  assert.ok(style.prompt!.length<=140, `${entry.id}: theme prompt stays compact`);
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
  const source=manifest.images.find((i:any)=>i.id===entry.id);
  assert.equal(createHash('sha256').update(readFileSync(source.original)).digest('hex'),source.sha256);
 }
});

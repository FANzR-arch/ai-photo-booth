import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {framePhoto} from '../apps/server/photo-frame';
import {frames,defaultCaption,printSvg,printLayout,captionLines,fonts} from '../packages/shared/frames';

test('all templates export intact photos, safe captions, and space for long CJK lines',async()=>{
 const source=await sharp({create:{width:600,height:400,channels:3,background:'#aa5544'}}).jpeg().toBuffer();
 const caption={...defaultCaption,text:'我们把平凡的日子过成纪念。'.repeat(5),size:'large' as const};
 for(const f of frames){
  const result=await framePhoto(source,f.id,caption);
  const g=printLayout(600,400,f.id,caption),meta=await sharp(result).metadata();
  assert.equal(meta.width,g.width);assert.equal(meta.height,g.height);
  const pixel=await sharp(result).extract({left:g.left+300,top:g.top+200,width:1,height:1}).raw().toBuffer();
  assert.ok(Math.abs(pixel[0]-170)<6,'source photo remains inside '+f.id);
 }
 const svg=printSvg(600,400,'paper',{...defaultCaption,text:'<script>&"'});
 assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));
 assert.ok(captionLines('很长的中文留念文字'.repeat(5),300,30).length>1);
});

test('installed Windows Chinese fonts produce distinct caption images', {skip:process.platform!=='win32'},async()=>{
 const source=await sharp({create:{width:600,height:400,channels:3,background:'#aaa'}}).jpeg().toBuffer();
 const outputs=[];
 for(const font of fonts)outputs.push(await framePhoto(source,'instant',{...defaultCaption,text:'时光有信，今日晴朗。',font:font.id}));
 assert.notDeepEqual(outputs[0],outputs[1]);assert.notDeepEqual(outputs[1],outputs[2]);assert.notDeepEqual(outputs[0],outputs[2]);
});

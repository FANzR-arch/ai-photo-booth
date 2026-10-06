/** Explicit live Seedream evaluation. Serial, resumable, retained locally, never retries an attempted job. */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { importedScenes } from '../packages/shared/imported-scenes';
import { orientedSize } from '../packages/shared/photo-orientation';
import { generationPrompt } from '../apps/server/generation-prompt';
import { normalizeSourcePhoto, fullPhoto, previewPhoto } from '../apps/server/photo-quality';
import { generate, ProviderError } from '../apps/server/providers/seedream';
import type { Style } from '../packages/shared/types';

const args = process.argv.slice(2);
const source = args.find(a => a.startsWith('--source='))?.slice(9);
if (!source || !args.includes('--live')) throw Error('Required: --live --source=<authorized portrait> [--run=<slug>] [--code=01] [--baseline]');
const baseline = args.includes('--baseline');
const code = args.find(a => a.startsWith('--code='))?.slice(7);
const batch = args.find(a => a.startsWith('--batch='))?.slice(8);
if (batch && !['2026-09-29','2026-10-06'].includes(batch)) throw Error('Unknown source batch');
const revision = args.find(a => a.startsWith('--revision='))?.slice(11);
if (revision && !/^[a-z0-9-]{1,20}$/.test(revision)) throw Error('Invalid revision');
const run = args.find(a => a.startsWith('--run='))?.slice(6) ?? 'seedream-scenes-2026-09-29';
if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(run)) throw Error('Invalid run name');
if (code && code.split(',').some(c => !importedScenes.some(s => s.code === c && s.people === 1))) throw Error('Unknown or non-single scene code');
const dir = path.resolve('docs/evidence',run);
const styles: Style[] = JSON.parse(readFileSync('config/styles/styles.json','utf8'));
mkdirSync(dir, { recursive: true });
const lock = path.join(dir, '.running');
writeFileSync(lock, String(process.pid), { flag: 'wx' });
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
try {
 const input = readFileSync(source);
 const photo = await normalizeSourcePhoto(input);
 const inputFile = path.join(dir, 'input.jpg');
 if (existsSync(inputFile) && sha(readFileSync(inputFile)) !== sha(photo)) throw Error('Input changed: use a separate evidence run.');
 writeFileSync(inputFile, photo);
 const m = await sharp(photo).metadata();
 writeFileSync(path.join(dir, 'input.json'), JSON.stringify({ source, sourceSha256: sha(input), normalizedSha256: sha(photo), width:m.width,height:m.height, model:process.env.SEEDREAM_MODEL },null,2));
 // Preserve the established 12-scene default; new live calls need an explicit batch or code.
 for (const scene of importedScenes.filter(s => s.people === 1 && (code
  ? code.split(',').includes(s.code)
  : (s.batch ?? '2026-09-29') === (batch ?? '2026-09-29')))) {
  const id = scene.code + (baseline ? '-baseline' : '-hq') + (revision ? '-'+revision : '');
  const record = path.join(dir, `${id}.json`);
  const previous = existsSync(record) ? JSON.parse(readFileSync(record,'utf8')) : undefined;
  const retryUnsent = args.includes('--retry-not-sent') && previous?.status === 'failed' && previous?.error === '本机网络权限阻止了连接，生成请求未发出。请检查服务运行权限后重新生成。';
  if (previous && !retryUnsent) { console.log(`${id}: already attempted, skipped`); continue; }
  const bundled = styles.find(s => s.id === scene.id);
  if (!bundled?.prompt || !bundled.enabled || bundled.sourceCode !== scene.code) throw Error(`Missing enabled bundled scene: ${scene.code}`);
  const style: Style = { ...bundled, size:baseline?'1.5K':bundled.size };
  const prompt = generationPrompt(style, 'theme', scene.orientation);
  const size = orientedSize(style.size,scene.orientation);
  writeFileSync(path.join(dir,`${id}-prompt.txt`),prompt);
  const entry: Record<string, unknown> = { id,code:scene.code,name:style.name,styleId:style.id,styleVersion:style.version,status:'attempted',startedAt:new Date().toISOString(),size,model:process.env.SEEDREAM_MODEL,inputSha256:sha(photo),promptSha256:sha(prompt),baseline, ...(retryUnsent ? {previousUnsentAttempt:previous} : {}) };
  writeFileSync(record,JSON.stringify(entry,null,2));
  console.log(`${id}: submitting ${size}`);
  const started = Date.now();
  try {
   const result = await generate({photo,prompt,size,count:1});
   const raw = result.images[0];
   if (!raw) throw new ProviderError('No image received',true,result.requestId);
   const meta = await sharp(raw).metadata();
   const rawFile = `${id}-raw.${meta.format==='png'?'png':'jpg'}`;
   writeFileSync(path.join(dir,rawFile),raw);
   const full = await fullPhoto(raw);
   writeFileSync(path.join(dir,`${id}.jpg`),full);
   writeFileSync(path.join(dir,`${id}-preview.jpg`),await previewPhoto(full));
   writeFileSync(path.join(dir,`${id}-old-preview.jpg`),await sharp(full).resize({width:600,height:800,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer());
   Object.assign(entry,{status:'succeeded',requestId:result.requestId,elapsedMs:Date.now()-started,width:meta.width,height:meta.height,rawFile,rawSha256:sha(raw),rawBytes:raw.length,output:`${id}.jpg`});
   console.log(`${id}: saved ${meta.width}x${meta.height}, ${Date.now()-started}ms`);
  } catch (error) {
   const e=error as ProviderError;
   Object.assign(entry,{status:e.unknown?'unknown':'failed',error:e.message,requestId:e.requestId,elapsedMs:Date.now()-started});
   console.log(`${id}: ${entry.status}: ${e.message}`);
   writeFileSync(record,JSON.stringify(entry,null,2));
   // Investigate before spending on further calls when a configuration/network problem occurs.
   break;
  }
  writeFileSync(record,JSON.stringify(entry,null,2));
 }
} finally { unlinkSync(lock); }

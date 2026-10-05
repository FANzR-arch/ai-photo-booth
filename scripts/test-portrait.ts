/**
 * Explicit live Seedream check for standard portrait templates: one call per invocation, retained under docs/evidence, never retried.
 * Example: tsx scripts/test-portrait.ts --live --source=<authorized photo> --run=portrait-proportion-2026-10-05 --style=business --tag=reframed --reframe --beauty=light
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { orientedSize, isPhotoOrientation } from '../packages/shared/photo-orientation';
import { isClothingMode } from '../packages/shared/clothing';
import { isBeautyLevel } from '../packages/shared/portrait-settings';
import { generationPrompt } from '../apps/server/generation-prompt';
import { normalizeSourcePhoto, fullPhoto, previewPhoto } from '../apps/server/photo-quality';
import { frameReference } from '../apps/server/reference-framing';
import { generate, ProviderError } from '../apps/server/providers/seedream';
import type { Style } from '../packages/shared/types';

const args = process.argv.slice(2);
const opt = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const source = opt('source'), run = opt('run'), styleId = opt('style') ?? 'business', tag = opt('tag') ?? 'default';
if (!source || !run || !args.includes('--live')) throw Error('Required: --live --source=<authorized portrait> --run=<slug> [--style=business] [--tag=<slug>] [--clothing=theme|keep] [--orientation=portrait|landscape] [--beauty=off|light|medium] [--reframe]');
if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(run) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(tag)) throw Error('Invalid run or tag name');
const clothing = opt('clothing') ?? 'theme', orientation = opt('orientation') ?? 'portrait', beauty = opt('beauty') ?? 'off';
if (!isClothingMode(clothing) || !isPhotoOrientation(orientation) || !isBeautyLevel(beauty)) throw Error('Invalid clothing, orientation or beauty');
const reframe = args.includes('--reframe');
const styles: Style[] = JSON.parse(readFileSync('config/styles/styles.json', 'utf8'));
const style = styles.find(s => s.id === styleId);
if (!style?.prompt || !style.enabled) throw Error(`Missing enabled bundled style: ${styleId}`);
const dir = path.resolve('docs/evidence', run);
mkdirSync(dir, { recursive: true });
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const lock = path.join(dir, '.running');
writeFileSync(lock, String(process.pid), { flag: 'wx' });
try {
    const input = readFileSync(source);
    const photo = await normalizeSourcePhoto(input);
    const inputFile = path.join(dir, 'input.jpg');
    if (existsSync(inputFile) && sha(readFileSync(inputFile)) !== sha(photo)) throw Error('Input changed: use a separate evidence run.');
    writeFileSync(inputFile, photo);
    const m = await sharp(photo).metadata();
    writeFileSync(path.join(dir, 'input.json'), JSON.stringify({ source, sourceSha256: sha(input), normalizedSha256: sha(photo), width: m.width, height: m.height, model: process.env.SEEDREAM_MODEL }, null, 2));
    const id = `${styleId}-${tag}`;
    const record = path.join(dir, `${id}.json`);
    if (existsSync(record)) { console.log(`${id}: already attempted, skipped`); process.exit(0); }
    let reference = photo, framing: Record<string, unknown> = { applied: false, reason: '未启用' };
    if (reframe) {
        const result = await frameReference(photo, orientation);
        const { photo: framed, ...summary } = result;
        framing = summary;
        if (result.applied) { reference = framed; writeFileSync(path.join(dir, `${id}-reference.jpg`), reference); }
    }
    // --prompt-file replays a saved prompt verbatim (e.g. the previous release's) for a like-for-like comparison.
    const promptFile = opt('prompt-file');
    const prompt = promptFile ? readFileSync(promptFile, 'utf8') : generationPrompt(style, clothing, orientation, { beauty });
    const size = orientedSize(style.size, orientation);
    writeFileSync(path.join(dir, `${id}-prompt.txt`), prompt);
    const entry: Record<string, unknown> = { id, styleId, styleVersion: style.version, clothing, orientation, beauty, reframe, framing, promptFile, status: 'attempted', startedAt: new Date().toISOString(), size, model: process.env.SEEDREAM_MODEL, inputSha256: sha(photo), referenceSha256: sha(reference), promptSha256: sha(prompt), promptLength: prompt.length };
    writeFileSync(record, JSON.stringify(entry, null, 2));
    console.log(`${id}: submitting ${size} (framing: ${framing.reason}, prompt ${prompt.length} chars)`);
    const started = Date.now();
    try {
        const result = await generate({ photo: reference, prompt, size, count: 1 });
        const raw = result.images[0];
        if (!raw) throw new ProviderError('No image received', true, result.requestId);
        const meta = await sharp(raw).metadata();
        const rawFile = `${id}-raw.${meta.format === 'png' ? 'png' : 'jpg'}`;
        writeFileSync(path.join(dir, rawFile), raw);
        const full = await fullPhoto(raw);
        writeFileSync(path.join(dir, `${id}.jpg`), full);
        writeFileSync(path.join(dir, `${id}-preview.jpg`), await previewPhoto(full));
        Object.assign(entry, { status: 'succeeded', requestId: result.requestId, elapsedMs: Date.now() - started, width: meta.width, height: meta.height, rawFile, rawSha256: sha(raw), rawBytes: raw.length, output: `${id}.jpg` });
        console.log(`${id}: saved ${meta.width}x${meta.height}, ${Date.now() - started}ms`);
    } catch (error) {
        const e = error as ProviderError;
        Object.assign(entry, { status: e.unknown ? 'unknown' : 'failed', error: e.message, requestId: e.requestId, elapsedMs: Date.now() - started });
        console.log(`${id}: ${entry.status}: ${e.message}`);
    }
    writeFileSync(record, JSON.stringify(entry, null, 2));
} finally { unlinkSync(lock); }

// Archive one built-in imagegen output and rebuild its small kiosk cover and source manifest.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const base = 'docs/sources/kids-covers';
const jobs = JSON.parse(readFileSync(`${base}/generation-jobs.json`, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifestPath = `${base}/manifest.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {
  tool: 'built-in imagegen',
  status: 'Original illustrations of fictional children, not verified Seedream results',
  images: []
};
const [id, source] = process.argv.slice(2);
if (id === '--overview') {
  if (manifest.images.length !== 41 || manifest.images.some(image => image.review.status !== 'passed')) {
    throw Error('The overview requires all 41 individually reviewed covers');
  }
  const columns=7, thumbWidth=240, thumbHeight=320, labelHeight=40, gap=20, margin=24, header=100;
  const rows=Math.ceil(manifest.images.length/columns);
  const width=margin*2+columns*thumbWidth+(columns-1)*gap;
  const height=header+rows*(thumbHeight+labelHeight)+(rows-1)*gap+margin;
  const layers=[];
  const heading=Buffer.from(`<svg width="${width}" height="${header}"><text x="${margin}" y="44" fill="#242424" font-family="Microsoft YaHei, sans-serif" font-size="32">儿童主题封面 · 38 个主题 / 41 张</text><text x="${margin}" y="78" fill="#666666" font-family="Microsoft YaHei, sans-serif" font-size="18">原创虚构人物示意图 · 内置 imagegen · 非 Seedream 实测</text></svg>`);
  layers.push({input:heading,left:0,top:0});
  for(let i=0;i<manifest.images.length;i++){
    const entry=manifest.images[i];
    const left=margin+(i%columns)*(thumbWidth+gap);
    const top=header+Math.floor(i/columns)*(thumbHeight+labelHeight+gap);
    layers.push({input:await sharp(entry.cover).resize(thumbWidth,thumbHeight).png().toBuffer(),left,top});
    const label=Buffer.from(`<svg width="${thumbWidth}" height="${labelHeight}"><text x="${thumbWidth/2}" y="26" text-anchor="middle" fill="#333333" font-family="Consolas, monospace" font-size="16">${entry.id}</text></svg>`);
    layers.push({input:label,left,top:top+thumbHeight});
  }
  await sharp({create:{width,height,channels:3,background:'#faf8f4'}}).composite(layers).png().toFile(`${base}/overview.png`);
  console.log(JSON.stringify({overview:`${base}/overview.png`,width,height,images:manifest.images.length}));
  process.exit(0);
}
const job = jobs.find(item => item.id === id);
if (!job || !source) throw Error('Usage: node scripts/save-kids-covers.mjs <job-id> <generated-png>');
const promptPath = `${base}/${id}-prompt.txt`;
if (!existsSync(promptPath)) throw Error(`Save the exact submitted prompt first: ${promptPath}`);
const original = `${base}/${id}.png`;
const cover = `assets/examples/${id}.webp`;
const raw = readFileSync(source);
const metadata = await sharp(raw).metadata();
if (metadata.format !== 'png') throw Error('The archived original must be the generated PNG');
mkdirSync(base, { recursive: true });
if (existsSync(original) && hash(readFileSync(original)) !== hash(raw)) {
  const previous = manifest.images.find(item => item.id === id);
  const revisions = `${base}/rejected`;
  mkdirSync(revisions, { recursive: true });
  const revision = `${revisions}/${id}-${hash(readFileSync(original)).slice(0,12)}`;
  copyFileSync(original, `${revision}.png`);
  if (previous) {
    const { cover: supersededCover, ...record } = previous;
    writeFileSync(`${revision}.json`, JSON.stringify({ ...record, original: `${revision}.png`, supersededCover }, null, 2) + '\n');
  }
}
copyFileSync(source, original);
let quality = 88;
let encoded;
do {
  encoded = await sharp(raw).resize(720, 960, { fit: 'cover', position: 'centre' }).webp({ quality }).toBuffer();
  if (encoded.length <= 150000) break;
  quality -= 2;
} while (quality >= 60);
if (encoded.length > 150000) throw Error(`Cover exceeds 150 KB: ${id}`);
writeFileSync(cover, encoded);
const prompt = readFileSync(promptPath, 'utf8');
const entry = {
  id, themeId: job.themeId ?? id, subject: job.subject, prompt, original, cover, source,
  width: metadata.width, height: metadata.height, sha256: hash(raw), coverSha256: hash(encoded),
  promptSha256: hash(prompt), coverWidth: 720, coverHeight: 960, coverBytes: encoded.length, quality,
  review: { status: 'pending' }
};
manifest.images = [...manifest.images.filter(item => item.id !== id), entry]
  .sort((a,b) => jobs.findIndex(item => item.id === a.id) - jobs.findIndex(item => item.id === b.id));
if (manifest.summary) {
  manifest.summary.coverBytes = manifest.images.reduce((sum,image) => sum+image.coverBytes,0);
  manifest.summary.reviewedImages = manifest.images.filter(image => image.review.status === 'passed').length;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ id, original, cover, sourceWidth: metadata.width, sourceHeight: metadata.height, coverBytes: encoded.length, quality }));

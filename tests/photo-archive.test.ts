import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp, type AppOptions } from '../apps/server/app.js';
async function fixture(options: AppOptions = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'booth-archive-'));
    mkdirSync(path.join(root, 'config/styles'), { recursive: true });
    writeFileSync(path.join(root, 'config/styles/styles.json'), JSON.stringify([{ id: 'cinema', name: '电影/海报', description: '测试', prompt: 'keep identity', version: 1, enabled: true, exampleUrl: '/examples/cinema.svg', size: '2K', color: '#f00' }]));
    let time = Date.now();
    const app = await createApp({ mode: 'demo', rootDir: root, dataDir: path.join(root, 'data'), clock: () => time, ttlMs: 600000, archiveDir: path.join(root, '拍照亭照片'), ...options });
    const req = (method: string, url: string, payload?: unknown) => app.inject({ method: method as any, url, payload: payload as any, headers: { host: 'localhost:4377' } });
    const photo = await sharp({ create: { width: 160, height: 200, channels: 3, background: '#f2a399' } }).jpeg().toBuffer();
    const generate = async () => {
        const id = (await req('POST', '/api/sessions', { styleId: 'cinema' })).json().id as string;
        assert.equal((await req('POST', `/api/sessions/${id}/photo`, { dataUrl: `data:image/jpeg;base64,${photo.toString('base64')}`, orientation: 'portrait' })).statusCode, 200);
        await req('POST', `/api/sessions/${id}/generate`, {});
        for (let i = 0; i < 500; i++) {
            if ((await req('GET', `/api/sessions/${id}`)).json().status === 'ready') return id;
            await new Promise(r => setTimeout(r, 10));
        }
        throw Error('generation did not finish');
    };
    const files = () => {
        const dir = path.join(root, '拍照亭照片');
        return existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.join(e.parentPath, e.name)) : [];
    };
    return { root, app, req, generate, files, advance: (ms: number) => time += ms, close: async () => { await app.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('each visit gets one folder with 原图, AI图 and 打印版 that outlives session expiry', async () => {
    const f = await fixture();
    try {
        const id = await f.generate();
        assert.equal((await f.req('POST', `/api/sessions/${id}/frame`, { frame: 'instant', caption: { text: '毕业快乐', font: 'serif', size: 'medium', align: 'center', color: 'auto' } })).statusCode, 200);
        f.advance(600001);
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).statusCode, 410);
        await f.app.close(); // Waits for queued archive writes.
        assert.equal(existsSync(path.join(f.root, 'data', 'sessions', id)), false, 'session folder is still erased on expiry');
        const files = f.files();
        assert.deepEqual(files.map(file => path.basename(file)).sort(), ['AI图.jpg', '原图.jpg', '打印版.jpg'].sort());
        assert.equal(new Set(files.map(file => path.dirname(file))).size, 1, 'one folder per visit');
        assert.match(path.basename(path.dirname(files[0])), /^\d{4}-\d{2}-\d{2}_\d{6}_电影海报$/);
        const photo = files.find(file => file.endsWith('AI图.jpg')), print = files.find(file => file.endsWith('打印版.jpg'));
        const [clean, framed] = await Promise.all([sharp(photo!).metadata(), sharp(print!).metadata()]);
        assert.ok(framed.height! > clean.height!, 'print version carries the chosen instant frame');
        assert.equal(files.filter(file => file.endsWith('.part')).length, 0);
    } finally { await f.close(); }
});
test('archive can be switched off', async () => {
    const f = await fixture({ archiveDir: false });
    try {
        await f.generate();
        await f.app.close();
        assert.deepEqual(f.files(), []);
    } finally { await f.close(); }
});

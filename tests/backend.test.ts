import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { createApp, type AppOptions } from '../apps/server/app.js';
async function fixture(options: AppOptions = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'booth-test-'));
    mkdirSync(path.join(root, 'config/styles'), { recursive: true });
    writeFileSync(path.join(root, 'config/styles/styles.json'), JSON.stringify([{ id: 'cinema', name: '电影', description: '测试', prompt: 'keep identity', version: 1, enabled: true, exampleUrl: '/examples/cinema.svg', size: '2K', color: '#f00' }]));
    const dataDir = path.join(root, 'data');
    let app = await createApp({ ...options, rootDir: root, dataDir });
    const req = (method: string, url: string, payload?: unknown) => app.inject({ method: method as any, url, payload: payload as any, headers: { host: 'localhost:4377' } });
    const photo = await sharp({ create: { width: 160, height: 200, channels: 3, background: '#f2a399' } }).jpeg().toBuffer();
    const make = async () => { const s = (await req('POST', '/api/sessions', { styleId: 'cinema' })).json(); assert.ok(s.id); assert.equal((await req('POST', `/api/sessions/${s.id}/photo`, { dataUrl: `data:image/jpeg;base64,${photo.toString('base64')}` })).statusCode, 200); return s.id as string; };
    const finish = async (id: string) => { for (let i = 0; i < 100; i++) {
        const s = (await req('GET', `/api/sessions/${id}`)).json();
        if (s.status !== 'generating')
            return s;
        await new Promise(r => setTimeout(r, 10));
    } throw Error('generation did not finish'); };
    return { root, dataDir, photo, req, make, finish, get app() { return app; }, restart: async () => { await app.close(); app = await createApp({ ...options, rootDir: root, dataDir }); }, close: async () => { await app.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('new bundled styles are added on restart without overwriting saved prompts or switches', async () => {
    const f = await fixture();
    try {
        const original = (await f.req('GET', '/api/admin')).json().styles[0];
        await f.req('PUT', '/api/admin/styles/cinema', { ...original, prompt: 'my custom prompt', enabled: false });
        writeFileSync(path.join(f.root, 'config/styles/styles.json'), JSON.stringify([
            { ...original, prompt: 'new bundled prompt' },
            { ...original, id: 'film', name: '复古胶片' },
        ]));
        await f.restart();
        const styles = (await f.req('GET', '/api/admin')).json().styles;
        const saved = styles.find((s: any) => s.id === 'cinema');
        assert.equal(saved.prompt, 'my custom prompt');
        assert.equal(saved.version, 2);
        assert.equal(saved.enabled, false);
        assert.equal(styles.filter((s: any) => s.id === 'film').length, 1);
        await f.restart();
        assert.equal((await f.req('GET', '/api/admin')).json().styles.length, 2);
    } finally { await f.close(); }
});
test('unresolved theme cannot be enabled; resolving variables increments version and permits a session', async () => {
    const f = await fixture();
    try {
        const original = (await f.req('GET', '/api/admin')).json().styles[0];
        const draft = { ...original, prompt: 'Portrait in {{城市}}', enabled: false };
        assert.equal((await f.req('PUT', '/api/admin/styles/cinema', draft)).statusCode, 200);
        assert.equal((await f.req('PUT', '/api/admin/styles/cinema', { ...draft, enabled: true })).statusCode, 400);
        assert.equal((await f.req('POST', '/api/sessions', { styleId: 'cinema' })).statusCode, 400);
        const saved = await f.req('PUT', '/api/admin/styles/cinema', { ...draft, prompt: 'Portrait in Taipei', enabled: true });
        assert.equal(saved.json().version, 3);
        assert.equal((await f.req('POST', '/api/sessions', { styleId: 'cinema' })).statusCode, 200);
    } finally { await f.close(); }
});
test('demo flow preserves locked image authorization, idempotent paid order and pickup after end', async () => {
    const f = await fixture({ imageCount: 2 });
    try {
        const id = await f.make();
        const start = await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal(start.json().status, 'generating');
        const s = await f.finish(id);
        assert.equal(s.status, 'ready');
        assert.equal(s.mode, 'demo');
        assert.equal(s.images.length, 2);
        assert.equal((await f.req('GET', s.images[0].previewUrl)).headers['content-type'], 'image/jpeg');
        const order = (await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: [s.images[0].id] })).json();
        assert.equal(order.amount, 990);
        assert.equal((await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: [s.images[0].id] })).json().id, order.id);
        const paid = (await f.req('POST', `/api/orders/${order.id}/simulate`, { outcome: 'paid' })).json();
        const token = new URL(paid.pickupUrl).pathname.split('/').pop();
        assert.equal((await f.req('POST', `/api/orders/${order.id}/simulate`, { outcome: 'failed' })).json().order.status, 'paid');
        const pickup = (await f.req('GET', `/api/pickup/${token}`)).json();
        assert.equal(pickup.images.length, 1);
        assert.equal((await f.req('GET', pickup.images[0].downloadUrl)).statusCode, 200);
        assert.equal((await f.req('GET', `/api/pickup/${token}/images/${s.images[1].id}`)).statusCode, 404);
        await f.req('POST', `/api/sessions/${id}/end`, {});
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).statusCode, 410);
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).statusCode, 200);
        await f.restart();
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).statusCode, 200);
    }
    finally {
        await f.close();
    }
});
test('duplicate generation makes one upstream call; finished task cannot regenerate', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(r => release = r);
    const photo = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'blue' } }).jpeg().toBuffer();
    const f = await fixture({ mode: 'seedream', imageCount: 1, provider: async () => { calls++; await gate; return { images: [photo], requestId: 'test-request' }; } });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal(calls, 1);
        release();
        const s = await f.finish(id);
        assert.equal(s.requestId, 'test-request');
        assert.equal(s.promptVersion, 1);
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal(calls, 1);
    }
    finally {
        release();
        await f.close();
    }
});
test('unknown result blocks retry; explicitly failed request can retry', async () => {
    let calls = 0;
    const f = await fixture({ mode: 'seedream', provider: async () => { calls++; throw Object.assign(Error('上游超时'), { unknown: true }); } });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal((await f.finish(id)).status, 'unknown');
        assert.equal((await f.req('POST', `/api/sessions/${id}/generate`, {})).statusCode, 409);
        assert.equal(calls, 1);
    }
    finally {
        await f.close();
    }
    const g = await fixture({ mode: 'seedream', provider: async () => { throw Object.assign(Error('rate limited'), { unknown: false }); } });
    try {
        const id = await g.make();
        await g.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal((await g.finish(id)).status, 'failed');
        assert.equal((await g.req('POST', `/api/sessions/${id}/generate`, {})).statusCode, 200);
        await g.finish(id);
    }
    finally {
        await g.close();
    }
});
test('partial generation has one-image price; unrelated session cannot order its image', async () => {
    const photo = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const f = await fixture({ mode: 'seedream', imageCount: 2, provider: async () => ({ images: [photo], error: 'second image failed', unknown: true }) });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        const s = await f.finish(id);
        assert.equal(s.status, 'partial');
        assert.equal(s.error, 'second image failed');
        const o = (await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: s.images.map((x: any) => x.id) })).json();
        assert.equal(o.amount, 990);
        const id2 = await f.make();
        await f.req('POST', `/api/sessions/${id2}/generate`, {});
        await f.finish(id2);
        assert.equal((await f.req('POST', `/api/sessions/${id2}/orders`, { imageIds: [s.images[0].id] })).statusCode, 400);
    }
    finally {
        await f.close();
    }
});
test('expired links return 410 and startup cleanup removes images', async () => {
    let time = 1000;
    const f = await fixture({ clock: () => time, ttlMs: 10000 });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        const s = await f.finish(id);
        const o = (await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: [s.images[0].id] })).json();
        const p = (await f.req('POST', `/api/orders/${o.id}/simulate`, { outcome: 'paid' })).json();
        const token = new URL(p.pickupUrl).pathname.split('/').pop();
        time = 12000;
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).statusCode, 410);
        await f.restart();
        assert.equal(existsSync(path.join(f.dataDir, 'sessions', id)), false);
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).statusCode, 410);
    }
    finally {
        await f.close();
    }
});
test('security rejects remote kiosk, unknown Host, hostile Origin, non-JSON writes and invalid upload', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.app.inject({ url: '/api/admin', remoteAddress: '192.168.1.22', headers: { host: 'localhost:4377' } })).statusCode, 403);
        assert.equal((await f.app.inject({ url: '/api/health', headers: { host: 'evil.test' } })).statusCode, 403);
        assert.equal((await f.app.inject({ method: 'POST', url: '/api/sessions', headers: { host: 'localhost:4377', origin: 'https://evil.test' }, payload: { styleId: 'cinema' } })).statusCode, 403);
        assert.equal((await f.app.inject({ method: 'POST', url: '/api/sessions', headers: { host: 'localhost:4377', 'content-type': 'text/plain' }, payload: '{}' })).statusCode, 415);
        const id = await f.make();
        assert.equal((await f.req('POST', `/api/sessions/${id}/photo`, { dataUrl: 'data:image/jpeg;base64,YmFk' })).statusCode, 400);
        assert.equal((await f.req('GET', '/data/booth.sqlite')).statusCode, 404);
        assert.equal((await f.req('GET', '/api/styles')).json()[0].prompt, undefined);
    }
    finally {
        await f.close();
    }
});
test('ended session cannot be revived by a late provider response', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => release = r);
    const photo = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'blue' } }).jpeg().toBuffer();
    const f = await fixture({ mode: 'seedream', provider: async () => { await gate; return { images: [photo] }; } });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        await f.req('POST', `/api/sessions/${id}/end`, {});
        release();
        await new Promise(r => setTimeout(r, 30));
        const admin = (await f.req('GET', '/api/admin')).json();
        assert.equal(admin.sessions.find((s: any) => s.id === id).status, 'ended');
        assert.equal(admin.sessions.find((s: any) => s.id === id).images.length, 0);
    }
    finally {
        release();
        await f.close();
    }
});
test('startup marks interrupted generating tasks unknown without contacting provider', async () => {
    let calls = 0;
    const f = await fixture({ mode: 'seedream', provider: async () => { calls++; throw Error('should not run'); } });
    try {
        const id = await f.make();
        const db = new DatabaseSync(path.join(f.dataDir, 'booth.sqlite'));
        const row = db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(id)!;
        const stored = JSON.parse(String(row.json));
        stored.status = 'generating';
        db.prepare("UPDATE records SET json=? WHERE kind='session' AND id=?").run(JSON.stringify(stored), id);
        db.close();
        await f.restart();
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).json().status, 'unknown');
        assert.equal((await f.req('POST', `/api/sessions/${id}/generate`, {})).statusCode, 409);
        assert.equal(calls, 0);
    }
    finally {
        await f.close();
    }
});
test('image upload checks decoded format, not only data URL declaration', async () => {
    const f = await fixture();
    try {
        const id = await f.make();
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="red"/></svg>');
        assert.equal((await f.req('POST', `/api/sessions/${id}/photo`, { dataUrl: `data:image/png;base64,${svg.toString('base64')}` })).statusCode, 400);
    }
    finally {
        await f.close();
    }
});

test('kiosk generates one paid image and serves the original free without adding it to an order', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.req('GET','/api/health')).json().imageCount, 1);
        const id = await f.make();
        const photographed = (await f.req('GET',`/api/sessions/${id}`)).json();
        assert.equal(photographed.originalUrl, `/api/sessions/${id}/original`);
        const original = await f.req('GET', photographed.originalUrl);
        assert.equal(original.statusCode, 200);
        assert.equal(original.headers['content-type'], 'image/jpeg');
        assert.equal(original.headers['cache-control'], 'no-store');
        assert.equal((await sharp(original.rawPayload).metadata()).format, 'jpeg');
        const remote = await f.app.inject({url:photographed.originalUrl,remoteAddress:'192.168.1.20',headers:{host:'localhost:4377'}});
        assert.equal(remote.statusCode,403);
        await f.req('POST',`/api/sessions/${id}/generate`,{});
        const ready=await f.finish(id); assert.equal(ready.images.length,1);
        assert.equal((await f.req('GET',photographed.originalUrl)).statusCode,200);
        assert.equal((await f.req('POST',`/api/sessions/${id}/orders`,{imageIds:['original']})).statusCode,400);
        const order=(await f.req('POST',`/api/sessions/${id}/orders`,{imageIds:[ready.images[0].id]})).json();
        assert.equal(order.amount,990); assert.equal(order.imageIds.length,1);
        await f.req('POST',`/api/sessions/${id}/end`,{});
        assert.equal((await f.req('GET',photographed.originalUrl)).statusCode,410);
    } finally { await f.close(); }
});

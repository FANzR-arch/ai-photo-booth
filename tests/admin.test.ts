import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { parse } from 'dotenv';
import { createApp, type AppOptions } from '../apps/server/app.js';
import { setAdminPassword, adminPasswordPath, adminIdleMs, createAdminAccess } from '../apps/server/admin-auth.js';

const password = 'test-admin-password-2026';
async function fixture(configured = true, options: AppOptions = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'snap-admin-'));
    mkdirSync(path.join(root, 'config/styles'), { recursive: true });
    writeFileSync(path.join(root, 'config/styles/styles.json'), JSON.stringify([{ id: 'test', name: 'test', enabled: true, prompt: 'test', description: '', exampleUrl: '/examples/test.svg', size: '2K', version: 1 }]));
    writeFileSync(path.join(root, '.env.example'), 'GENERATION_MODE=seedream\nPORT=4377\nSEEDREAM_API_KEY=\nSEEDREAM_MODEL=\n');
    if (configured) await setAdminPassword(root, password);
    let time = Date.now();
    let app = await createApp({ mode: 'demo', ...options, rootDir: root, clock: () => time });
    const req = (url: string, payload?: any, cookie = '', extra: Record<string, string> = {}, method?: 'PUT' | 'POST') => app.inject({ method: method || (payload === undefined ? 'GET' : 'POST'), url, payload, headers: { host: 'localhost:4377', cookie, ...extra } });
    const login = async () => { const result = await req('/api/admin/auth/login', { password }); assert.equal(result.statusCode, 200); return String(result.headers['set-cookie']).split(';')[0]; };
    return { root, req, login, get app() { return app; }, advance: (ms: number) => time += ms, restart: async () => { await app.close(); app = await createApp({ mode: 'demo', ...options, rootDir: root, clock: () => time }); }, close: async () => { await app.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('admin is closed before local setup while customer routes remain available', async () => {
    const f = await fixture(false);
    try {
        assert.equal((await f.req('/api/admin/auth/status')).json().configured, false);
        assert.equal((await f.req('/api/admin/auth/login', { password })).statusCode, 409);
        for (const url of ['/api/admin', '/api/admin/config', '/api/admin/styles/test']) assert.equal((await f.req(url)).statusCode, 401);
        assert.equal((await f.req('/api/styles')).statusCode, 200);
        assert.equal((await f.req('/api/sessions', { styleId: 'test' })).statusCode, 200);
        assert.equal((await f.req('/api/admin/config', { apiKey: 'test-key', model: 'model' }, '', {}, 'PUT')).statusCode, 401);
    } finally { await f.close(); }
});

test('admin login uses a protected cookie, rejects forged tokens and revokes on logout/restart/reset', async () => {
    const f = await fixture();
    try {
        const stored = readFileSync(adminPasswordPath(f.root), 'utf8');
        assert.equal(stored.includes(password), false);
        assert.equal((await f.req('/api/admin', undefined, 'snap_admin_4377=forged')).statusCode, 401);
        const response = await f.req('/api/admin/auth/login', { password });
        assert.equal(response.statusCode, 200);
        const setCookie = String(response.headers['set-cookie']);
        assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/); assert.match(setCookie, /Path=\/api\/admin/);
        let cookie = setCookie.split(';')[0];
        assert.equal((await f.req('/api/admin', undefined, cookie)).statusCode, 200);
        assert.equal((await f.req('/api/admin/auth/logout', {}, cookie)).statusCode, 200);
        assert.equal((await f.req('/api/admin', undefined, cookie)).statusCode, 401);
        cookie = await f.login(); await f.restart();
        assert.equal((await f.req('/api/admin', undefined, cookie)).statusCode, 401);
        cookie = await f.login(); await setAdminPassword(f.root, 'changed-test-password');
        assert.equal((await f.req('/api/admin', undefined, cookie)).statusCode, 401);
        writeFileSync(adminPasswordPath(f.root), 'corrupt');
        assert.equal((await f.req('/api/admin/auth/status')).statusCode, 503);
    } finally { await f.close(); }
});

test('idle expiration does not extend on background reads and explicit activity can renew it', async () => {
    const f = await fixture();
    try {
        let cookie = await f.login(); f.advance(adminIdleMs - 1);
        assert.equal((await f.req('/api/admin', undefined, cookie)).statusCode, 200);
        f.advance(1); assert.equal((await f.req('/api/admin', undefined, cookie)).statusCode, 401);
        cookie = await f.login(); f.advance(adminIdleMs - 1);
        assert.equal((await f.req('/api/admin/auth/touch', {}, cookie)).statusCode, 200);
        f.advance(2); assert.equal((await f.req('/api/admin', undefined, cookie)).statusCode, 200);
        f.advance(adminIdleMs); assert.equal((await f.req('/api/admin/auth/touch', {}, cookie)).statusCode, 401);
    } finally { await f.close(); }
});

test('wrong password attempts are limited and LAN or cross-origin requests cannot log in', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { password }, remoteAddress: '192.168.1.2', headers: { host: 'localhost:4377' } })).statusCode, 403);
        assert.equal((await f.req('/api/admin/auth/login', { password }, '', { origin: 'https://attacker.example' })).statusCode, 403);
        for (let i = 0; i < 5; i++) assert.equal((await f.req('/api/admin/auth/login', { password: 'incorrect' })).statusCode, 401);
        assert.equal((await f.req('/api/admin/auth/login', { password })).statusCode, 429);
        f.advance(15 * 60_000); assert.ok(await f.login());
    } finally { await f.close(); }
});

test('API settings preserve device config, mask credentials and apply immediately', async () => {
    const f = await fixture();
    try {
        writeFileSync(path.join(f.root, '.env'), 'PORT=4455\nPICKUP_BASE_URL=http://192.168.1.20:4455\nSEEDREAM_API_KEY=test-saved-key-12345\nSEEDREAM_MODEL=old-model\n');
        const cookie = await f.login(), key = 'test-replacement-key-67890';
        const saved = await f.req('/api/admin/config', { apiKey: key, model: 'new-model' }, cookie, {}, 'PUT');
        assert.equal(saved.statusCode, 200); assert.equal(saved.body.includes(key), false);
        assert.equal(saved.json().restartRequired, false); assert.equal(saved.json().providerVerified, false);
        assert.equal(saved.json().activeModel, 'new-model');
        assert.equal((await f.req('/api/health')).json().model, 'new-model');
        const disk = parse(readFileSync(path.join(f.root, '.env')));
        assert.equal(disk.PORT, '4455'); assert.equal(disk.PICKUP_BASE_URL, 'http://192.168.1.20:4455'); assert.equal(disk.SEEDREAM_API_KEY, key);
        assert.equal((await f.req('/api/admin/config', { apiKey: '', model: 'next-model' }, cookie, {}, 'PUT')).statusCode, 200);
        assert.equal(parse(readFileSync(path.join(f.root, '.env'))).SEEDREAM_API_KEY, key);
        const before = readFileSync(path.join(f.root, '.env'), 'utf8');
        assert.equal((await f.req('/api/admin/config', { apiKey: 'injected\nPORT=9999', model: 'x' }, cookie, {}, 'PUT')).statusCode, 400);
        assert.equal(readFileSync(path.join(f.root, '.env'), 'utf8'), before);
        assert.equal((await f.req('/api/health')).json().mode, 'demo');
    } finally { await f.close(); }
});

test('provider configuration cannot be saved while a generation is in flight', async () => {
    let finish!: (value: { images: Buffer[] }) => void;
    const pending = new Promise<{ images: Buffer[] }>(resolve => { finish = resolve; });
    const f = await fixture(true, { mode: 'seedream', provider: () => pending });
    try {
        const cookie = await f.login();
        const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).jpeg().toBuffer();
        const session = (await f.req('/api/sessions', { styleId: 'test' })).json();
        assert.equal((await f.req(`/api/sessions/${session.id}/photo`, { dataUrl: `data:image/jpeg;base64,${photo.toString('base64')}`, orientation: 'portrait' })).statusCode, 200);
        const order = (await f.req(`/api/sessions/${session.id}/orders`, {})).json();
        await f.req(`/api/orders/${order.id}/simulate`, { outcome: 'paid' });
        assert.equal((await f.req(`/api/sessions/${session.id}/generate`, {})).statusCode, 200);
        assert.equal((await f.req('/api/admin/config', { apiKey: 'test-key', model: 'test-model' }, cookie, {}, 'PUT')).statusCode, 409);
    } finally { finish({ images: [] }); await f.close(); }
});

test('first-use browser setup unlocks immediately and cannot overwrite an existing password', async () => {
    const f = await fixture(false, { mode: 'seedream' });
    try {
        for (const bad of ['', 'short', '        ', 'new\npassword', null]) {
            assert.equal((await f.req('/api/admin/auth/setup', { password: bad })).statusCode, 400);
            assert.equal(existsSync(adminPasswordPath(f.root)), false);
        }
        assert.equal((await f.req('/api/admin/auth/setup', { password }, '', { origin: 'https://attacker.example' })).statusCode, 403);
        assert.equal((await f.app.inject({ method: 'POST', url: '/api/admin/auth/setup', payload: { password }, remoteAddress: '192.168.1.2', headers: { host: 'localhost:4377' } })).statusCode, 403);
        const setup = await f.req('/api/admin/auth/setup', { password });
        assert.equal(setup.statusCode, 200); assert.equal(setup.json().authenticated, true);
        assert.match(String(setup.headers['set-cookie']), /HttpOnly.*SameSite=Strict/);
        const cookie = String(setup.headers['set-cookie']).split(';')[0];
        const stored = readFileSync(adminPasswordPath(f.root), 'utf8');
        assert.equal(stored.includes(password), false);
        assert.equal((await f.req('/api/admin/auth/setup', { password: 'replacement-password' })).statusCode, 409);
        assert.equal(readFileSync(adminPasswordPath(f.root), 'utf8'), stored);
        const before = process.env.SEEDREAM_API_KEY;
        const save = await f.req('/api/admin/config', { apiKey: 'test-only-browser-key', model: 'test-model' }, cookie, {}, 'PUT');
        assert.equal(save.statusCode, 200); assert.equal(save.json().restartRequired, false);
        const health = (await f.req('/api/health')).json();
        assert.equal(health.configured, true); assert.equal(health.model, 'test-model');
        assert.equal(process.env.SEEDREAM_API_KEY, before);
        assert.ok(await f.login());
    } finally { await f.close(); }
});

test('simultaneous initial setup across instances creates only one password', async () => {
    const f = await fixture(false);
    try {
        const a = createAdminAccess(f.root, Date.now), b = createAdminAccess(f.root, Date.now);
        const results = await Promise.allSettled([a.setup(password), b.setup('another-password')]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
        assert.equal(failed.reason.statusCode, 409);
    } finally { await f.close(); }
});

test('next generation uses the saved key and model with no upstream request during save', async () => {
    const originalFetch = globalThis.fetch;
    const f = await fixture(true, { mode: 'seedream' });
    let calls = 0;
    try {
        const photo = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'white' } }).jpeg().toBuffer();
        globalThis.fetch = async (_url, options) => {
            calls++;
            assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-hot-key');
            assert.equal(JSON.parse(String(options?.body)).model, 'test-hot-model');
            return new Response(JSON.stringify({ data: [{ b64_json: photo.toString('base64') }] }), { status: 200 });
        };
        const cookie = await f.login();
        assert.equal((await f.req('/api/admin/config', { apiKey: 'test-hot-key', model: 'test-hot-model' }, cookie, {}, 'PUT')).statusCode, 200);
        assert.equal(calls, 0);
        const session = (await f.req('/api/sessions', { styleId: 'test' })).json();
        await f.req(`/api/sessions/${session.id}/photo`, { dataUrl: `data:image/jpeg;base64,${photo.toString('base64')}`, orientation: 'portrait' });
        const order = (await f.req(`/api/sessions/${session.id}/orders`, {})).json();
        await f.req(`/api/orders/${order.id}/simulate`, { outcome: 'paid' });
        assert.equal((await f.req(`/api/sessions/${session.id}/generate`, {})).statusCode, 200);
        let status = 'generating';
        for (let attempt = 0; attempt < 100 && status === 'generating'; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 20));
            status = (await f.req(`/api/sessions/${session.id}`)).json().status;
        }
        assert.equal(status, 'ready'); assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; await f.close(); }
});

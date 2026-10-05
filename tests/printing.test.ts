import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { createApp } from '../apps/server/app.js';
import { setAdminPassword } from '../apps/server/admin-auth.js';
import { createMacPrinter, parsePrinterOptions, type PrintCommand } from '../apps/server/mac-printer.js';
import { framePhoto } from '../apps/server/photo-frame.js';
import { defaultCaption } from '../packages/shared/frames.js';
import type { PrinterSettings } from '../packages/shared/printing.js';
const defaults: PrinterSettings = { enabled: true, queue: 'EPSON_L805_Series', paper: 'EPKG', media: '13', quality: '308', copies: 1, fit: 'contain', paperConfirmed: true };
const driver = 'PageSize/Paper Size: *A4 EPKG EPKG.NMgn\nMediaType/Media: *0 13 15\nEPIJ_Qual/Quality: *303 308\n';
async function fixture(submit?: (args: string[]) => Promise<string>) {
    const root = mkdtempSync(path.join(tmpdir(), 'snap-print-'));
    mkdirSync(path.join(root, 'config/styles'), { recursive: true });
    writeFileSync(path.join(root, 'config/styles/styles.json'), JSON.stringify([{ id: 'test', name: 'test', enabled: true, prompt: 'test', size: 'HQ', version: 1 }]));
    await setAdminPassword(root, 'test-print-password');
    const calls: { file: string; args: string[] }[] = [];
    const printed: Buffer[] = [];
    const run: PrintCommand = async (file, args) => {
        calls.push({ file, args });
        if (file.endsWith('/lpstat')) return 'EPSON_L805_Series 自 2026 起接受请求\n';
        if (file.endsWith('/lpoptions')) return driver;
        if (file.endsWith('/lp')) { printed.push(readFileSync(args.at(-1)!)); return submit ? submit(args) : 'request id is EPSON_L805_Series-42 (1 file(s))'; }
        throw Error('No real commands permitted');
    };
    const printer = createMacPrinter(root, run, 'darwin');
    const image = await sharp({ create: { width: 48, height: 64, channels: 3, background: 'red' } }).jpeg().toBuffer();
    let time = Date.now();
    const start = () => createApp({ rootDir: root, mode: 'seedream', provider: async () => ({ images: [image] }), printer, clock: () => time });
    let app = await start();
    const req = (url: string, payload?: any, cookie = '', method?: 'POST' | 'PUT') => app.inject({ method: method || (payload === undefined ? 'GET' : 'POST'), url, payload, headers: { host: 'localhost:4377', cookie } });
    const login = async () => String((await req('/api/admin/auth/login', { password: 'test-print-password' })).headers['set-cookie']).split(';')[0];
    const ready = async () => {
        const s = (await req('/api/sessions', { styleId: 'test' })).json();
        await req(`/api/sessions/${s.id}/photo`, { dataUrl: `data:image/jpeg;base64,${image.toString('base64')}`, orientation: 'portrait' });
        await req(`/api/sessions/${s.id}/generate`, {});
        for (let i = 0; i < 100; i++) { const latest = (await req(`/api/sessions/${s.id}`)).json(); if (latest.status === 'ready') return latest; await new Promise(r => setTimeout(r, 10)); }
        throw Error('Generation fixture failed');
    };
    return { root, req, ready, printer, calls, printed, login, get app() { return app; }, advance: (ms: number) => time += ms,
        restart: async () => { await app.close(); app = await start(); },
        close: async () => { await app.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('printer options use actual driver choices and readable PPD labels', () => {
    const options = parsePrinterOptions(driver, '*PageSize EPKG/4 x 6 in: "..."\n*MediaType 13/Photo Paper: "..."');
    assert.equal(options[0].choices.find(c => c.value === 'EPKG')?.label, '4 x 6 in');
    assert.equal(options[1].choices.find(c => c.value === '13')?.label, 'Photo Paper');
    assert.equal(options[0].choices[0].value, 'A4');
});
test('printer configuration requires admin and explicit physical paper confirmation; no print on save', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.req('/api/printing')).json().configured, false);
        assert.equal((await f.req('/api/admin/printer')).statusCode, 401);
        const cookie = await f.login();
        assert.deepEqual((await f.req('/api/admin/printer', undefined, cookie)).json().queues, ['EPSON_L805_Series']);
        for (const changes of [{ paperConfirmed: false }, { paper: 'guessed-6-inch' }, { queue: 'EPSON;touch' }, { media: '-o' }, { copies: 0 }, { fit: 'unknown' }])
            assert.equal((await f.req('/api/admin/printer', { ...defaults, ...changes }, cookie, 'PUT')).statusCode, 400);
        assert.equal((await f.req('/api/admin/printer', defaults, cookie, 'PUT')).statusCode, 200);
        assert.equal((await f.req('/api/printing')).json().configured, true);
        assert.equal(f.calls.filter(c => c.file.endsWith('/lp')).length, 0);
        await f.restart();
        assert.equal(f.printer.settings()?.paper, 'EPKG');
    } finally { await f.close(); }
});
test('a paid package click submits final framed full image once and survives restart', async () => {
    const f = await fixture();
    try {
        await f.printer.save(defaults); const s = await f.ready(), imageId = s.images[0].id;
        const caption = { ...defaultCaption, text: '我们的照片' };
        await f.req(`/api/sessions/${s.id}/frame`, { frame: 'film', caption });
        const first = (await f.req(`/api/sessions/${s.id}/print`, { imageId })).json();
        assert.equal(first.status, 'submitted'); assert.equal(first.cupsId, 'EPSON_L805_Series-42');
        assert.equal(first.copies, 1);
        const expected = await framePhoto(readFileSync(path.join(f.root, 'data/sessions', s.id, `${imageId}.jpg`)), 'film', caption);
        assert.deepEqual(f.printed[0], expected);
        const args = f.calls.find(c => c.file.endsWith('/lp'))!.args;
        assert.ok(args.includes('PageSize=EPKG')); assert.ok(args.includes('MediaType=13')); assert.ok(args.includes('fit-to-page'));
        assert.equal(args[args.indexOf('-n') + 1], '1');
        assert.deepEqual(readdirSync(path.join(f.root, 'data/print-jobs')), []);
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId })).json().id, first.id);
        await f.restart();
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId })).json().status, 'submitted');
        assert.equal(f.printed.length, 1);
    } finally { await f.close(); }
});
test('printing needs a ready photo that belongs to the session', async () => {
    const f = await fixture();
    try {
        await f.printer.save(defaults); const s = await f.ready(), imageId = s.images[0].id;
        const other = (await f.req('/api/sessions', { styleId: 'test' })).json();
        assert.equal((await f.req(`/api/sessions/${other.id}/print`, { imageId })).statusCode, 409);
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId: 'not-this-session' })).statusCode, 409);
        assert.equal(f.printed.length, 0);
    } finally { await f.close(); }
});
test('concurrent clicks dispatch once and config cannot change while submission is pending', async () => {
    let release!: () => void; let entered!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; }); const started = new Promise<void>(resolve => { entered = resolve; });
    const f = await fixture(async () => { entered(); await hold; return 'request id is EPSON_L805_Series-43 (1 file(s))'; });
    try {
        await f.printer.save(defaults); const s = await f.ready(), imageId = s.images[0].id, cookie = await f.login();
        const first = f.req(`/api/sessions/${s.id}/print`, { imageId }); await started;
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId })).json().status, 'submitting');
        assert.equal((await f.req('/api/admin/printer', { enabled: false }, cookie, 'PUT')).statusCode, 409);
        release(); assert.equal((await first).json().status, 'submitted'); assert.equal(f.printed.length, 1);
    } finally { release(); await f.close(); }
});
test('uncertain CUPS result is durable and never resubmitted after retry or restart', async () => {
    const f = await fixture(async () => { throw Error('timeout after possible acceptance'); });
    try {
        await f.printer.save(defaults); const s = await f.ready(), imageId = s.images[0].id;
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId })).json().status, 'unknown');
        await f.restart();
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId })).json().status, 'unknown');
        assert.equal(f.printed.length, 1);
    } finally { await f.close(); }
});
test('unconfigured, foreign, expired and remote photos never reach a print command', async () => {
    const f = await fixture();
    try {
        const s = await f.ready(), imageId = s.images[0].id;
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId })).json().status, 'failed');
        await f.printer.save(defaults);
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId: 'other-image' })).statusCode, 409);
        for (const headers of [{ host: 'localhost:4377', origin: 'https://attacker.example' }, { host: 'localhost:4377', 'sec-fetch-site': 'cross-site' }])
            assert.equal((await f.app.inject({ method: 'POST', url: `/api/sessions/${s.id}/print`, payload: { imageId }, headers })).statusCode, 403);
        assert.equal((await f.app.inject({ method: 'POST', url: `/api/sessions/${s.id}/print`, payload: { imageId }, headers: { host: 'localhost:4377' }, remoteAddress: '192.168.1.3' })).statusCode, 403);
        f.advance(600001);
        assert.equal((await f.req(`/api/sessions/${s.id}/print`, { imageId })).statusCode, 410);
        assert.equal(f.printed.length, 0);
    } finally { await f.close(); }
});
test('non-Mac adapter cannot prepare or submit physical printing', async () => {
    const f = await fixture();
    try {
        const printer = createMacPrinter(f.root, async () => { throw Error('must not execute'); }, 'win32');
        await assert.rejects(() => printer.save(defaults), /Mac/);
        await assert.rejects(() => printer.submit('x.jpg', defaults, 'test'), /Mac/);
    } finally { await f.close(); }
});

test('restart marks an interrupted submission uncertain instead of printing again', async () => {
    const f = await fixture();
    try {
        const s = await f.ready(), imageId = s.images[0].id;
        const job = (await f.req(`/api/sessions/${s.id}/print`, { imageId })).json();
        assert.equal(job.status, 'failed');
        const db = new DatabaseSync(path.join(f.root, 'data/booth.sqlite'));
        db.prepare('UPDATE records SET json=? WHERE kind=? AND id=?').run(JSON.stringify({ ...job, status: 'submitting' }), 'print', job.id); db.close();
        await f.printer.save(defaults); await f.restart();
        const result = (await f.req(`/api/sessions/${s.id}/print`, { imageId })).json();
        assert.equal(result.status, 'unknown'); assert.equal(f.printed.length, 0);
    } finally { await f.close(); }
});

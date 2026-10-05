import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../apps/server/app.js';
import { setAdminPassword } from '../apps/server/admin-auth.js';
import { generationPrompt } from '../apps/server/generation-prompt';
import type { Style } from '../packages/shared/types';

const styles: Style[] = JSON.parse(readFileSync('config/styles/styles.json', 'utf8'));

test('every prompt opens with the subject and proportion anchor and only carries a beauty line when enabled', () => {
    for (const style of styles) {
        const orientation = style.sceneOrientation ?? 'portrait';
        const plain = generationPrompt(style, 'theme', orientation);
        assert.ok(plain.startsWith('参考照片'), style.id);
        assert.match(plain.split('\n')[0], /肩宽约为头宽的2到2.5倍/);
        assert.match(plain.split('\n')[0], /85mm人像镜头/);
        assert.doesNotMatch(plain, /美颜：/);
        assert.equal(plain, generationPrompt(style, 'theme', orientation, { beauty: 'off' }));
        for (const beauty of ['light', 'medium'] as const) {
            const prompt = generationPrompt(style, 'theme', orientation, { beauty });
            assert.equal(prompt.split('美颜：').length, 2, style.id);
            assert.ok(prompt.indexOf('美颜：') > prompt.indexOf(style.prompt!), style.id);
            assert.ok(prompt.indexOf('美颜：') > prompt.indexOf('表情放松自然'), style.id);
            assert.match(prompt, /不改脸型与五官/);
        }
    }
});

test('business template no longer folds the arms across the chest', () => {
    assert.doesNotMatch(styles.find(s => s.id === 'business')!.prompt!, /双臂.*交叉/);
});

test('portrait settings default to light beauty with reframing, persist, and reject bad input', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'booth-portrait-'));
    mkdirSync(path.join(root, 'config/styles'), { recursive: true });
    writeFileSync(path.join(root, 'config/styles/styles.json'), JSON.stringify([{ id: 'cinema', name: '电影', description: '测试', prompt: 'keep identity', version: 1, enabled: true, exampleUrl: '/examples/cinema.svg', size: '2K', color: '#f00' }]));
    await setAdminPassword(root, 'test-admin-password-only');
    const prompts: string[] = [], photos: Buffer[] = [];
    const provider = async (input: { photo: Buffer; prompt: string }) => { prompts.push(input.prompt); photos.push(input.photo); return { images: [await sharp({ create: { width: 48, height: 64, channels: 3, background: '#aaa' } }).jpeg().toBuffer()] }; };
    let app = await createApp({ mode: 'seedream', rootDir: root, dataDir: path.join(root, 'data'), provider });
    let cookie = '';
    const req = async (method: string, url: string, payload?: unknown) => {
        if (url.startsWith('/api/admin') && !cookie) {
            const login = await app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { password: 'test-admin-password-only' }, headers: { host: 'localhost:4377' } });
            cookie = String(login.headers['set-cookie']).split(';')[0];
        }
        return app.inject({ method: method as any, url, payload: payload as any, headers: { host: 'localhost:4377', cookie } });
    };
    try {
        assert.deepEqual((await req('GET', '/api/admin/portrait')).json(), { beauty: 'light', reframe: true });
        assert.equal((await req('PUT', '/api/admin/portrait', { beauty: 'strong', reframe: true })).statusCode, 400);
        assert.equal((await req('PUT', '/api/admin/portrait', { beauty: 'medium', reframe: 'yes' })).statusCode, 400);
        assert.deepEqual((await req('PUT', '/api/admin/portrait', { beauty: 'medium', reframe: false })).json(), { beauty: 'medium', reframe: false });
        await app.close(); cookie = '';
        app = await createApp({ mode: 'seedream', rootDir: root, dataDir: path.join(root, 'data'), provider });
        assert.deepEqual((await req('GET', '/api/admin/portrait')).json(), { beauty: 'medium', reframe: false });
        // Generation applies the saved beauty level; a faceless photo with reframing on is sent unchanged and recorded.
        const photo = await sharp({ create: { width: 160, height: 200, channels: 3, background: '#f2a399' } }).jpeg().toBuffer();
        const start = async () => {
            const s = (await req('POST', '/api/sessions', { styleId: 'cinema' })).json();
            await req('POST', `/api/sessions/${s.id}/photo`, { dataUrl: `data:image/jpeg;base64,${photo.toString('base64')}`, orientation: 'portrait' });
            assert.equal((await req('POST', `/api/sessions/${s.id}/generate`, {})).statusCode, 200);
            for (let i = 0; i < 300; i++) { if ((await req('GET', `/api/sessions/${s.id}`)).json().status !== 'generating') break; await new Promise(r => setTimeout(r, 20)); }
            return s.id as string;
        };
        const first = await start();
        assert.match(prompts[0], /中度美颜：/);
        assert.equal(existsSync(path.join(root, 'data/sessions', first, 'reference.json')), false);
        await req('PUT', '/api/admin/portrait', { beauty: 'off', reframe: true });
        const second = await start();
        assert.doesNotMatch(prompts[1], /美颜：/);
        assert.equal(photos[1].equals(photos[0]), true, 'no face: original photo is sent');
        const record = JSON.parse(readFileSync(path.join(root, 'data/sessions', second, 'reference.json'), 'utf8'));
        assert.equal(record.applied, false);
        assert.equal(record.reason, '未检测到人脸');
        // Viewfinder distance check: a faceless frame answers 'none'; anything but a small JPEG data URL is rejected.
        const frame = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#d9c9b0' } }).jpeg().toBuffer();
        const check = await app.inject({ method: 'POST', url: '/api/camera/check', payload: { dataUrl: `data:image/jpeg;base64,${frame.toString('base64')}` }, headers: { host: 'localhost:4377' } });
        assert.equal(check.statusCode, 200);
        assert.deepEqual(check.json(), { faces: 0, faceHeightRatio: 0, hint: 'none' });
        assert.equal((await app.inject({ method: 'POST', url: '/api/camera/check', payload: { dataUrl: 'data:image/png;base64,AAAA' }, headers: { host: 'localhost:4377' } })).statusCode, 400);
    } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
});

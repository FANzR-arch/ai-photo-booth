// DOM regressions use synthetic files and mocked HTTP only; never access a camera or cloud API.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import QRCode from 'qrcode';
import { Booth, Pickup } from '../apps/web/src/Booth';
import type { Session } from '../packages/shared/types';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }
const image = 'data:image/png;base64,c3ludGhldGlj';
const style = { id: 'cinema', name: '电影人像', description: '电影感测试', enabled: true, version: 1, exampleUrl: '/examples/cinema.svg', size: '2K', color: '#eed8a0' };
const fresh = (id = 'session-1'): Session => ({ id, styleId: 'cinema', styleName: '电影人像', status: 'created', mode: 'demo', createdAt: Date.now(), expiresAt: Date.now() + 86400000, images: [] });
type Route = (url: string, body: any) => unknown | Promise<unknown>;
async function harness(route?: Route, options: {
    saved?: string;
    unconfigured?: boolean;
    deferReader?: boolean;
    deferQr?: boolean;
    pickup?: boolean;
    camera?: boolean;
} = {}) {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: options.pickup ? 'http://localhost:4377/pickup/token' : 'http://localhost:4377/' });
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const put = (key: string, value: unknown) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, location: dom.window.location, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true }))
        put(key, value);
    if (options.saved)
        dom.window.localStorage.setItem('snap-session', options.saved);
    const readers: Array<() => void> = [];
    class Reader {
        result = image;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() { if (options.deferReader)
            readers.push(() => this.onload?.());
        else
            this.onload?.(); }
    }
    put('FileReader', Reader);
    let cameraCalls = 0;
    let stopped = 0;
    const cameraTrack = new dom.window.EventTarget();
    Object.assign(cameraTrack, { stop: () => { stopped++; } });
    if (options.camera) {
        Object.defineProperty(dom.window.navigator, 'mediaDevices', { value: { getUserMedia: async () => {
            cameraCalls++;
            return { active: true, getTracks: () => [cameraTrack], getVideoTracks: () => [cameraTrack] };
        } } });
        dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    }
    // Synthetic media only; these tests never access real hardware.
    const timers = new Map<number, {
        callback: () => void;
        ms: number;
    }>();
    let timerId = 0;
    put('setInterval', (callback: () => void, ms: number) => { timers.set(++timerId, { callback, ms }); return timerId; });
    put('clearInterval', (id: number) => timers.delete(id));
    const qrs: Array<ReturnType<typeof deferred<string>>> = [];
    const originalQr = QRCode.toDataURL;
    QRCode.toDataURL = ((..._args: any[]) => { if (options.deferQr) {
        const d = deferred<string>();
        qrs.push(d);
        return d.promise;
    } return Promise.resolve('data:image/png;base64,cXI='); }) as typeof QRCode.toDataURL;
    const calls: Array<{
        url: string;
        body: any;
    }> = [];
    let current = fresh();
    let seq = 0;
    put('fetch', async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, body });
        const custom = route ? await route(url, body) : undefined;
        let result = custom;
        if (result === undefined) {
            if (url === '/api/health')
                result = { mode: options.unconfigured ? 'seedream' : 'demo', configured: !options.unconfigured, model: '', imageCount: 2, pickupBaseUrl: 'http://localhost:4377', lanUrls: [] };
            else if (url === '/api/styles')
                result = [style];
            else if (url === '/api/sessions') {
                current = fresh(`session-${++seq}`);
                result = current;
            }
            else if (url.endsWith('/photo')) {
                current = { ...current, status: 'photographed' };
                result = current;
            }
            else if (url.endsWith('/generate')) {
                current = { ...current, status: 'generating' };
                result = current;
            }
            else if (url.endsWith('/orders'))
                result = { id: `order-${seq}`, sessionId: current.id, imageIds: body.imageIds, amount: body.imageIds.length === 1 ? 990 : 1990, status: 'pending', createdAt: Date.now() };
            else if (url.endsWith('/simulate'))
                result = { order: { id: `order-${seq}`, status: body.outcome }, ...(body.outcome === 'paid' ? { pickupUrl: `http://localhost:4377/pickup/token-${seq}` } : {}) };
            else if (url.endsWith('/end'))
                result = { ok: true };
            else if (url.startsWith('/api/sessions/'))
                result = { ...current, status: 'ready', images: [{ id: 'one', previewUrl: '/preview/one' }, { id: 'two', previewUrl: '/preview/two' }] };
            else
                throw Error(`Unexpected route ${url}`);
        }
        return { ok: true, status: 200, json: async () => result };
    });
    const root = createRoot(dom.window.document.getElementById('root')!);
    const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
    await act(async () => { root.render(options.pickup ? <Pickup /> : <Booth />); });
    await flush();
    const text = () => dom.window.document.body.textContent || '';
    const button = (name: string) => { const el = Array.from(dom.window.document.querySelectorAll('button')).find(b => b.textContent?.includes(name)); assert.ok(el, `button missing: ${name}\n${text()}`); return el; };
    const click = async (name: string) => { await act(async () => { button(name).click(); }); await flush(); };
    const upload = async () => { const input = dom.window.document.querySelector('input[type=file]') as HTMLInputElement; assert.ok(input); Object.defineProperty(input, 'files', { configurable: true, value: [{ type: 'image/png', size: 100 }] }); await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await flush(); };
    const consent = async () => { const input = dom.window.document.querySelector('input[type=checkbox]') as HTMLInputElement; assert.ok(input); await act(async () => { input.click(); }); await flush(); };
    const tick = async (ms: number) => { await act(async () => { for (const t of [...timers.values()])
        if (t.ms === ms)
            t.callback(); }); await flush(); };
    const cleanup = async () => { await act(async () => root.unmount()); QRCode.toDataURL = originalQr; dom.window.close(); for (const [key, desc] of saved) {
        if (desc)
            Object.defineProperty(globalThis, key, desc);
        else
            delete (globalThis as any)[key];
    } };
    return { dom, text, button, click, upload, consent, tick, flush, cleanup, calls, readers, qrs, cameraTrack, cameraCalls: () => cameraCalls, stopped: () => stopped };
}

test('theme entrance restarts after entry refresh replaces the cached home styles', async () => {
    let requests = 0;
    const refreshed = deferred<unknown>();
    const h = await harness(url => url === '/api/styles' && ++requests > 1 ? refreshed.promise : undefined);
    const animations: Array<{ cancelled: boolean }> = [];
    try {
        h.dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
            const card = this.classList.contains('theme-card');
            return { left: 0, top: 100, right: card ? 200 : 1000, bottom: card ? 400 : 800,
                width: card ? 200 : 1000, height: card ? 300 : 700, x: 0, y: 100, toJSON() {} };
        };
        h.dom.window.HTMLElement.prototype.animate = function () {
            const state = { cancelled: false };
            if (this.classList.contains('theme-card')) animations.push(state);
            return { cancel: () => { state.cancelled = true; } } as Animation;
        };
        await h.click('开始拍照');
        assert.ok(animations.length > 0, 'cached cards began their entrance');
        assert.ok(animations.every(a => a.cancelled), 'refresh removes cached cards');
        await act(async () => refreshed.resolve([style]));
        await h.flush();
        assert.ok(animations.some(a => !a.cancelled), 'new cards must have a live entrance after refresh');
        const count = animations.length;
        await h.click('暂停轮播');
        assert.equal(animations.length, count, 'ordinary UI updates must not replay entrance');
    } finally { await h.cleanup(); }
});

test('real mode requests camera only after theme selection and waits for a playable frame; disconnect cancels countdown', async () => {
    const h = await harness(url => url === '/api/health' ? { mode: 'seedream', configured: true, imageCount: 1 } : undefined, { camera: true });
    try {
        assert.equal(h.cameraCalls(), 0);
        await h.click('开始拍照');
        assert.equal(h.cameraCalls(), 0);
        await h.click('电影人像');
        assert.equal(h.cameraCalls(), 1);
        assert.doesNotMatch(h.text(), /使用示例照片/);
        const capture = h.dom.window.document.querySelector('.capture-button') as HTMLButtonElement;
        assert.equal(capture.disabled, true);
        const v = h.dom.window.document.querySelector('video')!;
        Object.defineProperties(v, { videoWidth: { value: 1280 }, videoHeight: { value: 960 } });
        await act(async () => { v.dispatchEvent(new h.dom.window.Event('playing')); });
        assert.equal(capture.disabled, false);
        await act(async () => capture.click());
        assert.ok(h.dom.window.document.querySelector('.countdown'));
        await act(async () => h.cameraTrack.dispatchEvent(new h.dom.window.Event('ended')));
        assert.equal(capture.disabled, true);
        assert.equal(h.dom.window.document.querySelector('.countdown'), null);
        assert.match(h.text(), /摄像头已断开/);
        assert.ok(h.stopped() > 0);
        assert.equal(h.calls.some(c => c.url.endsWith('/generate')), false);
    } finally { await h.cleanup(); }
});

test('scroll gallery exposes all themes without creating sessions before selection', async () => {
    const h = await harness(url => url === '/api/styles' ? Array.from({ length: 7 }, (_, i) => ({ ...style, id: `style-${i}`, name: `主题${i}` })) : undefined);
    try {
        await h.click('开始拍照');
        assert.equal(h.dom.window.document.querySelectorAll('.theme-card').length, 7);
        assert.ok(h.dom.window.document.querySelector('.theme-scroll'));
        assert.doesNotMatch(h.text(), /更多主题|上一页/);
        assert.equal(h.calls.some(c => c.url === '/api/sessions'), false);
        await h.click('主题6');
        assert.equal(h.calls.find(c => c.url === '/api/sessions')?.body.styleId, 'style-6');
    } finally { await h.cleanup(); }
});

test('real mode does not restore an old demo session', async () => {
    const h = await harness(url => url === '/api/health' ? { mode: 'seedream', configured: true, imageCount: 1 } : undefined, { saved: 'old-demo' });
    try {
        assert.ok(h.dom.window.document.querySelector('.attract-screen'));
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), null);
        assert.equal(h.calls.some(c => c.url.endsWith('/generate')), false);
    } finally { await h.cleanup(); }
});

test('theme covers rotate through four roles and pause without starting a session', async () => {
    const h = await harness();
    try {
        await h.click('开始拍照');
        const active = () => h.dom.window.document.querySelector('.theme-portrait.is-current img')?.getAttribute('alt');
        assert.match(active() || '', /青年女性/);
        await h.tick(6500);
        assert.match(active() || '', /成年男性/);
        await h.click('暂停轮播');
        await h.tick(6500);
        assert.match(active() || '', /成年男性/);
        await h.click('继续轮播');
        await h.tick(6500);
        assert.match(active() || '', /银发女性/);
        await h.tick(6500);
        assert.match(active() || '', /儿童/);
        assert.equal(h.calls.some(c => c.url === '/api/sessions'), false);
    } finally { await h.cleanup(); }
});

test('custom admin cover is preserved and failed built-in sheet falls back to existing cover', async () => {
    const h = await harness(url => url === '/api/styles' ? [style, { ...style, id: 'custom', name: '自定义', exampleUrl: '/custom-cover.png' }] : undefined);
    try {
        await h.click('开始拍照');
        assert.ok(h.dom.window.document.querySelector('img[src="/custom-cover.png"]'));
        const img = h.dom.window.document.querySelector('.theme-portrait img')!;
        await act(async () => img.dispatchEvent(new h.dom.window.Event('error')));
        assert.equal(h.dom.window.document.querySelectorAll('.theme-portrait').length, 0);
        assert.ok(h.dom.window.document.querySelector('img[src="/examples/editorial-duo.png"]'));
    } finally { await h.cleanup(); }
});
test('idle carousel and start screen do not create a session before a theme is selected', async () => {
    const h = await harness(url => url === '/api/styles' ? [style, { ...style, id: 'watercolor', name: '水彩', exampleUrl: '/examples/watercolor-reference.webp' }, { ...style, id: 'pixel', name: '像素', exampleUrl: '/examples/pixel-reference.webp' }] : undefined);
    try {
        assert.equal(h.dom.window.document.querySelector('.theme-grid'), null);
        assert.equal(h.dom.window.document.querySelector('video'), null);
        const active = () => h.dom.window.document.querySelector('.attract-slide.is-active img')?.getAttribute('src');
        const first = active();
        await h.tick(6000);
        assert.notEqual(active(), first);
        const second = active();
        await h.click('Ⅱ');
        await h.tick(6000);
        assert.equal(active(), second);
        await h.click('›');
        assert.notEqual(active(), second);
        await h.click('›');
        assert.equal(active(), first);
        assert.equal(h.dom.window.document.querySelector('.carousel-count')?.textContent, '1 / 3');
        await h.click('开始拍照');
        assert.ok(h.dom.window.document.querySelector('.theme-grid'));
        assert.equal(h.calls.filter(c => c.url === '/api/sessions').length, 0);
        assert.equal(h.dom.window.document.querySelector('video'), null);
        await h.click('返回');
        assert.ok(h.dom.window.document.querySelector('.attract-screen'));
        await h.click('开始拍照'); await h.click('电影人像');
        assert.equal(h.calls.filter(c => c.url === '/api/sessions').length, 1);
        assert.equal(h.dom.window.document.querySelector('video'), null);
        await h.click('使用摄像头');
        assert.ok(h.dom.window.document.querySelector('video'));
    } finally { await h.cleanup(); }
});
test('changing theme ends the old session and refreshes admin changes without creating another session', async () => {
    let updated = false;
    const h = await harness(url => url === '/api/styles' && updated ? [{ ...style, name: '更新后的主题' }] : undefined);
    try {
        await h.click('开始拍照'); await h.click('电影人像');
        updated = true;
        await h.click('更换主题');
        assert.match(h.text(), /选择主题/);
        assert.match(h.text(), /更新后的主题/);
        assert.equal(h.dom.window.document.querySelector('video'), null);
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), null);
        assert.equal(h.calls.filter(c => c.url.endsWith('/end')).length, 1);
        assert.equal(h.calls.filter(c => c.url === '/api/sessions').length, 1);
        await h.click('更新后的主题');
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), 'session-2');
    } finally { await h.cleanup(); }
});
test('configuration connection failure can be retried without starting a session', async () => {
    let offline = true;
    const h = await harness(url => { if (url === '/api/styles' && offline) throw Error('服务暂时不可用'); });
    try {
        assert.match(h.text(), /服务暂时不可用/);
        offline = false;
        await h.click('重新连接');
        assert.doesNotMatch(h.text(), /服务暂时不可用/);
        assert.equal(h.calls.filter(c => c.url === '/api/sessions').length, 0);
        await h.click('开始拍照'); await h.click('电影人像');
        assert.match(h.text(), /准备一张照片/);
    } finally { await h.cleanup(); }
});
test('explicit upload → consent → generation poll → selected purchase → paid QR', async () => {
    const h = await harness();
    try {
        assert.match(h.text(), /演示模式 · 非 AI 生图/);
        await h.click('开始拍照'); await h.click('电影人像');
        await h.click('使用摄像头');
        assert.match(h.text(), /无法访问摄像头/);
        await h.upload();
        assert.equal(h.button('确认并生成').disabled, true);
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 0);
        await h.consent();
        await h.click('确认并生成');
        assert.match(h.text(), /非 AI|不调用 AI/);
        assert.equal(h.dom.window.document.querySelector('.generation-photo > img')?.getAttribute('src'), image);
        assert.ok(h.dom.window.document.querySelector('.generation-preview.is-rendering'));
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 1);
        await h.tick(1800);
        assert.match(h.text(), /照片已生成/);
        assert.equal(h.dom.window.document.querySelector('.generation-preview'), null);
        assert.ok(h.dom.window.document.querySelector('.original-download'));
        assert.match(h.text(), /免费保存原图/);
        assert.match(h.button('模拟购买').textContent || '', /1 张 · ¥9.90/);
        await h.click('模拟购买');
        await h.click('模拟支付成功');
        assert.match(h.text(), /扫码取图/);
        assert.ok(h.dom.window.document.querySelector('img[alt="手机取图二维码"]'));
        const purchase = h.calls.find(c => c.url.endsWith('/orders'));
        assert.deepEqual(purchase?.body.imageIds, ['one']);
        await h.click('完成，返回首页');
        assert.match(h.text(), /今天/);
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), null);
    }
    finally {
        await h.cleanup();
    }
});
test('failed and cancelled simulated payments return to results without pickup', async () => { const h = await harness(undefined, { saved: 'ready-session' }); try {
    await h.click('模拟购买');
    await h.click('模拟支付失败');
    assert.match(h.text(), /模拟支付失败。没有扣款/);
    assert.equal(h.dom.window.document.querySelector('img[alt="手机取图二维码"]'), null);
    await h.click('模拟购买');
    await h.click('返回选图');
    assert.match(h.text(), /照片已生成/);
    assert.equal(h.calls.some(c => c.url.endsWith('/generate')), false);
}
finally {
    await h.cleanup();
} });
test('restore ready session does not regenerate; delayed restore cannot replace a new session', async () => {
    const late = deferred<Session>();
    const h = await harness(url => url === '/api/sessions/old' ? late.promise : undefined, { saved: 'old' });
    try {
        await h.click('开始拍照'); await h.click('电影人像');
        await act(async () => late.resolve({ ...fresh('old'), status: 'ready', images: [{ id: 'old', previewUrl: '/old' }] }));
        await h.flush();
        assert.match(h.text(), /准备一张照片/);
        assert.doesNotMatch(h.text(), /照片已生成/);
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), 'session-1');
    }
    finally {
        await h.cleanup();
    }
});
test('late uploaded photo cannot appear in the next visitor session', async () => { const h = await harness(undefined, { deferReader: true }); try {
    await h.click('开始拍照'); await h.click('电影人像');
    await h.upload();
    assert.equal(h.readers.length, 1);
    await h.click('结束本次');
    await h.click('开始拍照'); await h.click('电影人像');
    await act(async () => h.readers[0]());
    await h.flush();
    assert.match(h.text(), /准备一张照片/);
    assert.equal(h.dom.window.document.querySelector('img[alt="刚刚拍摄或上传的照片"]'), null);
    assert.equal(h.dom.window.localStorage.getItem('snap-session'), 'session-2');
}
finally {
    await h.cleanup();
} });
test('late QR from previous paid session cannot replace the new visitor QR', async () => { const h = await harness(undefined, { deferQr: true }); const buy = async () => { await h.click('开始拍照'); await h.click('电影人像'); await h.upload(); await h.consent(); await h.click('确认并生成'); await h.tick(1800); await h.click('模拟购买'); await h.click('模拟支付成功'); }; try {
    await buy();
    assert.equal(h.qrs.length, 1);
    await h.click('完成，返回首页');
    await buy();
    assert.equal(h.qrs.length, 2);
    await act(async () => h.qrs[0].resolve('data:image/png;base64,b2xk'));
    await h.flush();
    assert.equal(h.dom.window.document.querySelector('img[alt="手机取图二维码"]'), null);
    await act(async () => h.qrs[1].resolve('data:image/png;base64,bmV3'));
    await h.flush();
    assert.equal(h.dom.window.document.querySelector('img[alt="手机取图二维码"]')?.getAttribute('src'), 'data:image/png;base64,bmV3');
}
finally {
    await h.cleanup();
} });
test('unconfigured Seedream cannot submit even after consent', async () => { const h = await harness(undefined, { unconfigured: true }); try {
    await h.click('开始拍照'); await h.click('电影人像');
    await h.upload();
    await h.consent();
    assert.match(h.text(), /Seedream 尚未配置/);
    assert.equal(h.button('确认并生成').disabled, true);
    await h.click('确认并生成');
    assert.equal(h.calls.some(c => c.url.endsWith('/generate')), false);
}
finally {
    await h.cleanup();
} });
test('mobile pickup renders only unlocked API images and expiry', async () => { const h = await harness(url => url === '/api/pickup/token' ? { expiresAt: Date.now() + 3600000, mode: 'demo', images: [{ id: 'only-paid', downloadUrl: '/api/pickup/token/images/only-paid' }] } : undefined, { pickup: true }); try {
    const links = h.dom.window.document.querySelectorAll('a[download]');
    assert.equal(links.length, 1);
    assert.equal(links[0].getAttribute('href'), '/api/pickup/token/images/only-paid');
    assert.match(h.text(), /前下载/);
    assert.equal(h.calls.length, 1);
}
finally {
    await h.cleanup();
} });

test('generation failure preserves original, stops animation, and ending clears the next visitor screen', async () => {
    const h = await harness(url => /^\/api\/sessions\/session-1$/.test(url) ? { ...fresh(), status: 'failed', error: '模拟生成失败' } : undefined);
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.upload(); await h.consent();
        await h.click('确认并生成');
        assert.ok(h.dom.window.document.querySelector('.generation-preview.is-rendering'));
        await h.tick(1800);
        assert.equal(h.dom.window.document.querySelector('.generation-photo > img')?.getAttribute('src'), image);
        assert.equal(h.dom.window.document.querySelector('.generation-preview.is-rendering'), null);
        assert.match(h.text(), /模拟生成失败/);
        await h.click('重新生成');
        assert.ok(h.dom.window.document.querySelector('.generation-preview.is-rendering'));
        await h.click('结束本次');
        assert.equal(h.dom.window.document.querySelector('.generation-preview'), null);
        await h.click('开始拍照'); await h.click('电影人像');
        assert.equal(h.dom.window.document.querySelector(`img[src="${image}"]`), null);
    } finally { await h.cleanup(); }
});

test('restored generation without in-memory photo has an honest placeholder, not a broken image', async () => {
    const h = await harness(url => url === '/api/sessions/restored' ? { ...fresh('restored'), status: 'generating' } : undefined, { saved: 'restored' });
    try {
        assert.match(h.text(), /已恢复生成任务/);
        assert.equal(h.dom.window.document.querySelector('.generation-photo > img'), null);
        assert.ok(h.dom.window.document.querySelector('.generation-preview.is-rendering'));
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 0);
    } finally { await h.cleanup(); }
});

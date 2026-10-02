// DOM regressions use synthetic files and mocked HTTP only; never access a camera or cloud API.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import QRCode from 'qrcode';
import { Booth, Pickup } from '../apps/web/src/Booth';
import type { Order, Session } from '../packages/shared/types';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }
const image = 'data:image/png;base64,c3ludGhldGlj';
const style = { id: 'cinema', name: '电影人像', description: '电影感测试', enabled: true, version: 1, exampleUrl: '/examples/cinema.svg', size: '2K', color: '#eed8a0' };
const fresh = (id = 'session-1'): Session => ({ id, styleId: 'cinema', styleName: '电影人像', status: 'created', mode: 'demo', createdAt: Date.now(), expiresAt: Date.now() + 600000, images: [] });
const paidSession = (s: Session): Session => ({ ...s, pickupUrl: `http://localhost:4377/pickup/${s.id}`, order: { id: `paid-${s.id}`, sessionId: s.id, imageIds: s.images.map(i => i.id), amount: 990, status: 'paid', product: 'photo-package', paymentMode: 'simulate', createdAt: s.createdAt } });
type Route = (url: string, body: any) => unknown | Promise<unknown>;
async function harness(route?: Route, options: {
    saved?: string;
    unconfigured?: boolean;
    deferReader?: boolean;
    deferQr?: boolean;
    pickup?: boolean;
    camera?: boolean;
    round?: { ids: string[]; activeAt: number; idleMs: number };
} = {}) {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: options.pickup ? 'http://localhost:4377/pickup/token' : 'http://localhost:4377/' });
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const put = (key: string, value: unknown) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, location: dom.window.location, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true }))
        put(key, value);
    if (options.saved)
        dom.window.localStorage.setItem('snap-session', options.saved);
    if (options.round) dom.window.localStorage.setItem('snap-round', JSON.stringify(options.round));
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
    const sessions = new Map<string, Session>();
    const orders = new Map<string, Order>();
    let seq = 0;
    let orderSeq = 0;
    put('fetch', async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, body });
        const custom = route ? await route(url, body) : undefined;
        let result = custom;
        if (result === undefined) {
            if (url === '/examples/film-reference.png') result = { sample: true };
            else if (url === '/api/printing') result = { supported: false, configured: false };
            else if (/\/print\//.test(url)) result = { job: null };
            else if (url === '/api/health')
                result = { mode: options.unconfigured ? 'seedream' : 'demo', configured: !options.unconfigured, model: '', imageCount: 2, pickupBaseUrl: 'http://localhost:4377', lanUrls: [] };
            else if (url === '/api/styles')
                result = [style];
            else if (url === '/api/sessions') {
                current = fresh(`session-${++seq}`);
                sessions.set(current.id, current);
                result = current;
            }
            else if (url.endsWith('/photo')) {
                current = { ...(sessions.get(url.split('/')[3]) || current), status: 'photographed', orientation: body.orientation, clothingMode: body.clothingMode ?? 'keep', originalUrl: '/original.jpg' };
                sessions.set(current.id, current);
                result = current;
            }
            else if (url.endsWith('/generate')) {
                current = { ...(sessions.get(url.split('/')[3]) || current), status: 'generating', clothingMode: body.clothingMode ?? current.clothingMode ?? 'keep' };
                sessions.set(current.id, current);
                result = current;
            }
            else if (url.endsWith('/frame')) {
                const id = url.split('/')[3], old = sessions.get(id);
                if (old) sessions.set(id, { ...old, ...body });
                result = body;
            }
            else if (url.endsWith('/orders')) {
                current = sessions.get(url.split('/')[3]) || current;
                const existing = current.order;
                const order: Order = existing && ['paid', 'pending'].includes(existing.status) ? existing : { id: `order-${++orderSeq}`, sessionId: current.id, imageIds: [], amount: 990, status: 'pending', product: 'photo-package', paymentMode: 'simulate', createdAt: Date.now() };
                orders.set(order.id, order); current = { ...current, clothingMode: body.clothingMode ?? current.clothingMode, order }; sessions.set(current.id, current); result = order;
            }
            else if (url.endsWith('/simulate')) {
                const previous = orders.get(url.split('/')[3])!;
                const order = { ...previous, status: body.outcome };
                orders.set(order.id, order);
                current = { ...sessions.get(order.sessionId)!, order, ...(body.outcome === 'paid' ? { pickupUrl: `http://localhost:4377/pickup/token-${orderSeq}` } : {}) };
                sessions.set(current.id, current);
                result = { order, session: current, pickupUrl: current.pickupUrl };
            }
            else if (url.endsWith('/end'))
                result = { ok: true };
            else if (url.startsWith('/api/sessions/')) {
                const id = url.split('/')[3], old = sessions.get(id);
                current = !old || old.status === 'generating' ? { ...(old || fresh(id)), status: 'ready', images: [{ id: 'one', previewUrl: '/preview/one' }, { id: 'two', previewUrl: '/preview/two' }] } : old;
                sessions.set(id, current); result = current;
            }
            else
                throw Error(`Unexpected route ${url}`);
        }
        if (result && typeof result === 'object' && 'styleId' in result && 'id' in result) {
            current = result as Session; sessions.set(current.id, current);
        }
        return { ok: true, status: 200, json: async () => result, ...(url === '/examples/film-reference.png' ? { blob: async () => new dom.window.Blob(['synthetic'], { type: 'image/png' }) } : {}) };
    });
    const root = createRoot(dom.window.document.getElementById('root')!);
    const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
    await act(async () => { root.render(options.pickup ? <Pickup /> : <Booth />); });
    await flush();
    const text = () => dom.window.document.body.textContent || '';
    const button = (name: string) => { const el = Array.from(dom.window.document.querySelectorAll('button')).find(b => b.textContent?.includes(name) || b.getAttribute('aria-label')?.includes(name)); assert.ok(el, `button missing: ${name}\n${text()}`); return el; };
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

test('refreshed themes replace cached cards and remain immediately selectable in the native scroll area', async () => {
    let requests = 0;
    const refreshed = deferred<unknown>();
    const h = await harness(url => url === '/api/styles' && ++requests > 1 ? refreshed.promise : undefined);
    try {
        await h.click('开始拍照');
        assert.ok(h.dom.window.document.querySelector('.theme-scroll[role="region"]'));
        assert.equal(h.calls.some(c => c.url === '/api/sessions'), false);
        await act(async () => refreshed.resolve([{ ...style, name: '更新电影人像' }])); await h.flush();
        assert.equal(h.button('更新电影人像').disabled, false);
        await h.click('更新电影人像');
        assert.equal(h.calls.find(c => c.url === '/api/sessions')?.body.styleId, style.id);
        assert.match(h.text(), /看向镜头/);
    } finally { refreshed.resolve([style]); await h.cleanup(); }
});

test('real mode requests camera only after theme selection and waits for a playable frame; disconnect cancels countdown', async () => {
    const h = await harness(url => url === '/api/health' ? { mode: 'seedream', configured: true, imageCount: 1 } : undefined, { camera: true });
    try {
        assert.equal(h.cameraCalls(), 0);
        await h.click('开始拍照');
        assert.equal(h.cameraCalls(), 0);
        await h.click('电影人像');
        assert.equal(h.cameraCalls(), 1);
        assert.doesNotMatch(h.text(), /使用内置照片/);
        assert.doesNotMatch(h.text(), /使用演示照片/);
        assert.doesNotMatch(h.dom.window.document.querySelector('.camera-placeholder')?.textContent || '', /上传照片或使用演示照片/);
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

test('uncategorized custom themes stay discoverable without being mixed into creative art', async () => {
    const h = await harness(url => url === '/api/styles' ? Array.from({ length: 7 }, (_, i) => ({ ...style, id: `style-${i}`, name: `主题${i}` })) : undefined);
    try {
        await h.click('开始拍照');
        await h.click('其他模板');
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
        const img = h.dom.window.document.querySelector('.theme-portrait img')!;
        await act(async () => img.dispatchEvent(new h.dom.window.Event('error')));
        assert.equal(h.dom.window.document.querySelectorAll('.theme-portrait').length, 0);
        assert.ok(h.dom.window.document.querySelector('img[src="/examples/editorial-duo.png"]'));
        await h.click('其他模板');
        assert.ok(h.dom.window.document.querySelector('img[src="/custom-cover.png"]'));
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
        assert.doesNotMatch(h.text(), /使用内置照片|准备一张照片/);
        assert.ok(h.dom.window.document.querySelector('video'));
    } finally { await h.cleanup(); }
});
test('changing theme preserves this round and refreshes admin changes without creating another session', async () => {
    let updated = false;
    const h = await harness(url => url === '/api/styles' && updated ? [{ ...style, name: '更新后的主题' }] : undefined);
    try {
        await h.click('开始拍照'); await h.click('电影人像');
        updated = true;
        await h.click('更换主题');
        assert.ok(h.dom.window.document.querySelector('.theme-screen'));
        assert.match(h.text(), /更新后的主题/);
        assert.equal(h.dom.window.document.querySelector('video'), null);
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), 'session-1');
        assert.equal(h.calls.filter(c => c.url.endsWith('/end')).length, 0);
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
        assert.match(h.text(), /看向镜头/);
    } finally { await h.cleanup(); }
});
test('consented upload → demo package payment → generation → included delivery', async () => {
    const h = await harness();
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.upload();
        assert.equal(h.button('查看套餐').disabled, true);
        await h.click('横版'); await h.consent(); await h.click('查看套餐');
        assert.match(h.text(), /确认套餐|模拟付款，不会实际扣款/);
        assert.match(h.text(), /AI 电子图 \+ 纸质打印/);
        assert.match(h.text(), /含拍摄原片|示例价/);
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 0);
        assert.deepEqual(h.calls.find(c => c.url.endsWith('/orders'))?.body, { clothingMode: 'keep' });
        assert.equal(h.calls.find(c => c.url.endsWith('/photo'))?.body.orientation, 'landscape');
        await h.click('模拟付款并生成');
        assert.match(h.text(), /效果制作中/);
        assert.equal(h.dom.window.document.querySelector('.generation-photo img.frame-photo')?.getAttribute('src'), image);
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 1);
        assert.ok(h.calls.findIndex(c => c.url.endsWith('/simulate')) < h.calls.findIndex(c => c.url.endsWith('/generate')));
        assert.equal(h.dom.window.document.querySelector('.delivery'), null);
        await h.tick(1800);
        assert.match(h.text(), /照片已生成|已付款/);
        assert.match(h.text(), /保存拍摄原片/);
        assert.doesNotMatch(h.text(), /购买这张照片/);
        await h.click('手机取图');
        assert.match(h.text(), /扫码取图/);
        assert.ok(h.dom.window.document.querySelector('img[alt="手机取图二维码"]'));
        await h.click('完成，返回首页');
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), null);
        assert.equal(h.calls.filter(c => c.url.endsWith('/orders')).length, 1);
    } finally { await h.cleanup(); }
});
test('poster option appears under memories and confirms fixed outfit and 2:3 without conflicting controls', async () => {
    const poster = { ...style, id: 'coming-of-age', name: '你好，我的18岁', generationPreset: 'coming-of-age', exampleUrl: '/examples/coming-of-age.svg' };
    let s: Session = { ...fresh(), styleId: poster.id, styleName: poster.name, purpose: 'memory', orientation: 'poster', clothingMode: 'theme', frame: 'none' };
    const h = await harness((url, body) => {
        if (url === '/api/styles') return [poster];
        if (url === '/api/sessions') return s;
        if (url.endsWith('/photo')) { s = { ...s, status: 'photographed', originalUrl: '/original.jpg' }; return s; }
        if (url.endsWith('/generate')) { s = { ...s, status: 'generating' }; return s; }
        if (url === `/api/sessions/${s.id}`) return s;
    });
    try {
        await h.click('开始拍照'); await h.click('生日纪念'); await h.click(poster.name);
        await h.upload();
        assert.match(h.dom.window.document.querySelector('.poster-settings')?.textContent || '', /成人礼海报 · 2:3/);
        assert.equal(h.dom.window.document.querySelector('.clothing-picker'), null);
        assert.equal(h.dom.window.document.querySelector('.orientation-picker'), null);
        assert.equal(h.button('查看套餐').disabled, true);
        await h.consent(); await h.click('查看套餐'); await h.click('模拟付款并生成');
        assert.equal(h.calls.find(c => c.url.endsWith('/photo'))?.body.orientation, 'poster');
        assert.equal(h.calls.find(c => c.url.endsWith('/photo'))?.body.clothingMode, 'theme');
        const frame = h.dom.window.document.querySelector<HTMLElement>('.photo-frame')!;
        assert.equal(frame.dataset.orientation, 'poster'); assert.equal(frame.style.aspectRatio, '800/1200');
    } finally { await h.cleanup(); }
});

test('directed portrait confirmation keeps its fixed ratio and offers clothing choice without adult-poster copy', async () => {
    const scene = { ...style, id: 'doctor-folder', name: '医生肖像 · 工作时刻', generationPreset: 'directed-portrait', sceneOrientation: 'portrait4x5', subjectCount: 1, sourceCode: '02C' };
    let s: Session = { ...fresh(), styleId: scene.id, styleName: scene.name, orientation: 'portrait4x5', clothingMode: 'theme' };
    const h = await harness((url,body) => {
        if(url==='/api/styles')return [scene];if(url==='/api/sessions')return s;
        if(url.endsWith('/photo')){s={...s,status:'photographed',clothingMode:body.clothingMode,originalUrl:'/original.jpg'};return s;}
        if(url.endsWith('/generate')){s={...s,status:'generating'};return s;}
        if(url===`/api/sessions/${s.id}`)return s;
    });
    try {
        await h.click('开始拍照');await h.click(scene.name);await h.upload();
        assert.match(h.dom.window.document.querySelector('.poster-settings')?.textContent || '', /竖版 4:5/);assert.doesNotMatch(h.text(),/成人礼海报|深蓝换装/);
        assert.equal(h.dom.window.document.querySelectorAll('.orientation-picker:not(.clothing-picker)').length,0);
        assert.ok(h.dom.window.document.querySelector('.clothing-picker'));
        await h.click('保留原服装');await h.consent();await h.click('查看套餐'); await h.click('模拟付款并生成');
        assert.equal(h.calls.find(c=>c.url.endsWith('/photo'))?.body.orientation,'portrait4x5');
        assert.equal(h.calls.find(c=>c.url.endsWith('/photo'))?.body.clothingMode,'keep');
        assert.equal(h.dom.window.document.querySelector<HTMLElement>('.photo-frame')?.style.aspectRatio,'960/1200');
    } finally {await h.cleanup();}
});

test('failed and cancelled demo payments return to photo confirmation without generating', async () => {
    const h = await harness();
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.upload(); await h.consent();
        await h.click('查看套餐'); await h.click('模拟付款失败');
        assert.match(h.text(), /确认照片|模拟付款未完成，未提交生成/);
        assert.equal(h.dom.window.document.querySelector('.payment, .delivery'), null);
        await h.click('查看套餐'); await h.click('取消付款');
        assert.equal(h.dom.window.document.querySelector('[data-step]')?.getAttribute('data-step'), 'confirm');
        assert.equal(h.calls.some(c => c.url.endsWith('/generate')), false);
        assert.deepEqual(h.calls.filter(c => c.url.endsWith('/simulate')).map(c => c.body.outcome), ['failed', 'cancelled']);
    } finally { await h.cleanup(); }
});
test('restore ready session does not regenerate; delayed restore cannot replace a new session', async () => {
    const late = deferred<Session>();
    const h = await harness(url => url === '/api/sessions/old' ? late.promise : undefined, { saved: 'old' });
    try {
        await h.click('开始拍照'); await h.click('电影人像');
        await act(async () => late.resolve({ ...fresh('old'), status: 'ready', images: [{ id: 'old', previewUrl: '/old' }] }));
        await h.flush();
        assert.match(h.text(), /看向镜头/);
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
    assert.match(h.text(), /看向镜头/);
    assert.equal(h.dom.window.document.querySelector('img[alt="刚刚拍摄或上传的照片"]'), null);
    assert.equal(h.dom.window.localStorage.getItem('snap-session'), 'session-2');
}
finally {
    await h.cleanup();
} });
test('late QR from previous paid session cannot replace the new visitor QR', async () => { const h = await harness(undefined, { deferQr: true }); const buy = async () => { await h.click('开始拍照'); await h.click('电影人像'); await h.upload(); await h.consent(); await h.click('查看套餐'); await h.click('模拟付款并生成'); await h.tick(1800); await h.click('手机取图'); }; try {
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
    assert.equal(h.button('查看套餐').disabled, true);
    await h.click('查看套餐');
    assert.equal(h.calls.some(c => c.url.endsWith('/generate') || c.url.endsWith('/orders')), false);
}
finally {
    await h.cleanup();
} });
test('mobile pickup renders only unlocked API images and expiry', async () => { const h = await harness(url => url === '/api/pickup/token' ? { expiresAt: Date.now() + 3600000, mode: 'demo', images: [{ id: 'only-paid', downloadUrl: '/api/pickup/token/images/only-paid' }] } : undefined, { pickup: true }); try {
    const links = h.dom.window.document.querySelectorAll('a[download]');
    assert.equal(links.length, 1);
    assert.equal(links[0].getAttribute('href'), '/api/pickup/token/images/only-paid');
    assert.match(h.text(), /自动删除/);
    assert.equal(h.calls.length, 1);
}
finally {
    await h.cleanup();
} });

test('generation failure preserves original, stops animation, and ending clears the next visitor screen', async () => {
    const h = await harness(url => /^\/api\/sessions\/session-1$/.test(url) ? { ...fresh(), status: 'failed', error: '模拟生成失败' } : undefined);
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.upload(); await h.consent();
        await h.click('查看套餐'); await h.click('模拟付款并生成');
        assert.ok(h.dom.window.document.querySelector('.generation-preview.is-rendering'));
        await h.tick(1800);
        assert.equal(h.dom.window.document.querySelector('.generation-photo img.frame-photo')?.getAttribute('src'), image);
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
        assert.equal(h.dom.window.document.querySelector('.generation-photo img.frame-photo'), null);
        assert.ok(h.dom.window.document.querySelector('.generation-preview.is-rendering'));
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 0);
    } finally { await h.cleanup(); }
});

test('frame selection persists from waiting to results without generation and resets for next visitor', async () => {
    const firstSave = deferred<unknown>();
    let ready = false;
    const h = await harness((url, body) => {
        if (url.endsWith('/frame')) return body.frame === 'instant' ? firstSave.promise : { frame: body.frame };
        if (url === '/api/sessions/restored') return { ...fresh('restored'), frame: 'sage', status: ready ? 'ready' : 'generating', originalUrl: '/original.jpg', images: ready ? [{ id: 'image-1', previewUrl: '/preview.jpg' }] : [] };
    }, { saved: 'restored' });
    try {
        assert.equal(h.button('鼠尾草').getAttribute('aria-pressed'), 'true');
        await h.click('拍立得');
        await h.click('玫瑰纸');
        assert.equal(h.dom.window.document.querySelector('.photo-frame')?.getAttribute('data-frame'), 'rose');
        assert.equal(h.calls.filter(c => c.url.endsWith('/frame')).length, 1);
        ready = true;
        await h.tick(1800);
        assert.ok(h.text().includes('照片已生成'));
        assert.equal(h.button('玫瑰纸').getAttribute('aria-pressed'), 'true');
        assert.equal(h.button('正在准备').disabled, true);
        await act(async () => firstSave.resolve({ frame: 'instant' }));
        await h.flush();
        assert.deepEqual(h.calls.filter(c => c.url.endsWith('/frame')).map(c => c.body.frame), ['instant', 'rose']);
        await h.click('黑胶片');
        assert.equal(h.dom.window.document.querySelector('.photo-frame')?.getAttribute('data-frame'), 'ink');
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 0);
        await h.click('结束本次');
        await h.click('开始拍照');
        await h.click('电影人像');
        await h.upload(); await h.consent(); await h.click('查看套餐'); await h.click('模拟付款并生成');
        assert.equal(h.button('无边框').getAttribute('aria-pressed'), 'true');
    } finally { firstSave.resolve({ frame: 'instant' }); await h.cleanup(); }
});

test('failed frame save keeps preview, blocks checkout and can be retried', async () => {
    let attempts = 0;
    const h = await harness((url, body) => {
        if (url.endsWith('/frame')) { if (++attempts === 1) throw Error('offline'); return { frame: body.frame }; }
        if (url === '/api/sessions/restored') return paidSession({ ...fresh('restored'), status: 'ready', images: [{ id: 'image-1', previewUrl: '/preview.jpg' }] });
    }, { saved: 'restored' });
    try {
        await h.click('留白');
        assert.ok(h.text().includes('边框尚未保存'));
        assert.equal(h.button('正在准备').disabled, true);
        await h.click('重试保存边框');
        assert.equal(h.button('手机取图').disabled, false);
        assert.equal(attempts, 2);
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 0);
    } finally { await h.cleanup(); }
});

test('caption and typography restore, update, remain after frame selection and clear for next visitor',async()=>{
 const caption={text:'一起去看海',font:'serif',size:'medium',align:'center',color:'auto'};
 const h=await harness((url,body)=>{
  if(url.endsWith('/frame'))return body;
  if(url==='/api/sessions/restored')return {...fresh('restored'),frame:'postcard',caption,status:'ready',images:[{id:'image-1',previewUrl:'/preview.jpg'}]};
 },{saved:'restored'});
 try{
  const textarea=h.dom.window.document.querySelector('textarea')!;
  assert.equal(textarea.value,caption.text);
  const select=h.dom.window.document.querySelector('select[aria-label="文字字体"]') as HTMLSelectElement;
  await act(async()=>{select.value='hand';select.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));});await h.flush();
  await act(async()=>{(h.dom.window.document.querySelector('button[aria-label="右对齐"]') as HTMLButtonElement).click();});await h.flush();
  await h.click('蓝调时刻');
  const saved=h.calls.filter(c=>c.url.endsWith('/frame')).at(-1)!.body;
  assert.equal(saved.caption.text,'一起去看海');assert.equal(saved.caption.font,'hand');assert.equal(saved.caption.align,'right');assert.equal(saved.frame,'midnight');
  const art=h.dom.window.document.querySelector('.frame-art')!.getAttribute('src')!;
  assert.ok(decodeURIComponent(art).includes('一起去看海'));
  await h.click('结束本次');await h.click('开始拍照');await h.click('电影人像');await h.upload();await h.consent();await h.click('查看套餐'); await h.click('模拟付款并生成');
  assert.equal(h.dom.window.document.querySelector('textarea')!.value,'');
 }finally{await h.cleanup();}
});

test('content categories keep professional, wedding and daily photos separate without starting a session', async () => {
 const catalog=['business','doctor-folder','editorial','cinema','film','festival','cartoon','wedding-groom','together-01'].map(id=>({...style,id,name:id}));
 const h=await harness(url=>url==='/api/styles'?catalog:undefined);
 try {
  await h.click('开始拍照');
  const cards=()=>Array.from(h.dom.window.document.querySelectorAll('.theme-card')).map(b=>b.getAttribute('aria-label'));
  assert.deepEqual(cards(),['editorial','cinema']);
  await h.click('职业形象');assert.deepEqual(cards(),['business','doctor-folder']);
  assert.equal(h.button('职业形象').querySelector('.category-count')?.textContent,'2');
  await h.click('生日纪念');assert.deepEqual(cards(),['festival']);
  await h.click('婚礼写真');assert.deepEqual(cards(),['wedding-groom']);
  await h.click('旅行日常');assert.deepEqual(cards(),['film']);
  await h.click('创意艺术');assert.deepEqual(cards(),['cartoon']);
  await h.click('亲友合照');assert.deepEqual(cards(),['together-01']);
  assert.equal(h.dom.window.document.querySelector('.purpose-tabs button[aria-label="其他模板"]'),null);
  assert.equal(h.calls.some(c=>c.url==='/api/sessions'),false);
  assert.equal(h.cameraCalls(),0);
  await h.click('together-01');
  assert.equal(h.calls.find(c=>c.url==='/api/sessions')?.body.purpose,'together');
 } finally {await h.cleanup();}
});

test('paired self covers rotate in one card, pause, and fall back to primary on failure', async () => {
 const dual={...style,id:'self-01',name:'奶油柔光',exampleUrl:'/examples/self-01-a.webp',exampleUrls:['/examples/self-01-a.webp','/examples/self-01-b.webp']};
 const h=await harness(url=>url==='/api/styles'?[dual]:undefined);
 try {
  await h.click('开始拍照');
  const doc=h.dom.window.document;
  const active=()=>doc.querySelector('.theme-variant.is-current img')?.getAttribute('src');
  assert.equal(doc.querySelectorAll('.theme-card').length,1);
  assert.equal(doc.querySelectorAll('.theme-variant').length,2);
  assert.equal(doc.querySelectorAll('.theme-dots i').length,2);
  assert.equal(active(),dual.exampleUrls[0]);
  await h.tick(6500);assert.equal(active(),dual.exampleUrls[1]);
  await h.click('暂停轮播');await h.tick(6500);assert.equal(active(),dual.exampleUrls[1]);
  assert.equal(h.calls.some(c=>c.url==='/api/sessions'),false);
  await act(async()=>doc.querySelector('.theme-variant.is-current img')!.dispatchEvent(new h.dom.window.Event('error')));
  assert.equal(doc.querySelectorAll('.theme-variant').length,0);
  assert.ok(doc.querySelector('img[src="/examples/self-01-a.webp"]'));
 }finally{await h.cleanup();}
});

test('custom cover overrides bundled pair without reviving old images', async () => {
 const h=await harness(url=>url==='/api/styles'?[{...style,id:'self-01',exampleUrl:'/custom.webp',exampleUrls:['/examples/self-01-a.webp','/examples/self-01-b.webp']}]:undefined);
 try {await h.click('开始拍照');assert.equal(h.dom.window.document.querySelectorAll('.theme-variant').length,0);assert.ok(h.dom.window.document.querySelector('img[src="/custom.webp"]'));}
 finally{await h.cleanup();}
});

test('back preserves the captured photo and lets generation finish without interrupting the page or submitting twice', async () => {
    const h = await harness();
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.upload();
        await h.click('返回上一步');
        assert.match(h.text(), /看向镜头/);
        await h.click('使用刚才的照片');
        assert.equal(h.dom.window.document.querySelector('img[alt="刚刚拍摄或上传的照片"]')?.getAttribute('src'), image);
        await h.click('横版'); await h.click('本轮照片库'); await h.click('电影人像 · 待确认');
        assert.equal(h.button('横版').getAttribute('aria-pressed'), 'true');
        await h.consent(); await h.click('查看套餐'); await h.click('模拟付款并生成');
        await h.click('返回上一步');
        assert.match(h.text(), /正在生成，返回不会中断/);
        assert.equal(h.dom.window.document.querySelector('input[type=checkbox]'), null);
        await h.tick(1800);
        assert.equal(h.dom.window.document.querySelector('[data-step]')?.getAttribute('data-step'), 'confirm');
        await h.click('查看生成照片');
        await h.click('手机取图'); await h.click('返回照片');
        assert.match(h.text(), /照片已生成/);
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 1);
        assert.equal(h.calls.filter(c => c.url.endsWith('/simulate')).length, 1);
    } finally { await h.cleanup(); }
});

test('this round library restores earlier purchases; ending hides every session from the next visitor', async () => {
    const h = await harness();
    const make = async () => { await h.click('电影人像'); await h.upload(); await h.consent(); await h.click('查看套餐'); await h.click('模拟付款并生成'); await h.tick(1800); };
    try {
        await h.click('开始拍照'); await make(); await h.click('手机取图');
        await h.click('返回照片');
        await h.click('再拍一张'); await make();
        await h.click('返回照片库');
        assert.equal(h.dom.window.document.querySelectorAll('.library-card').length, 2);
        await act(async () => (h.dom.window.document.querySelectorAll('.library-card')[1] as HTMLButtonElement).click()); await h.flush();
        assert.match(h.text(), /照片已生成/);
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), 'session-1');
        await h.click('手机取图');
        await h.click('返回照片'); await h.click('手机取图');
        assert.match(h.text(), /扫码取图/);
        assert.equal(h.calls.filter(c => c.url.endsWith('/simulate')).length, 2);
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 2);
        await h.click('结束本次');
        assert.equal(h.dom.window.localStorage.getItem('snap-round'), null);
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), null);
        assert.deepEqual(h.calls.filter(c => c.url.endsWith('/end')).map(c => c.url).sort(), ['/api/sessions/session-1/end', '/api/sessions/session-2/end']);
        await h.click('开始拍照'); await h.click('本轮照片库');
        assert.equal(h.dom.window.document.querySelectorAll('.library-card').length, 0);
        assert.match(h.text(), /还没有可查看的照片/);
    } finally { await h.cleanup(); }
});

test('a refresh restores only recorded round IDs and never requests a global gallery', async () => {
    const h = await harness(undefined, { saved: 'first', round: { ids: ['first', 'second'], activeAt: Date.now(), idleMs: 120000 } });
    try {
        await h.click('本轮照片库');
        assert.equal(h.dom.window.document.querySelectorAll('.library-card').length, 2);
        assert.equal(h.calls.filter(c => c.url === '/api/sessions/first').length, 1);
        assert.equal(h.calls.filter(c => c.url === '/api/sessions/second').length, 1);
        assert.equal(h.calls.some(c => c.url === '/api/admin' || c.url.endsWith('/generate')), false);
    } finally { await h.cleanup(); }
});

test('a stale round is hidden on reload instead of restoring the previous visitor photos', async () => {
    const h = await harness(undefined, { saved: 'first', round: { ids: ['first', 'second'], activeAt: Date.now() - 120001, idleMs: 120000 } });
    try {
        assert.ok(h.dom.window.document.querySelector('.attract-screen'));
        assert.equal(h.dom.window.localStorage.getItem('snap-round'), null);
        assert.equal(h.calls.some(c => c.url === '/api/sessions/first'), false);
        assert.equal(h.calls.filter(c => c.url.endsWith('/end')).length, 2);
    } finally { await h.cleanup(); }
});

test('kiosk expiry clears photo pixels, draft, QR and round IDs without waiting for an interaction', async () => {
    const originalNow = Date.now; let time = originalNow(); Date.now = () => time;
    const h = await harness();
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.upload(); await h.consent(); await h.click('查看套餐'); await h.click('模拟付款并生成'); await h.tick(1800);
        await h.click('手机取图');
        assert.ok(h.dom.window.document.querySelector('img[alt="手机取图二维码"]'));
        time += 600001;
        // Visibility/pageshow also enforce expiry when a tab wakes from sleep.
        await act(async () => h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'))); await h.flush();
        assert.match(h.text(), /照片已到期并自动删除/);
        assert.equal(h.dom.window.document.querySelector('.library-card, .qr-ticket, .capture-layout'), null);
        assert.equal(h.dom.window.document.querySelector(`img[src="${image}"]`), null);
        assert.equal(h.dom.window.localStorage.getItem('snap-round'), null);
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), null);
    } finally { await h.cleanup(); Date.now = originalNow; }
});

test('phone detail returns to its own album and removes images and download links at expiry', async () => {
    const originalNow = Date.now; let time = originalNow(); Date.now = () => time;
    const h = await harness(url => url === '/api/pickup/token' ? { expiresAt: time + 600000, mode: 'demo', images: [{ id: 'one', downloadUrl: '/api/pickup/token/images/one' }] } : undefined, { pickup: true });
    try {
        assert.match(h.text(), /10:00/);
        assert.equal(h.dom.window.document.querySelector('.brand')?.getAttribute('href'), '/pickup/token');
        await h.click('查看AI 成片'); await h.click('返回相册');
        assert.match(h.text(), /你的照片/);
        time += 600001; await h.tick(1000);
        assert.match(h.text(), /照片已到期并自动删除/);
        assert.equal(h.dom.window.document.querySelector('img, a[download]'), null);
    } finally { await h.cleanup(); Date.now = originalNow; }
});

test('clothing choice survives back and library navigation, is submitted once, and defaults to keep for the next photo', async () => {
    const h = await harness();
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.upload();
        assert.equal(h.button('保留原服装').getAttribute('aria-pressed'), 'true');
        await h.click('按主题换装'); await h.click('返回上一步'); await h.click('使用刚才的照片');
        assert.equal(h.button('按主题换装').getAttribute('aria-pressed'), 'true');
        await h.click('本轮照片库'); await h.click('电影人像 · 待确认');
        assert.equal(h.button('按主题换装').getAttribute('aria-pressed'), 'true');
        await h.consent(); await h.click('查看套餐'); await h.click('模拟付款并生成');
        assert.equal(h.calls.find(c => c.url.endsWith('/photo'))?.body.clothingMode, 'theme');
        assert.equal(h.calls.find(c => c.url.endsWith('/generate'))?.body.clothingMode, 'theme');
        await h.click('返回上一步'); assert.equal(h.dom.window.document.querySelector('.clothing-picker'), null);
        await h.tick(1800); await h.click('查看生成照片');
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 1);
        await h.click('再拍一张'); await h.click('电影人像'); await h.upload();
        assert.equal(h.button('保留原服装').getAttribute('aria-pressed'), 'true');
    } finally { await h.cleanup(); }
});

test('restored uploaded photo retains its clothing choice and can change it before generation without uploading again', async () => {
    let saved: Session = { ...fresh('restored'), status: 'photographed', clothingMode: 'theme', originalUrl: '/original.jpg' };
    const h = await harness((url, body) => {
        if (url === '/api/sessions/restored') return saved;
        if (url === '/api/sessions/restored/generate') { saved = { ...saved, status: 'generating', clothingMode: body.clothingMode }; return saved; }
    }, { saved: 'restored' });
    try {
        assert.equal(h.button('按主题换装').getAttribute('aria-pressed'), 'true');
        await h.click('保留原服装'); await h.consent(); await h.click('查看套餐'); await h.click('模拟付款并生成');
        assert.equal(h.calls.filter(c => c.url.endsWith('/photo')).length, 0);
        assert.equal(h.calls.find(c => c.url.endsWith('/generate'))?.body.clothingMode, 'keep');
    } finally { await h.cleanup(); }
});

test('a restored paid package resumes generation without another payment or photo replacement', async () => {
    let saved = paidSession({ ...fresh('paid-restored'), status: 'photographed', originalUrl: '/original.jpg', clothingMode: 'theme' });
    const h = await harness((url, body) => {
        if (url === '/api/sessions/paid-restored') return saved;
        if (url.endsWith('/generate')) { saved = { ...saved, status: 'generating' }; return saved; }
    }, { saved: saved.id });
    try {
        assert.match(h.text(), /已付款，可继续生成/);
        assert.equal(h.dom.window.document.querySelector('.payment, .clothing-picker, .delivery'), null);
        assert.equal(h.calls.some(c => c.url.endsWith('/generate')), false);
        await h.click('继续生成（已付款）');
        assert.match(h.text(), /效果制作中/);
        assert.equal(h.calls.filter(c => c.url.endsWith('/generate')).length, 1);
        assert.equal(h.calls.find(c => c.url.endsWith('/generate'))?.body.clothingMode, 'theme');
        assert.equal(h.calls.some(c => /\/(orders|simulate|photo)$/.test(c.url)), false);
        await h.click('返回上一步');
        assert.equal(h.dom.window.document.querySelector('.clothing-picker'), null);
        assert.doesNotMatch(h.text(), /重新拍一张/);
    } finally { await h.cleanup(); }
});

test('a prepaid pickup URL does not bypass generation or reopen payment when the round restores', async () => {
    let ready = false;
    const restored = paidSession({ ...fresh('paid-generating'), status: 'generating', originalUrl: '/original.jpg' });
    const h = await harness(url => url === '/api/sessions/paid-generating' ? { ...restored, status: ready ? 'ready' : 'generating', images: ready ? [{ id: 'one', previewUrl: '/preview.jpg' }] : [] } : undefined, { saved: restored.id });
    try {
        assert.ok(h.dom.window.document.querySelector('.generation-preview.is-rendering'));
        assert.equal(h.dom.window.document.querySelector('.delivery, .payment'), null);
        await h.click('本轮照片库');
        assert.match(h.text(), /正在生成/);
        await h.click('电影人像 · 正在生成');
        assert.ok(h.dom.window.document.querySelector('.generation-preview.is-rendering'));
        ready = true; await h.tick(1800);
        assert.match(h.text(), /照片已生成|已付款/);
        assert.equal(h.calls.some(c => /\/(orders|simulate|generate)$/.test(c.url)), false);
        await h.click('手机取图');
        assert.ok(h.dom.window.document.querySelector('.delivery'));
    } finally { await h.cleanup(); }
});

test('unknown paid generation keeps retry blocked while allowing its original-photo delivery', async () => {
    const restored = paidSession({ ...fresh('paid-unknown'), status: 'unknown', originalUrl: '/original.jpg', error: '结果未知' });
    const h = await harness(url => url === '/api/sessions/paid-unknown' ? restored : undefined, { saved: restored.id });
    try {
        assert.match(h.text(), /不提供自动重试/);
        assert.equal(Array.from(h.dom.window.document.querySelectorAll('button')).some(button => /重新生成|继续生成/.test(button.textContent || '')), false);
        await h.click('先保存拍摄原片');
        assert.match(h.text(), /扫码取图/);
        await h.click('返回生成状态');
        assert.match(h.text(), /不提供自动重试/);
        assert.equal(h.calls.some(c => /\/(orders|simulate|generate)$/.test(c.url)), false);
    } finally { await h.cleanup(); }
});

test('a late simulated payment cannot start generation for a visitor who has already ended', async () => {
    const payment = deferred<unknown>();
    const h = await harness(url => url.endsWith('/simulate') ? payment.promise : undefined);
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.upload(); await h.consent();
        await h.click('查看套餐'); await h.click('模拟付款并生成');
        await h.click('结束本次'); await h.click('开始拍照'); await h.click('电影人像');
        const previous = paidSession({ ...fresh('session-1'), status: 'photographed', originalUrl: '/old.jpg' });
        await act(async () => payment.resolve({ order: previous.order, session: previous, pickupUrl: previous.pickupUrl })); await h.flush();
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), 'session-2');
        assert.match(h.text(), /看向镜头/);
        assert.equal(h.calls.some(c => c.url.endsWith('/generate')), false);
    } finally { payment.resolve({}); await h.cleanup(); }
});

test('demo photo enters confirmation without a file picker, payment or generation', async () => {
    const h = await harness();
    try {
        await h.click('开始拍照'); await h.click('电影人像');
        assert.match(h.text(), /演示样图，仅用于测试/);
        assert.match(h.dom.window.document.querySelector('.camera-placeholder')?.textContent || '', /上传照片或使用演示照片/);
        await h.click('使用演示照片');
        assert.equal(h.dom.window.document.querySelector('[data-step]')?.getAttribute('data-step'), 'confirm');
        assert.equal(h.dom.window.document.querySelector('img[alt="刚刚拍摄或上传的照片"]')?.getAttribute('src'), image);
        assert.equal(h.button('查看套餐').disabled, true);
        assert.equal(h.calls.filter(c => c.url === '/examples/film-reference.png').length, 1);
        assert.equal(h.calls.some(c => /\/(photo|orders|simulate|generate)$/.test(c.url)), false);
    } finally { await h.cleanup(); }
});

test('a late demo sample read cannot place a previous visitor photo into the next round', async () => {
    const h = await harness(undefined, { deferReader: true });
    try {
        await h.click('开始拍照'); await h.click('电影人像'); await h.click('使用演示照片');
        assert.equal(h.readers.length, 1);
        await h.click('结束本次'); await h.click('开始拍照'); await h.click('电影人像');
        await act(async () => h.readers[0]()); await h.flush();
        assert.equal(h.dom.window.document.querySelector('[data-step]')?.getAttribute('data-step'), 'camera');
        assert.equal(h.dom.window.document.querySelector(`img[src="${image}"]`), null);
        assert.equal(h.dom.window.localStorage.getItem('snap-session'), 'session-2');
        assert.equal(h.calls.some(c => /\/(orders|simulate|generate)$/.test(c.url)), false);
    } finally { await h.cleanup(); }
});

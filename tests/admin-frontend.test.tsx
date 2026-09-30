import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { AdminAccess } from '../apps/web/src/AdminAccess';
import { AdminCameraSettings } from '../apps/web/src/AdminCameraSettings';

async function harness(component: React.ReactNode, setup?: (dom: JSDOM) => void) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:4377/admin' });
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const put = (key: string, value: unknown) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, location: dom.window.location, localStorage: dom.window.localStorage, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })) put(key, value);
    let authenticated = true, configured = true;
    const calls: string[] = [], timers = new Map<number, () => void>(); let sequence = 0;
    put('setInterval', (fn: () => void) => { timers.set(++sequence, fn); return sequence; });
    put('clearInterval', (id: number) => timers.delete(id));
    put('fetch', async (url: string) => {
        calls.push(url);
        if (url.endsWith('/logout')) authenticated = false;
        return { ok: true, status: 200, json: async () => ({ authenticated, configured, idleTimeoutMs: 600_000 }) };
    });
    setup?.(dom);
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root')!);
    const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => root.render(component)); await flush();
    return { dom, calls, timers, root, flush, close: async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; } } };
}

test('administrator lock removes sensitive controls immediately and logs out on inactivity', async () => {
    const originalNow = Date.now; let time = originalNow(); Date.now = () => time;
    const h = await harness(<AdminAccess>{lock => <div><span>private-orders</span><button onClick={() => void lock()}>lock-now</button></div>}</AdminAccess>);
    try {
        assert.match(h.dom.window.document.body.textContent || '', /private-orders/);
        time += 600_001;
        await act(async () => { for (const tick of [...h.timers.values()]) tick(); }); await h.flush();
        assert.doesNotMatch(h.dom.window.document.body.textContent || '', /private-orders/);
        assert.match(h.dom.window.document.body.textContent || '', /设备设置/);
        assert.ok(h.calls.includes('/api/admin/auth/logout'));
    } finally { Date.now = originalNow; await h.close(); }
});

test('expired API authentication clears the displayed workspace', async () => {
    const h = await harness(<AdminAccess>{() => <span>private-workspace</span>}</AdminAccess>);
    try {
        await act(async () => window.dispatchEvent(new Event('snap-admin-expired'))); await h.flush();
        assert.doesNotMatch(h.dom.window.document.body.textContent || '', /private-workspace/);
        assert.ok(h.calls.includes('/api/admin/auth/logout'));
    } finally { await h.close(); }
});

test('camera preview waits for consent, requests the exact selected camera and releases it on close', async () => {
    const requests: MediaStreamConstraints[] = []; let stopped = 0;
    const h = await harness(<AdminCameraSettings />, dom => {
        dom.window.localStorage.setItem('snap-camera-device', 'usb-camera');
        const track = new dom.window.EventTarget();
        Object.assign(track, { stop: () => stopped++, getSettings: () => ({ deviceId: 'usb-camera', width: 1280, height: 960 }) });
        const media = new dom.window.EventTarget();
        Object.assign(media, { enumerateDevices: async () => [{ deviceId: 'usb-camera', kind: 'videoinput', label: 'UGREEN Camera 4K' }], getUserMedia: async (constraints: MediaStreamConstraints) => { requests.push(constraints); return { getTracks: () => [track], getVideoTracks: () => [track] }; } });
        Object.defineProperty(dom.window.navigator, 'mediaDevices', { value: media });
        dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    });
    try {
        assert.equal(requests.length, 0);
        const open = Array.from(h.dom.window.document.querySelectorAll('button')).find(button => button.textContent?.includes('打开摄像头'))!;
        await act(async () => open.click()); await h.flush();
        assert.equal(requests.length, 1);
        assert.deepEqual((requests[0].video as MediaTrackConstraints).deviceId, { exact: 'usb-camera' });
        assert.match(h.dom.window.document.body.textContent || '', /UGREEN Camera 4K/);
        const close = Array.from(h.dom.window.document.querySelectorAll('button')).find(button => button.textContent === '关闭预览')!;
        await act(async () => close.click()); await h.flush();
        assert.ok(stopped > 0);
    } finally { await h.close(); }
});

test('missing selected camera reports a fault without silently requesting another camera', async () => {
    let requests = 0;
    const h = await harness(<AdminCameraSettings />, dom => {
        dom.window.localStorage.setItem('snap-camera-device', 'missing-camera');
        Object.defineProperty(dom.window.navigator, 'mediaDevices', { value: { enumerateDevices: async () => [], getUserMedia: async () => { requests++; throw Object.assign(Error(), { name: 'OverconstrainedError' }); } } });
    });
    try {
        const open = Array.from(h.dom.window.document.querySelectorAll('button')).find(button => button.textContent?.includes('打开摄像头'))!;
        await act(async () => open.click()); await h.flush();
        assert.equal(requests, 1);
        assert.match(h.dom.window.document.body.textContent || '', /已选摄像头不可用/);
        const save = Array.from(h.dom.window.document.querySelectorAll('button')).find(button => button.textContent?.includes('保存为拍照'))!;
        assert.equal(save.disabled, true);
    } finally { await h.close(); }
});

import { PrintPhoto } from '../apps/web/src/PrintPhoto';
test('printing waits for a click and saved frame, then disables duplicate submission', async () => {
    let count = 0, finish!: (value: unknown) => void;
    const submitted = new Promise(resolve => { finish = resolve; });
    const h = await harness(<PrintPhoto sessionId="test" imageId="image" disabled={true} />, () => {
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            let value: unknown = url === '/api/printing' ? { supported: true, configured: true } : { job: null };
            if (init?.method === 'POST') { count++; value = await submitted; }
            return { ok: true, status: 200, json: async () => value };
        }) as typeof fetch;
    });
    try {
        const button = () => [...h.dom.window.document.querySelectorAll('button')].find(b => /打印照片|正在提交|已提交打印/.test(b.textContent || ''))!;
        assert.equal(count, 0); assert.equal(button().disabled, true);
        await act(async () => h.root.render(<PrintPhoto sessionId="test" imageId="image" disabled={false} />));
        await act(async () => { button().click(); button().click(); });
        assert.equal(count, 1);
        await act(async () => finish({ id: 'print', status: 'submitted', copies: 1, cupsId: 'EPSON-42' })); await h.flush();
        assert.equal(button().disabled, true);
        assert.match(h.dom.window.document.body.textContent || '', /已提交 1 张/);
        assert.doesNotMatch(h.dom.window.document.body.textContent || '', /已打印完成/);
    } finally { finish({}); await h.close(); }
});
test('printing connection loss blocks resubmission and offers only a status query', async () => {
    let count = 0;
    const h = await harness(<PrintPhoto sessionId="test" imageId="image" disabled={false} />, () => {
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            if (init?.method === 'POST') { count++; throw Error('network lost'); }
            const value = url === '/api/printing' ? { supported: true, configured: true } : { job: count ? { id: 'print', status: 'unknown', error: '请检查队列' } : null };
            return { ok: true, status: 200, json: async () => value };
        }) as typeof fetch;
    });
    try {
        const buttons = () => [...h.dom.window.document.querySelectorAll('button')];
        await act(async () => buttons().find(b => b.textContent === '打印照片')!.click()); await h.flush();
        assert.equal(buttons().find(b => b.textContent === '打印照片')!.disabled, true);
        await act(async () => buttons().find(b => b.textContent === '查询打印状态')!.click()); await h.flush();
        assert.equal(count, 1); assert.match(h.dom.window.document.body.textContent || '', /请检查队列/);
    } finally { await h.close(); }
});

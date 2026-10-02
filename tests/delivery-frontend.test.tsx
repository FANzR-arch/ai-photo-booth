// Delivery UI checks use mocked requests and synthetic URLs; no camera, model or printer is used.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { Pickup } from '../apps/web/src/Pickup';
import { PrintPhoto } from '../apps/web/src/PrintPhoto';
import type { PrintJob } from '../packages/shared/printing';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(value => { resolve = value; });
    return { promise, resolve };
}

async function mount(component: React.ReactNode, route: (url: string, body?: any) => unknown | Promise<unknown>) {
    const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true, url: 'http://localhost/pickup/token' });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    const replace = (key: string, value: unknown) => {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    };
    for (const [key, value] of Object.entries({
        window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        location: dom.window.location, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true
    })) replace(key, value);
    const calls: { url: string; body?: any }[] = [];
    replace('fetch', async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, body });
        const result = await route(url, body) as { error?: string; status?: number } | undefined;
        return { ok: !result?.error, status: result?.error ? result.status || 400 : 200, json: async () => result };
    });
    const root = createRoot(dom.window.document.getElementById('root')!);
    const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
    await act(async () => { root.render(component); });
    await flush();
    return {
        dom, calls, flush,
        text: () => dom.window.document.body.textContent || '',
        async click(label: string) {
            const button = [...dom.window.document.querySelectorAll('button')].find(item => item.textContent?.includes(label));
            assert.ok(button, `button missing: ${label}`);
            await act(async () => { button.click(); });
            await flush();
        },
        async close() {
            await act(async () => root.unmount());
            dom.window.close();
            for (const [key, descriptor] of previous) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else delete (globalThis as any)[key];
            }
        }
    };
}

test('phone pickup offers separately labelled original and AI photos from the authorized response', async () => {
    const h = await mount(<Pickup />, () => ({
        expiresAt: Date.now() + 600000, mode: 'demo',
        original: { downloadUrl: '/api/pickup/token/original' },
        images: [{ id: 'portrait', downloadUrl: '/api/pickup/token/images/portrait' }]
    }));
    try {
        const links = [...h.dom.window.document.querySelectorAll('a[download]')];
        assert.equal(links.length, 2);
        assert.equal(links[0].textContent, '保存拍摄原片 ↓');
        assert.equal(links[0].getAttribute('href'), '/api/pickup/token/original');
        assert.equal(links[1].textContent, '保存AI 成片 ↓');
        assert.equal(links[1].getAttribute('href'), '/api/pickup/token/images/portrait');
        const originalButton = h.dom.window.document.querySelector('button[aria-label="查看拍摄原片"]') as HTMLButtonElement;
        await act(async () => { originalButton.click(); });
        assert.equal(h.dom.window.document.querySelector('h1')?.textContent, '拍摄原片');
        assert.equal(h.dom.window.document.querySelectorAll('a[download]').length, 1);
    } finally { await h.close(); }
});

test('phone does not invent an original link when the token authorizes only generated photos', async () => {
    const h = await mount(<Pickup />, () => ({
        expiresAt: Date.now() + 600000, mode: 'demo',
        images: [{ id: 'portrait', downloadUrl: '/api/pickup/token/images/portrait' }]
    }));
    try {
        assert.equal(h.dom.window.document.querySelectorAll('a[download]').length, 1);
        assert.ok(!h.text().includes('拍摄原片'));
    } finally { await h.close(); }
});

const submitted: PrintJob = { id: 'job', sessionId: 'session', imageId: 'portrait', status: 'submitted', createdAt: Date.now(), copies: 1, cupsId: 'queue-42' };
const printRoute = (url: string) => url === '/api/printing' ? { supported: true, configured: true } : { job: null };

test('manual printing immediately says printing and repeated clicks cannot submit twice', async () => {
    const pending = deferred<PrintJob>();
    const h = await mount(<PrintPhoto sessionId="session" imageId="portrait" disabled={false} />, (url, body) => body ? pending.promise : printRoute(url));
    try {
        await h.click('打印照片');
        const button = h.dom.window.document.querySelector('.photo-print-action > button') as HTMLButtonElement;
        assert.equal(button.textContent, '正在打印');
        assert.equal(button.disabled, true);
        await act(async () => { button.click(); button.click(); });
        assert.equal(h.calls.filter(item => item.body).length, 1);
        pending.resolve(submitted);
        await h.flush();
        assert.equal(button.textContent, '正在打印');
        assert.equal(button.disabled, true);
        assert.ok(h.text().includes('请等待出纸'));
        assert.ok(!h.text().includes('queue-42'));
    } finally { pending.resolve(submitted); await h.close(); }
});

test('restored submitted or uncertain print jobs stay locked instead of dispatching again', async () => {
    for (const status of ['submitted', 'unknown'] as const) {
        const h = await mount(<PrintPhoto sessionId="session" imageId="portrait" disabled={false} />, url => url === '/api/printing' ? { supported: true, configured: true } : { job: { ...submitted, status } });
        try {
            const button = h.dom.window.document.querySelector('.photo-print-action > button') as HTMLButtonElement;
            assert.equal(button.disabled, true);
            assert.equal(button.textContent, status === 'submitted' ? '正在打印' : '请确认打印状态');
            await act(async () => { button.click(); });
            assert.equal(h.calls.filter(item => item.body).length, 0);
        } finally { await h.close(); }
    }
});

test('a definite print rejection shows its reason while a lost response requires checking status', async () => {
    for (const uncertain of [false, true]) {
        const h = await mount(<PrintPhoto sessionId="session" imageId="portrait" disabled={false} />, (url, body) => {
            if (!body) return printRoute(url);
            if (uncertain) throw new Error('connection lost');
            return { error: '正在提交上一张照片，请稍后再试。', status: 409 };
        });
        try {
            await h.click('打印照片');
            const button = h.dom.window.document.querySelector('.photo-print-action > button') as HTMLButtonElement;
            assert.equal(button.disabled, uncertain);
            assert.ok(h.text().includes(uncertain ? '确认前不要重复打印' : '正在提交上一张照片'));
            assert.equal(button.textContent, uncertain ? '请确认打印状态' : '打印照片');
        } finally { await h.close(); }
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useBoothTransition } from '../apps/web/src/useBoothTransition';

async function setup(reduced = false) {
    const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
    const saved = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
        saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true });
    }
    Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }) });
    const queued: Array<{ update: () => void; skip: number; finish: () => void }> = [];
    Object.assign(dom.window.document, { startViewTransition(update: () => void) {
        let finish!: () => void;
        const finished = new Promise<void>(resolve => { finish = resolve; });
        const item = { update, skip: 0, finish };
        queued.push(item);
        return { finished, skipTransition: () => { item.skip++; } };
    } });
    let hook!: ReturnType<typeof useBoothTransition>;
    function Screen() { hook = useBoothTransition(); return <main ref={hook.main}>{hook.step}</main>; }
    const root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => root.render(<Screen />));
    return {
        queued, dom,
        go: async (step: string) => { await act(async () => hook.setStep(step)); },
        apply: async (i: number) => { await act(async () => queued[i].update()); },
        text: () => dom.window.document.querySelector('main')!.textContent,
        close: async () => {
            await act(async () => { root.unmount(); queued.forEach(item => item.finish()); });
            dom.window.close();
            for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
        },
    };
}

test('ending during a queued transition clears immediately and stale callbacks cannot restore the page', async () => {
    const h = await setup();
    try {
        await h.go('confirm');
        assert.equal(h.queued.length, 1);
        await h.go('home');
        assert.equal(h.text(), 'home');
        assert.equal(h.queued[0].skip, 1);
        await h.apply(0);
        assert.equal(h.text(), 'home');
    } finally { await h.close(); }
});

test('native transitions preserve forward/back direction and allow subsequent navigation before completion', async () => {
    const h = await setup();
    try {
        await h.go('payment'); await h.apply(0);
        assert.equal(h.text(), 'payment');
        assert.equal(h.dom.window.document.documentElement.dataset.boothDirection, 'forward');
        await h.go('results'); await h.apply(1);
        assert.equal(h.text(), 'results');
        assert.equal(h.dom.window.document.documentElement.dataset.boothDirection, 'back');
        assert.equal(h.queued[0].skip, 1);
    } finally { await h.close(); }
});

test('reduced motion updates pages immediately without starting snapshots', async () => {
    const h = await setup(true);
    try {
        await h.go('styles');
        assert.equal(h.text(), 'styles');
        assert.equal(h.queued.length, 0);
    } finally { await h.close(); }
});

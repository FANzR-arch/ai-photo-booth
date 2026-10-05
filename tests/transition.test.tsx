import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useBoothTransition } from '../apps/web/src/useBoothTransition';

async function setup(reduced = false, mode: 'native' | 'fallback' | 'throw' = 'native') {
    const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
    const saved = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
        saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true });
    }
    const listeners = new Set<() => void>();
    const media = { matches: reduced, addEventListener(_type: string, listener: () => void) { listeners.add(listener); }, removeEventListener(_type: string, listener: () => void) { listeners.delete(listener); } };
    Object.defineProperty(dom.window, 'matchMedia', { value: () => media });
    const animations: Array<{ target: HTMLElement; frames: Keyframe[]; options: KeyframeAnimationOptions; canceled: number }> = [];
    Object.defineProperty(dom.window.HTMLElement.prototype, 'animate', { configurable: true, value: function(this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
        const animation = { target: this, frames, options, canceled: 0 };
        animations.push(animation);
        return { cancel: () => { animation.canceled++; } };
    } });
    const queued: Array<{ update: () => void; skip: number; finish: () => void }> = [];
    if (mode !== 'fallback') Object.assign(dom.window.document, { startViewTransition(update: () => void) {
        if (mode === 'throw') throw new Error('Snapshots unavailable');
        let finish!: () => void;
        const finished = new Promise<void>(resolve => { finish = resolve; });
        let settleReady!: () => void, rejectReady!: () => void;
        const ready = new Promise<void>((resolve, reject) => {
            settleReady = resolve;
            rejectReady = () => reject(new dom.window.DOMException('Transition skipped', 'AbortError'));
        });
        const item = { update: () => { update(); settleReady(); }, skip: 0, finish };
        queued.push(item);
        return { finished, ready, skipTransition: () => { item.skip++; rejectReady(); } };
    } });
    let hook!: ReturnType<typeof useBoothTransition>;
    function Screen() {
        hook = useBoothTransition();
        return <main ref={hook.main}><section>
            {hook.step !== 'home' && <div className="camera-frame"><img src="private-photo.jpg" alt="personal photo" /></div>}
            <div className="capture-copy">{hook.step}</div>
        </section></main>;
    }
    const root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => root.render(<Screen />));
    return {
        queued, dom, animations,
        go: async (step: string, immediate = false) => { await act(async () => hook.setStep(step, immediate)); },
        apply: async (i: number) => { await act(async () => queued[i].update()); },
        finish: async (i: number) => { await act(async () => queued[i].finish()); },
        reduce: async () => { await act(async () => { media.matches = true; listeners.forEach(listener => listener()); }); },
        wheel: async () => {
            const event = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true });
            await act(async () => dom.window.document.querySelector('section')!.dispatchEvent(event));
            return event;
        },
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
        await h.apply(0);
        assert.ok(h.dom.window.document.querySelector('img'));
        await h.go('generating');
        await h.go('home');
        assert.equal(h.text(), 'home');
        assert.equal(h.queued.length, 2);
        assert.equal(h.queued[1].skip, 1);
        assert.equal(h.dom.window.document.querySelector('img'), null);
        assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, undefined);
        assert.equal(h.animations.length, 0);
        await h.apply(0);
        await h.apply(1);
        assert.equal(h.text(), 'home');
    } finally { await h.close(); }
});

test('native transitions preserve forward/back direction and allow subsequent navigation before completion', async () => {
    const h = await setup();
    try {
        await h.go('confirm');
        assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, 'out');
        await h.apply(0);
        assert.equal(h.text(), 'confirm');
        assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, 'in');
        assert.equal(h.dom.window.document.documentElement.dataset.boothDirection, 'forward');
        await h.go('generating'); await h.apply(1);
        assert.equal(h.text(), 'generating');
        assert.equal(h.dom.window.document.documentElement.dataset.boothDirection, 'forward');
        assert.equal(h.queued[0].skip, 1);
        await h.go('confirm');
        await h.finish(1);
        assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, 'out');
        await h.apply(2);
        assert.equal(h.text(), 'confirm');
        assert.equal(h.dom.window.document.documentElement.dataset.boothDirection, 'back');
        assert.equal(h.queued[1].skip, 1);
        await h.apply(0);
        assert.equal(h.text(), 'confirm');
    } finally { await h.close(); }
});

test('reduced motion updates pages immediately without starting snapshots', async () => {
    const h = await setup(true);
    try {
        await h.go('styles');
        assert.equal(h.text(), 'styles');
        assert.equal(h.queued.length, 0);
        assert.equal(h.animations.length, 0);
        await h.go('confirm');
        assert.equal(h.text(), 'confirm');
        assert.equal(h.animations.length, 0);
    } finally { await h.close(); }
});

test('home to styles transitions once and a scroll gesture immediately releases the native snapshot', async () => {
    const h = await setup();
    try {
        await h.go('styles');
        assert.equal(h.queued.length, 1);
        await h.apply(0);
        await h.go('styles');
        assert.equal(h.queued.length, 1);
        assert.equal((await h.wheel()).defaultPrevented, false);
        assert.equal(h.queued[0].skip, 1);
        assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, undefined);
        assert.equal(h.text(), 'styles');
    } finally { await h.close(); }
});

test('changing reduced-motion preference settles pending navigation and invalidates its old callback', async () => {
    const h = await setup();
    try {
        await h.go('styles');
        await h.reduce();
        assert.equal(h.text(), 'styles');
        assert.equal(h.queued[0].skip, 1);
        assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, undefined);
        await h.apply(0);
        assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, undefined);
        await h.go('camera');
        assert.equal(h.text(), 'camera');
        assert.equal(h.queued.length, 1);
        assert.equal(h.animations.length, 0);
    } finally { await h.close(); }
});

test('fallback navigation is brief, reverses direction and cancels interrupted animation', async () => {
    const h = await setup(false, 'fallback');
    try {
        assert.equal(h.animations.length, 0);
        await h.go('styles');
        assert.equal(h.text(), 'styles');
        assert.equal(h.animations[0].options.duration, 220);
        assert.equal(h.animations[0].frames[0].transform, 'translate3d(12px,0,0)');
        assert.equal((await h.wheel()).defaultPrevented, false);
        assert.ok(h.animations[0].canceled > 0);
        await h.go('results');
        await h.go('camera');
        assert.equal(h.text(), 'camera');
        assert.ok(h.animations[1].canceled > 0);
        assert.equal(h.animations[2].frames[0].transform, 'translate3d(-12px,0,0)');
    } finally { await h.close(); }
});

test('fallback keeps captured photos stationary and reveals generated results with opacity only', async () => {
    const h = await setup(false, 'fallback');
    try {
        await h.go('camera');
        await h.go('confirm');
        assert.equal(h.animations[1].target.className, 'capture-copy');
        assert.ok(h.animations.every(animation => !animation.target.matches('.camera-frame, .camera-frame img')));
        await h.go('generating');
        await h.go('results');
        assert.deepEqual(h.animations[3].frames, [{ opacity: 0 }, { opacity: 1 }]);
        await h.go('home');
        assert.equal(h.text(), 'home');
        assert.equal(h.animations.length, 4);
        assert.ok(h.animations[3].canceled > 0);
        assert.equal(h.dom.window.document.querySelector('img'), null);
    } finally { await h.close(); }
});

test('explicit immediate navigation bypasses native and fallback motion', async () => {
    for (const mode of ['native', 'fallback'] as const) {
        const h = await setup(false, mode);
        try {
            await h.go('confirm');
            const count = h.animations.length;
            await h.go('library', true);
            assert.equal(h.text(), 'library');
            assert.equal(h.animations.length, count);
            assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, undefined);
            if (mode === 'native') { await h.apply(0); assert.equal(h.text(), 'library'); }
        } finally { await h.close(); }
    }
});

test('snapshot failure still navigates and uses the interruptible fallback', async () => {
    const h = await setup(false, 'throw');
    try {
        await h.go('styles');
        assert.equal(h.text(), 'styles');
        assert.equal(h.animations.length, 1);
        assert.equal(h.dom.window.document.documentElement.dataset.boothPhase, undefined);
        await h.reduce();
        assert.ok(h.animations[0].canceled > 0);
        await h.go('camera');
        assert.equal(h.text(), 'camera');
        assert.equal(h.animations.length, 1);
    } finally { await h.close(); }
});

test('navigation remains usable when neither snapshot nor animation API exists', async () => {
    const h = await setup(false, 'fallback');
    try {
        delete (h.dom.window.HTMLElement.prototype as any).animate;
        await h.go('styles');
        await h.go('confirm');
        assert.equal(h.text(), 'confirm');
        assert.equal(h.animations.length, 0);
    } finally { await h.close(); }
});

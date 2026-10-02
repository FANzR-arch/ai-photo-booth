import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const stages = ['home', 'styles', 'library', 'camera', 'confirm', 'payment', 'generating', 'results', 'pickup'];
const duration = 220;
const easing = 'cubic-bezier(0.23, 1, 0.32, 1)';
type Transition = { finished: Promise<void>; ready?: Promise<void>; skipTransition: () => void };
type TransitionDocument = Document & { startViewTransition?: (update: () => void) => Transition };
type Navigation = { version: number; from: string; to: string; direction: 'forward' | 'back' };

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
function clearSnapshotNames() { delete document.documentElement.dataset.boothPhase; }

/** Only the active page moves; ending a session never retains a personal-photo snapshot. */
export function useBoothTransition() {
    const [step, updateStep] = useState('home');
    const current = useRef('home');
    const main = useRef<HTMLElement>(null);
    const running = useRef<Transition | undefined>(undefined);
    const animations = useRef<Animation[]>([]);
    const fallback = useRef<Navigation | undefined>(undefined);
    const revision = useRef(0);
    const native = useRef(false);
    const alive = useRef(true);

    const cancelAnimations = useCallback(() => {
        animations.current.forEach(animation => animation.cancel());
        animations.current = [];
    }, []);

    const stopMotion = useCallback(() => {
        running.current?.skipTransition();
        running.current = undefined;
        native.current = false;
        fallback.current = undefined;
        cancelAnimations();
        clearSnapshotNames();
    }, [cancelAnimations]);

    const setStep = useCallback((next: string, immediate = false) => {
        const previous = current.current;
        if (previous === next) return;
        const version = ++revision.current;
        stopMotion();
        current.current = next;
        const direction = stages.indexOf(next) < stages.indexOf(previous) ? 'back' : 'forward';
        const navigation: Navigation = { version, from: previous, to: next, direction };
        const doc = document as TransitionDocument;
        // Clear before another snapshot can be captured, including interrupted navigation.
        if (immediate || reducedMotion() || next === 'home') {
            updateStep(next);
            return;
        }
        const metadata = document.documentElement.dataset;
        metadata.boothDirection = direction;
        metadata.boothFrom = previous;
        metadata.boothTo = next;
        if (!doc.startViewTransition) {
            fallback.current = navigation;
            updateStep(next);
            return;
        }
        native.current = true;
        metadata.boothPhase = 'out';
        try {
            const transition = doc.startViewTransition(() => {
                if (!alive.current || version !== revision.current) return;
                metadata.boothPhase = 'in';
                flushSync(() => updateStep(next));
            });
            running.current = transition;
            // Interrupted snapshots reject ready even though navigation itself succeeds.
            void transition.ready?.catch(() => {});
            void transition.finished.catch(() => {}).finally(() => {
                if (version !== revision.current) return;
                native.current = false;
                running.current = undefined;
                clearSnapshotNames();
            });
        } catch {
            native.current = false;
            clearSnapshotNames();
            fallback.current = navigation;
            updateStep(next);
        }
    }, [stopMotion]);

    useLayoutEffect(() => {
        const navigation = fallback.current;
        if (!navigation || navigation.version !== revision.current || navigation.to !== step || native.current || reducedMotion()) return;
        fallback.current = undefined;
        const container = main.current;
        if (!container) return;
        const capture = navigation.from === 'camera' && step === 'confirm';
        // The captured photo stays put; only its instructions change in the fallback.
        const targets = container.querySelectorAll<HTMLElement>(capture ? '.capture-copy' : ':scope > section');
        const reveal = navigation.from === 'generating' && step === 'results';
        const offset = navigation.direction === 'back' ? -12 : 12;
        const started = Array.from(targets).filter(target => typeof target.animate === 'function').map(target => target.animate(
            reveal ? [{ opacity: 0 }, { opacity: 1 }] : [
                { opacity: 0, transform: `translate3d(${offset}px,0,0)` },
                { opacity: 1, transform: 'translate3d(0,0,0)' },
            ], { duration, easing }));
        animations.current = started;
        return () => started.forEach(animation => animation.cancel());
    }, [step]);

    useEffect(() => {
        alive.current = true;
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const reduce = () => {
            if (!media?.matches) return;
            ++revision.current;
            stopMotion();
            updateStep(current.current);
        };
        // A gesture on the theme library immediately hands control to native scrolling.
        const interact = () => { if (current.current === 'styles') stopMotion(); };
        const container = main.current;
        media?.addEventListener('change', reduce);
        container?.addEventListener('pointerdown', interact, { passive: true });
        container?.addEventListener('wheel', interact, { passive: true });
        container?.addEventListener('keydown', interact);
        return () => {
            alive.current = false;
            ++revision.current;
            stopMotion();
            media?.removeEventListener('change', reduce);
            container?.removeEventListener('pointerdown', interact);
            container?.removeEventListener('wheel', interact);
            container?.removeEventListener('keydown', interact);
        };
    }, [stopMotion]);
    return { step, setStep, main };
}

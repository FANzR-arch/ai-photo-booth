import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const stages = ['home', 'styles', 'library', 'camera', 'confirm', 'generating', 'results', 'payment', 'pickup'];
type Transition = { finished: Promise<void>; skipTransition: () => void };
type TransitionDocument = Document & { startViewTransition?: (update: () => void) => Transition };

/** Native snapshots preserve photo continuity; state changes never depend on animation completion. */
export function useBoothTransition() {
    const [step, updateStep] = useState('home');
    const current = useRef('home');
    const main = useRef<HTMLElement>(null);
    const running = useRef<Transition | undefined>(undefined);
    const revision = useRef(0);
    const direction = useRef('forward');
    const native = useRef(false);
    const alive = useRef(true);
    const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const setStep = useCallback((next: string, immediate = false) => {
        const previous = current.current;
        if (previous === next) return;
        const version = ++revision.current;
        running.current?.skipTransition();
        current.current = next;
        direction.current = stages.indexOf(next) < stages.indexOf(previous) ? 'back' : 'forward';
        const doc = document as TransitionDocument;
        // Ending a visitor session clears personal imagery immediately, without keeping an exit snapshot.
        if (immediate || !doc.startViewTransition || reduced() || next === 'home' || next === 'styles') {
            native.current = false;
            updateStep(next);
            return;
        }
        native.current = true;
        document.documentElement.dataset.boothDirection = direction.current;
        document.documentElement.dataset.boothFrom = previous;
        document.documentElement.dataset.boothTo = next;
        try {
            const transition = doc.startViewTransition(() => {
                if (alive.current && version === revision.current) flushSync(() => updateStep(next));
            });
            running.current = transition;
            void transition.finished.catch(() => {}).finally(() => {
                if (version === revision.current) { native.current = false; running.current = undefined; }
            });
        } catch {
            native.current = false;
            updateStep(next);
        }
    }, []);

    useLayoutEffect(() => {
        if (step === 'styles' || native.current || reduced() || !main.current?.animate) return;
        const targets = main.current.querySelectorAll<HTMLElement>(':scope > section');
        const animations = Array.from(targets).map(target => target.animate([
            { opacity: 0, transform: `translate3d(0,${step === 'payment' ? 28 : 10}px,0)` },
            { opacity: 1, transform: 'translate3d(0,0,0)' },
        ], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }));
        return () => animations.forEach(animation => animation.cancel());
    }, [step]);
    useEffect(() => {
        alive.current = true;
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const stop = () => { if (media?.matches) { running.current?.skipTransition(); main.current?.getAnimations?.({ subtree: true }).forEach(a => a.cancel()); } };
        media?.addEventListener('change', stop);
        return () => { alive.current = false; revision.current++; running.current?.skipTransition(); media?.removeEventListener('change', stop); };
    }, []);
    return { step, setStep, main };
}

import { useEffect } from 'react';

const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');

/** Keep visitors inside the booth: no zoom, long-press menus, text selection or image drags. The phone pickup page keeps all of these. */
export function useKioskTouch() {
    useEffect(() => {
        const root = document.documentElement;
        const viewport = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
        const previous = viewport?.content;
        if (viewport) viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
        root.classList.add('kiosk-touch');
        const block = (event: Event) => { if (!editable(event.target)) event.preventDefault(); };
        const zoomKeys = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) event.preventDefault(); };
        const zoomWheel = (event: WheelEvent) => { if (event.ctrlKey) event.preventDefault(); };
        document.addEventListener('contextmenu', block);
        document.addEventListener('dragstart', block);
        document.addEventListener('gesturestart', block);
        document.addEventListener('keydown', zoomKeys);
        document.addEventListener('wheel', zoomWheel, { passive: false });
        return () => {
            if (viewport && previous !== undefined) viewport.content = previous;
            root.classList.remove('kiosk-touch');
            document.removeEventListener('contextmenu', block);
            document.removeEventListener('dragstart', block);
            document.removeEventListener('gesturestart', block);
            document.removeEventListener('keydown', zoomKeys);
            document.removeEventListener('wheel', zoomWheel);
        };
    }, []);
}

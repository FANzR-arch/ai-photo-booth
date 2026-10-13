import { useState } from 'react';

/** Illustrated wait-page art with its emoji stand-in, used until the PNG exists or if it fails to load. */
export function Art({ src, emoji, alt = '', className = '' }: { src: string; emoji: string; alt?: string; className?: string }) {
    const [failed, setFailed] = useState(false);
    return failed ? <span className={`wait-art is-emoji ${className}`} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>{emoji}</span>
        : <img className={`wait-art ${className}`} src={src} alt={alt} draggable={false} onError={() => setFailed(true)} />;
}

/** Loads art for canvas drawing; resolves undefined when missing so callers can draw the emoji instead. */
export function loadArt(src: string) {
    return new Promise<HTMLImageElement | undefined>(resolve => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(undefined);
        image.src = src;
    });
}

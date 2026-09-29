export type PhotoOrientation = 'portrait' | 'landscape' | 'poster' | 'portrait4x5' | 'landscape3x2';

export const isPhotoOrientation = (value: unknown): value is PhotoOrientation =>
    value === 'portrait' || value === 'landscape' || value === 'poster' || value === 'portrait4x5' || value === 'landscape3x2';

export const orientationRatio = (value: PhotoOrientation) => ({ portrait: '3:4', landscape: '4:3', poster: '2:3', portrait4x5: '4:5', landscape3x2: '3:2' }[value]);

export const orientationLabel = (value: PhotoOrientation) =>
    `${value.startsWith('landscape') ? '横版' : '竖版'} ${orientationRatio(value)}`;

/** Exact aspect ratios; HQ uses sizes verified with the configured Seedream model. */
export function orientedSize(size: string, orientation: PhotoOrientation): string {
    // About 2.2 MP. These are actual requested generation dimensions, never an upscale.
    if (size === 'HQ') return ({ portrait: '1296x1728', landscape: '1728x1296', poster: '1216x1824', portrait4x5: '1344x1680', landscape3x2: '1824x1216' })[orientation];
    const match = /^(\d+(?:\.\d+)?)K$/i.exec(size.trim());
    if (!match) return size;
    if (orientation === 'portrait4x5' || orientation === 'landscape3x2') {
        const [w, h] = orientationRatio(orientation).split(':').map(Number);
        const unit = Math.round(Number(match[1]) * 1024 / Math.max(w, h) / 16) * 16;
        return `${w * unit}x${h * unit}`;
    }
    if (orientation === 'poster') {
        const unit = Math.round(Number(match[1]) * 1024 / 192) * 64;
        return `${unit * 2}x${unit * 3}`;
    }
    const longSide = Math.round(Number(match[1]) * 1024 / 64) * 64;
    const shortSide = Math.round(longSide * .75 / 64) * 64;
    return orientation === 'portrait'
        ? `${shortSide}x${longSide}`
        : `${longSide}x${shortSide}`;
}

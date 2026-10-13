import type { CSSProperties } from 'react';
import { maxStickers, stickerSlots } from '../../../../packages/shared/wait-experience';
import { stickerSrc, waitStickers, type WaitStickerId } from '../../../../packages/shared/wait-assets';
import { Art, loadArt } from './Art';

/** A3 贴贴纸: the original photo on the left is the canvas; the tray sits in the game area. */
export type Sticker = { id: number; art: WaitStickerId; slot: number };

export function addSticker(list: Sticker[], art: WaitStickerId, id: number): Sticker[] {
    const used = new Set(list.map(s => s.slot));
    const slot = stickerSlots.findIndex((_, i) => !used.has(i));
    return slot < 0 || list.length >= maxStickers ? list : [...list, { id, art, slot }];
}

export function StickerLayer({ stickers, onRemove, finale }: { stickers: Sticker[]; onRemove: (id: number) => void; finale: boolean }) {
    return <div className={`sticker-layer ${finale ? 'is-finale' : ''}`}>
        {stickers.map(s => <button type="button" key={s.id} className="placed-sticker" aria-label={`拿掉贴纸 ${waitStickers[s.art].name}`} disabled={finale}
            style={{ left: `${stickerSlots[s.slot][0] * 100}%`, top: `${stickerSlots[s.slot][1] * 100}%` } as CSSProperties} onClick={() => onRemove(s.id)}>
            <Art src={stickerSrc(s.art)} emoji={waitStickers[s.art].emoji} />
        </button>)}
    </div>;
}

export function StickerTray({ set, count, onAdd, finale }: { set: WaitStickerId[]; count: number; onAdd: (art: WaitStickerId) => void; finale: boolean }) {
    return <div className={`wait-game sticker-tray ${finale ? 'is-finale' : ''}`} data-game="stickers" aria-label="等待小游戏：贴贴纸">
        <p className="sticker-note">装饰的是原片，会和成片一起带走</p>
        <div className="sticker-options" role="group" aria-label="贴纸">{set.map((art, i) => <button type="button" key={art} aria-label={`贴上 ${waitStickers[art].name}`} disabled={finale || count >= maxStickers} data-demo={i === 0 ? '' : undefined} onClick={() => onAdd(art)}>
            <Art src={stickerSrc(art)} emoji={waitStickers[art].emoji} />
        </button>)}</div>
        <p className="sticker-count">{count >= maxStickers ? '贴满啦！点照片上的贴纸可以拿掉' : count ? `已贴 ${count} 个 · 点照片上的贴纸可以拿掉` : '点一下，贴到照片上'}</p>
        {finale && <p className="game-finale" aria-hidden="true">贴好啦！</p>}
    </div>;
}

/** Draws what the visitor saw: the photo cropped to the on-screen box (centre crop), stickers at the same spots. */
export async function composeDecorated(src: string, stickers: Sticker[], box: { width: number; height: number }) {
    const image = await loadArt(src);
    if (!image) throw new Error('photo unavailable');
    const aspect = box.width > 0 && box.height > 0 ? box.width / box.height : image.naturalWidth / image.naturalHeight;
    let sw = image.naturalWidth, sh = image.naturalHeight;
    if (sw / sh > aspect) sw = sh * aspect; else sh = sw / aspect;
    const scale = Math.min(1, 1600 / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    // Same size as on screen: the sticker box is 16% of the photo's shorter side.
    const size = Math.min(canvas.width, canvas.height) * .16;
    const arts = await Promise.all(stickers.map(s => loadArt(stickerSrc(s.art))));
    ctx.font = `${size * .85}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    stickers.forEach((s, i) => {
        const x = stickerSlots[s.slot][0] * canvas.width, y = stickerSlots[s.slot][1] * canvas.height, art = arts[i];
        if (art) ctx.drawImage(art, x - size / 2, y - size / 2, size, size);
        else ctx.fillText(waitStickers[s.art].emoji, x, y);
    });
    return canvas.toDataURL('image/jpeg', .9);
}

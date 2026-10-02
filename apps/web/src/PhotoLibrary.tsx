import { useEffect, useState } from 'react';
import type { Session } from '../../../packages/shared/types';
import { PhotoFrame } from './PhotoFrame';

export function usePhotoClock() {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const update = () => setNow(Date.now());
        const timer = setInterval(update, 1000);
        window.addEventListener('pageshow', update);
        document.addEventListener('visibilitychange', update);
        return () => { clearInterval(timer); window.removeEventListener('pageshow', update); document.removeEventListener('visibilitychange', update); };
    }, []);
    return now;
}

export function timeLeft(expiresAt: number, now: number) {
    const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function PhotoLibrary({ sessions, draftPhoto, now, busy, onOpen, onNew, onBack }: {
    sessions: Session[]; draftPhoto: (id: string) => string; now: number; busy: boolean;
    onOpen: (session: Session) => void; onNew: () => void; onBack: () => void;
}) {
    const photos = sessions.filter(s => s.expiresAt > now && (s.originalUrl || s.images.length || draftPhoto(s.id)));
    return <section className="photo-library">
        <button className="text-button library-back" onClick={onBack}>← 返回</button>
        <div className="library-heading"><div><span className="eyebrow">THIS VISIT</span><h1>本轮照片库</h1><p>生成完成后保留 10 分钟，到期自动删除。结束本次后，照片库会隐藏。</p></div><button className="primary" disabled={busy} onClick={onNew}>再拍一张 ↗</button></div>
        {photos.length ? <div className="library-grid">{photos.map(s => {
            const src = s.images[0]?.previewUrl || draftPhoto(s.id) || s.originalUrl!;
            const status = s.status === 'generating' ? '正在生成' : ['failed', 'unknown'].includes(s.status) ? '查看生成状态' : s.images.length ? (s.pickupUrl ? '已购买 · 查看照片' : '查看照片') : s.order?.status === 'paid' ? '已付款 · 继续生成' : '待确认';
            return <button className="library-card" key={s.id} disabled={busy} onClick={() => onOpen(s)} aria-label={`${s.styleName} · ${status}`}>
                <PhotoFrame src={src} frame={s.images.length ? s.frame ?? 'none' : 'none'} caption={s.caption} alt={`${s.styleName}照片`} />
                <span className="library-card-title"><strong>{s.styleName}</strong><span>↗</span></span>
                <span className="library-card-status">{status}</span>
                <span className="photo-expiry">{s.images.length ? '剩余保存' : '本次有效'} {timeLeft(s.expiresAt, now)}</span>
            </button>;
        })}</div> : <div className="library-empty"><span aria-hidden="true">▧</span><h2>还没有可查看的照片</h2><p>拍摄的照片会出现在这里，已到期的照片会自动移除。</p></div>}
    </section>;
}

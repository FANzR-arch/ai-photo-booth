import type { ReactNode } from 'react';
import { PhotoFrame } from './PhotoFrame';
import { PrintPhoto } from './PrintPhoto';
import type { FrameId, Caption } from '../../../packages/shared/frames';
import type { Session } from '../../../packages/shared/types';

export function PhotoResults({ session, photo, selected, busy, frame, caption, children, onSelect, onPickup }: {
    session: Session; photo: string; selected: string[]; busy: boolean; frame: FrameId; caption?: Caption; children?: ReactNode;
    onSelect: (id: string) => void; onPickup: () => void;
}) {
    const original = session.originalUrl || photo;
    return <section className="results portrait-results" data-orientation={session.orientation}>
        <div className="results-heading"><h1>照片已生成</h1><span className="result-theme">{session.styleName}</span></div>
        <div className="portrait-comparison">
            <article className="original-print"><div className="print-heading"><span>拍摄原片</span></div>
                {original ? <img src={original} alt="拍摄原片" /> : <div className="original-missing">此历史会话暂无原片预览</div>}
                <div className="print-caption">{original && <a className="original-download" href={original} download="snap-original.jpg">保存拍摄原片 ↓</a>}</div>
            </article>
            <div className="generated-portraits">{session.images.map((img, i) => <button key={img.id} className={`photo-print generated-print ${selected.includes(img.id) ? 'selected' : ''}`} aria-pressed={selected.includes(img.id)} aria-label={`选择生成照片 ${i + 1}`} onClick={() => onSelect(img.id)}>
                <div className="print-heading"><span>AI 成片</span>{session.images.length > 1 && <span className="generated-label">{selected.includes(img.id) ? '✓ 已选' : '选择这张'}</span>}</div>
                <PhotoFrame src={img.previewUrl} alt={`生成照片预览 ${i + 1}`} frame={frame} caption={caption} />
            </button>)}</div>
        </div>
        {session.status === 'partial' && <p className="error">部分生成成功，仅展示可用图片。</p>}
        {children}
        <div className="checkout-bar result-delivery-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, position: 'static' }}>
            <PrintPhoto sessionId={session.id} imageId={selected[0]} disabled={busy} />
            <button className="secondary" disabled={!session.pickupUrl || busy} onClick={onPickup}>{busy ? '正在准备…' : '手机取图 →'}</button>
        </div>
    </section>;
}

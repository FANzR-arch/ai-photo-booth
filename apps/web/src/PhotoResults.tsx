import type { ReactNode } from 'react';
import { PhotoFrame } from './PhotoFrame';
import { PrintPhoto } from './PrintPhoto';
import type { FrameId, Caption } from '../../../packages/shared/frames';
import type { Session } from '../../../packages/shared/types';
import { orientationLabel } from '../../../packages/shared/photo-orientation';
import { clothingLabel } from '../../../packages/shared/clothing';

export function PhotoResults({ session, photo, selected, busy, frame, caption, children, onSelect, onCheckout }: {
    session: Session; photo: string; selected: string[]; busy: boolean; frame: FrameId; caption?: Caption; children?: ReactNode;
    onSelect: (id: string) => void; onCheckout: () => void;
}) {
    const original = session.originalUrl || photo;
    return <section className="results portrait-results" data-orientation={session.orientation}>
        <div className="results-heading"><div><h1>照片已生成</h1><p className="result-review-note">先看大图里的神态与构图，再挑选喜欢的相纸。</p></div><div className="result-meta"><span>{session.orientation ? orientationLabel(session.orientation) : '照片效果'}</span><span>{clothingLabel(session.clothingMode)}</span><span className="result-theme">{session.styleName}</span></div></div>
        <div className="portrait-comparison">
            <article className="original-print"><div className="print-heading"><span>01 / 原照片</span><span className="free-label">免费</span></div>
                {original ? <img src={original} alt="免费原照片" /> : <div className="original-missing">此历史会话暂无原图预览</div>}
                <div className="print-caption">{original && <a className="original-download" href={original} download="snap-original.jpg">免费保存原图 ↓</a>}</div>
            </article>
            <div className="generated-portraits">{session.images.map((img, i) => <button key={img.id} className={`photo-print generated-print ${selected.includes(img.id) ? 'selected' : ''}`} aria-pressed={selected.includes(img.id)} aria-label={`选择生成照片 ${i + 1}`} onClick={() => onSelect(img.id)}>
                <div className="print-heading"><span>02 / 照片效果</span><span className="generated-label">{selected.includes(img.id) ? '✓ 已选' : '选择这张'}</span></div>
                <PhotoFrame src={img.previewUrl} alt={`生成照片预览 ${i + 1}`} frame={frame} caption={caption} />
                <div className="print-caption"><small>高清照片</small></div>
            </button>)}</div>
        </div>
        {session.status === 'partial' && <p className="error">部分生成成功，仅展示可用图片。</p>}
        {children}
        <div className="checkout-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, position: 'static' }}><PrintPhoto sessionId={session.id} imageId={selected[0]} disabled={busy} /><button className="secondary" disabled={!selected.length || busy} onClick={onCheckout}>{busy ? '正在准备…' : `选择照片 ${selected.length} 张 · ${selected.length ? '¥9.90' : '请选择'}`}</button></div>
    </section>;
}

import type { ReactNode } from 'react';
import { PhotoFrame } from './PhotoFrame';
import type { FrameId, Caption } from '../../../packages/shared/frames';
import type { Session } from '../../../packages/shared/types';

/** The AI photo is the hero; decoration sits beside it and one button leads to the delivery screen (QR + print). */
export function PhotoResults({ session, photo, selected, busy, frame, caption, children, onSelect, onPickup }: {
    session: Session; photo: string; selected: string[]; busy: boolean; frame: FrameId; caption?: Caption; children?: ReactNode;
    onSelect: (id: string) => void; onPickup: () => void;
}) {
    const original = session.originalUrl || photo;
    const hero = session.images.find(img => selected.includes(img.id)) ?? session.images[0];
    return <section className="results portrait-results" data-orientation={session.orientation}>
        <div className="result-stage">
            <div className="result-hero">{hero && <PhotoFrame key={hero.id} src={hero.previewUrl} alt="生成照片预览" frame={frame} caption={caption} />}</div>
            {session.images.length > 1 && <div className="result-thumbs" role="group" aria-label="选择生成照片">{session.images.map((img, i) => <button key={img.id} className={selected.includes(img.id) ? 'selected' : ''} aria-pressed={selected.includes(img.id)} aria-label={`选择生成照片 ${i + 1}`} onClick={() => onSelect(img.id)}>
                <img src={img.previewUrl} alt="" draggable={false} /><span>{selected.includes(img.id) ? '✓ 已选' : `第 ${i + 1} 张`}</span>
            </button>)}</div>}
        </div>
        <div className="result-side">
            <div className="results-heading"><h1>照片已生成</h1><span className="result-theme">{session.styleName}</span></div>
            {session.status === 'partial' && <p className="error">部分生成成功，仅展示可用图片。</p>}
            {children}
            <div className="result-original">
                {original ? <img src={original} alt="拍摄原片" draggable={false} /> : <div className="original-missing">暂无原片预览</div>}
                <p><strong>拍摄原片</strong>扫码取图时会和 AI 成片一起保存到手机</p>
            </div>
            <button className="primary result-next" disabled={!session.pickupUrl || busy} onClick={onPickup}>{busy ? '正在准备…' : '下一步：手机取图 · 打印 →'}</button>
        </div>
    </section>;
}

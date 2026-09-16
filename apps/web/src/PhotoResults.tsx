import type { Session } from '../../../packages/shared/types';

export function PhotoResults({ session, photo, selected, busy, onSelect, onCheckout }: {
    session: Session; photo: string; selected: string[]; busy: boolean;
    onSelect: (id: string) => void; onCheckout: () => void;
}) {
    const original = session.originalUrl || photo;
    return <section className="results portrait-results">
        <div className="results-heading"><div><h1>照片已生成</h1></div><span className="result-theme">{session.styleName}</span></div>
        <div className="portrait-comparison">
            <article className="original-print"><div className="print-heading"><span>01 / 原照片</span><span className="free-label">免费</span></div>
                {original ? <img src={original} alt="免费原照片" /> : <div className="original-missing">此历史会话暂无原图预览</div>}
                <div className="print-caption">{original && <a className="original-download" href={original} download="snap-original.jpg">免费保存原图 ↓</a>}</div>
            </article>
            <div className="generated-portraits">{session.images.map((img, i) => <button key={img.id} className={`photo-print generated-print ${selected.includes(img.id) ? 'selected' : ''}`} aria-pressed={selected.includes(img.id)} aria-label={`选择生成照片 ${i + 1}`} onClick={() => onSelect(img.id)}>
                <div className="print-heading"><span>02 / {session.mode === 'demo' ? '风格演示' : 'AI 生成'}</span><span className="generated-label">{selected.includes(img.id) ? '✓ 已选' : '选择这张'}</span></div>
                <img src={img.previewUrl} alt={`带水印生成预览图 ${i + 1}`} />
                <div className="print-caption"><small>高清无水印</small></div>
            </button>)}</div>
        </div>
        {session.status === 'partial' && <p className="error">部分生成成功，仅展示可用图片。</p>}
        <div className="checkout-bar"><button className="primary" disabled={!selected.length || busy} onClick={onCheckout}>{busy ? '正在准备…' : `模拟购买 ${selected.length} 张 · ${selected.length ? '¥9.90' : '请选择'}`}</button></div>
    </section>;
}

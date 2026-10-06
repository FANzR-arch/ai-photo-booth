import { useEffect, useRef, useState } from 'react';
import type { Purpose } from '../../../packages/shared/portrait-experience';
import { photoCategories, categoryStyles, photoPurposeFor, type PhotoCategory } from '../../../packages/shared/photo-categories';
import type { Style } from '../../../packages/shared/types';
import { StyleImage } from './StyleImage';

const bundled: Record<string, string> = {
    anime: '/examples/anime-reference.png',
};
const roles = ['青年女性', '成年男性', '银发女性', '儿童'];
/** Native vertical scrolling; a tap opens a large preview, and only "就拍这个" starts a session and the camera. */
export function ThemePicker({ styles, loading, busy, error, onBack, onChoose }: {
    styles: Style[]; loading: boolean; busy: boolean; error: string;
    onBack: () => void; onChoose: (style: Style, purpose?: Purpose) => void;
}) {
    const [selectedCategory, setCategory] = useState<PhotoCategory>('portrait');
    const groups = photoCategories.map(category => ({ ...category, items: categoryStyles(styles, category.id) }));
    const available = groups.filter(category => category.items.length > 0);
    const category = available.find(group => group.id === selectedCategory) ?? available[0] ?? groups[0];
    const visibleStyles = category.items;
    const [frame, setFrame] = useState(0);
    const [preview, setPreview] = useState<Style>();
    const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const [hidden, setHidden] = useState(document.hidden);
    const [touching, setTouching] = useState(false);
    const [focused, setFocused] = useState(false);
    const [failed, setFailed] = useState<string[]>([]);
    const gesture = useRef({ x: 0, y: 0, moved: false });
    useEffect(() => {
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(media?.matches ?? false);
        const visibility = () => setHidden(document.hidden);
        media?.addEventListener('change', update);
        document.addEventListener('visibilitychange', visibility);
        return () => { media?.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
    }, []);
    useEffect(() => {
        if (reduced || hidden || touching || focused || busy) return;
        const timer = setInterval(() => setFrame(value => (value + 1) % 4), 6500);
        return () => clearInterval(timer);
    }, [reduced, hidden, touching, focused, busy]);
    return <section className="theme-screen theme-library">
        <div className="theme-heading"><button className="secondary" onClick={onBack}>← 返回</button><h1>选择主题</h1></div>
        <nav className="purpose-tabs" aria-label="照片分类">{available.map(group => <button key={group.id} aria-label={group.name} aria-pressed={category.id === group.id} onClick={() => setCategory(group.id)}>{group.name}<span className="category-count" aria-hidden="true">{group.items.length}</span></button>)}</nav><p className="purpose-note">样片仅供风格参考</p>
        <div key={category.id} className="theme-scroll" role="region" aria-label="上下滑动选择主题" tabIndex={0}>
            <div className="theme-grid" onPointerDown={e => { gesture.current = { x: e.clientX, y: e.clientY, moved: false }; setTouching(true); }}
                onPointerMove={e => { if (Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 12) gesture.current.moved = true; }}
                onPointerUp={() => setTouching(false)} onPointerCancel={() => { gesture.current.moved = true; setTouching(false); }}
                onPointerLeave={() => setTouching(false)} onFocus={() => setFocused(true)}
                onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}>
                {visibleStyles.map(style => {
                    const variants = style.exampleUrls?.length === 2 && style.exampleUrls[0] === style.exampleUrl && !failed.includes(style.id) ? style.exampleUrls : undefined;
                    const sheet = bundled[style.id] === style.exampleUrl && !failed.includes(style.id);
                    return <button key={style.id} disabled={busy || loading} className="theme-card" aria-label={style.name}
                        onClick={e => { if (e.detail > 0 && gesture.current.moved) return; setPreview(style); }}>
                        <div className={`theme-art ${style.sourceCode ? 'scene-art' : ''}`}>
                            {variants ? variants.map((src, i) => <span key={src} aria-hidden={frame % 2 !== i} className={`theme-variant ${frame % 2 === i ? 'is-current' : ''}`}><img src={src} alt={`${style.name} · 封面 ${i + 1}`} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(old => old.includes(style.id) ? old : [...old, style.id])} /></span>) : sheet ? roles.map((role, i) => <span key={role} aria-hidden={frame !== i}
                                className={`theme-portrait portrait-${i} ${frame === i ? 'is-current' : ''}`}>
                                <img src={`/examples/${style.id}-cast${style.id === 'cartoon' ? '-v2' : ''}.png`} alt={`${style.name} · ${role}风格参考`} loading="lazy" decoding="async" draggable={false}
                                    onError={() => setFailed(old => old.includes(style.id) ? old : [...old, style.id])} />
                            </span>) : <StyleImage src={style.exampleUrl} alt={`${style.name}风格参考图`} />}
                            {variants && <span className="theme-dots" aria-hidden="true">{variants.map((src,i) => <i key={src} className={frame % 2 === i ? "current" : ""} />)}</span>}
                            {sheet && <span className="theme-dots" aria-hidden="true">{roles.map((role, i) => <i key={role} className={frame === i ? 'current' : ''} />)}</span>}
                        </div>
                        <div className="theme-caption"><h2>{style.name}</h2></div>
                    </button>;
                })}
            </div>
            {!visibleStyles.length && !error && <p role="status">{loading ? '正在加载主题…' : '暂无可用照片模板'}</p>}
        </div>
        {preview && <div className="kiosk-dialog theme-preview" role="dialog" aria-modal="true" aria-label={`${preview.name} 样片预览`} onClick={e => { if (e.target === e.currentTarget) setPreview(undefined); }}>
            <div className="theme-preview-card">
                <div className="theme-preview-images" data-count={previewImages(preview, failed).length} data-orientation={preview.sceneOrientation}>{previewImages(preview, failed).map(item => <figure key={item.src}>
                    <img src={item.src} alt={item.alt} decoding="async" draggable={false} />
                </figure>)}</div>
                <div className="theme-preview-copy">
                    <span className="theme-preview-category">{category.name}</span>
                    <h2>{preview.name}</h2>
                    {preview.description && <p>{preview.description}</p>}
                    <p className="theme-preview-note">样片仅供风格参考，成片会保留你本人的样貌。</p>
                    <button className="primary" disabled={busy || loading} onClick={() => { const chosen = preview; setPreview(undefined); onChoose(chosen, photoPurposeFor(chosen)); }}>就拍这个 →</button>
                    <button className="secondary" onClick={() => setPreview(undefined)}>再看看</button>
                </div>
            </div>
        </div>}
    </section>;
}

/** Same sources as the card: two cover variants, the bundled four-role sheet, or the single example. */
function previewImages(style: Style, failed: string[]): { src: string; alt: string }[] {
    if (style.exampleUrls?.length === 2 && style.exampleUrls[0] === style.exampleUrl && !failed.includes(style.id))
        return style.exampleUrls.map((src, i) => ({ src, alt: `${style.name} · 样片 ${i + 1}` }));
    if (bundled[style.id] === style.exampleUrl && !failed.includes(style.id))
        // The cast file is already a 2×2 sheet of the four roles.
        return [{ src: `/examples/${style.id}-cast${style.id === 'cartoon' ? '-v2' : ''}.png`, alt: `${style.name} · ${roles.join('、')}样片` }];
    return [{ src: style.exampleUrl, alt: `${style.name} 样片` }];
}

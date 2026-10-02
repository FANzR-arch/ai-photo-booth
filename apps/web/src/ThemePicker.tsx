import { useEffect, useRef, useState } from 'react';
import type { Purpose } from '../../../packages/shared/portrait-experience';
import { photoCategories, categoryStyles, photoPurposeFor, type PhotoCategory } from '../../../packages/shared/photo-categories';
import type { Style } from '../../../packages/shared/types';
import { StyleImage } from './StyleImage';

const bundled: Record<string, string> = {
    cinema: '/examples/cinema.svg', business: '/examples/business.svg', cartoon: '/examples/cartoon.svg',
    editorial: '/examples/editorial-reference.png', anime: '/examples/anime-reference.png',
    film: '/examples/film-reference.png', festival: '/examples/festival-reference.png',
};
const roles = ['青年女性', '成年男性', '银发女性', '儿童'];
/** Native vertical scrolling; a shared clock, no camera or session until a deliberate tap. */
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
    const [paused, setPaused] = useState(false);
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
        if (paused || reduced || hidden || touching || focused || busy) return;
        const timer = setInterval(() => setFrame(value => (value + 1) % 4), 6500);
        return () => clearInterval(timer);
    }, [paused, reduced, hidden, touching, focused, busy]);
    return <section className="theme-screen theme-library">
        <div className="theme-heading"><button className="secondary" onClick={onBack}>← 返回</button><h1>选择主题</h1>
            <button className="secondary theme-motion" aria-pressed={paused || reduced} disabled={reduced}
                onClick={() => setPaused(value => !value)}>{reduced ? '静态预览' : paused ? '继续轮播' : '暂停轮播'}</button>
        </div>
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
                        onClick={e => { if (e.detail > 0 && gesture.current.moved) return; onChoose(style, photoPurposeFor(style)); }}>
                        <div className={`theme-art ${style.sourceCode ? 'scene-art' : ''}`}>
                            {variants ? variants.map((src, i) => <span key={src} aria-hidden={frame % 2 !== i} className={`theme-variant ${frame % 2 === i ? 'is-current' : ''}`}><img src={src} alt={`${style.name} · 封面 ${i + 1}`} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(old => old.includes(style.id) ? old : [...old, style.id])} /></span>) : sheet ? roles.map((role, i) => <span key={role} aria-hidden={frame !== i}
                                className={`theme-portrait portrait-${i} ${frame === i ? 'is-current' : ''}`}>
                                <img src={`/examples/${style.id}-cast${style.id === 'cartoon' ? '-v2' : ''}.png`} alt={`${style.name} · ${role}风格参考`} loading="lazy" decoding="async" draggable={false}
                                    onError={() => setFailed(old => old.includes(style.id) ? old : [...old, style.id])} />
                            </span>) : <StyleImage src={style.exampleUrl} alt={`${style.name}风格参考图`} />}
                            {variants && <span className="theme-dots" aria-hidden="true">{variants.map((src,i) => <i key={src} className={frame % 2 === i ? "current" : ""} />)}</span>}
                            {sheet && <span className="theme-dots" aria-hidden="true">{roles.map((role, i) => <i key={role} className={frame === i ? 'current' : ''} />)}</span>}
                        </div>
                        <div className="theme-caption"><h2>{style.name}</h2><span aria-hidden="true">↗</span></div>
                    </button>;
                })}
            </div>
            {!visibleStyles.length && !error && <p role="status">{loading ? '正在加载主题…' : '暂无可用照片模板'}</p>}
        </div>
    </section>;
}

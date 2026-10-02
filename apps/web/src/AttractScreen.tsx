import { useEffect, useState } from 'react';
import { photoCategories } from '../../../packages/shared/photo-categories';
import type { Style } from '../../../packages/shared/types';
import { StyleImage } from './StyleImage';

/** Rotate enabled covers without starting a visitor session. */
export function AttractScreen({ styles, onStart }: { styles: Style[]; onStart: () => void }) {
    const order: readonly string[] = photoCategories[0].styles;
    styles = [...styles].sort((a,b) => { const rank = (id: string) => order.includes(id) ? order.indexOf(id) : order.length; return rank(a.id) - rank(b.id); });
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const [hidden, setHidden] = useState(document.hidden);
    const count = styles.length;
    const current = count ? active % count : 0;
    useEffect(() => {
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const motion = () => setReduced(media?.matches ?? false);
        const visibility = () => setHidden(document.hidden);
        media?.addEventListener('change', motion);
        document.addEventListener('visibilitychange', visibility);
        return () => { media?.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
    }, []);
    useEffect(() => {
        if (paused || reduced || hidden || count < 2) return;
        const timer = setInterval(() => setActive(value => (value + 1) % count), 6000);
        return () => clearInterval(timer);
    }, [paused, reduced, hidden, count]);
    const move = (offset: number) => setActive(value => (value + offset + count) % count);
    return <section className="attract-screen" aria-label="拍照机待机页">
        <div className="attract-copy"><h1><span className="attract-title-line">今天，</span><span className="attract-title-line">留张<em>好照片。</em></span></h1><button className="primary start-button" onClick={onStart}>开始拍照 <span aria-hidden="true">→</span></button></div>
        <div className="attract-gallery" aria-label="风格示意图轮播">
            {styles.map((style, i) => <div key={style.id} className={'attract-slide ' + (current === i ? 'is-active' : '')} aria-hidden={current !== i}>
                {(current === i || i === (current + 1) % count) && <StyleImage src={style.exampleUrl} alt={style.name + '风格示意图'} />}
            </div>)}
            {!count && <div className="carousel-empty" role="status">暂无风格预览</div>}
            {count > 1 && <div className="carousel-controls">
                <button onClick={() => move(-1)} aria-label="上一张风格">‹</button>
                <span className="carousel-count" aria-live="off">{current + 1} / {count}</span>
                <button onClick={() => move(1)} aria-label="下一张风格">›</button>
                <button disabled={reduced} onClick={() => setPaused(value => !value)} aria-label={reduced ? '已减少动态效果' : paused ? '继续轮播' : '暂停轮播'}>{paused || reduced ? '▶' : 'Ⅱ'}</button>
            </div>}
            {!!count && <small className="reference-label">{styles[current].name} · 风格示意</small>}
        </div>
    </section>;
}

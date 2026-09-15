import { useEffect, useState } from 'react';
import { StyleImage } from './StyleImage';

const slides = ['/examples/editorial-reference.png', '/examples/cartoon.svg', '/examples/film-reference.png'];

/** Idle kiosk billboard; no camera or visitor session starts until the user taps Start. */
export function AttractScreen({ onStart }: { onStart: () => void }) {
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    useEffect(() => {
        if (paused) return;
        const timer = setInterval(() => setActive(value => (value + 1) % slides.length), 6000);
        return () => clearInterval(timer);
    }, [paused]);
    return <section className="attract-screen" aria-label="拍照机待机页">
        <div className="attract-copy"><h1>今天，<br />换个<em>样子。</em></h1><button className="primary start-button" onClick={onStart}>开始拍照 <span aria-hidden="true">→</span></button><p>先看效果，再决定 · ¥9.90 / 张</p></div>
        <div className="attract-gallery" aria-label="风格示意图轮播">
            {slides.map((src, i) => <div key={src} className={`attract-slide ${active === i ? 'is-active' : ''}`} aria-hidden={active !== i}><StyleImage src={src} alt={['时尚人像示意图', '3D 卡通示意图', '复古胶片示意图'][i]} /></div>)}
            <div className="carousel-controls">{slides.map((_, i) => <button key={i} className={active === i ? 'current' : ''} onClick={() => setActive(i)} aria-label={`查看第 ${i + 1} 张示意图`} aria-pressed={active === i}><span /></button>)}<button onClick={() => setPaused(!paused)} aria-label={paused ? '继续轮播' : '暂停轮播'}>{paused ? '▶' : 'Ⅱ'}</button></div>
            <small className="reference-label">AI 风格示意</small>
        </div>
    </section>;
}

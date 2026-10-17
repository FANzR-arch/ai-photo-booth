import { categoryStyles } from '../../../packages/shared/photo-categories';
import type { Style } from '../../../packages/shared/types';

const steps = ['选主题', '拍一张', 'AI 生成', '取照片'];
// Interleave subjects so every screenful mixes adults, couples, kids and art styles.
const wallOrder = ['portrait', 'together', 'kids-adventure', 'professional', 'wedding', 'lifestyle', 'kids-career', 'celebration', 'creative', 'other'] as const;
const columns = 3, perColumn = 8;

/** Pick covers round-robin across categories; two-variant styles alternate their second cover for more faces. */
export function wallPhotos(styles: Style[]): { src: string; name: string }[] {
    const groups = wallOrder.map(id => categoryStyles(styles, id).filter(style => style.id !== 'anime'));
    const picked: { src: string; name: string }[] = [];
    for (let round = 0; picked.length < columns * perColumn && groups.some(group => group.length > round); round++)
        for (const group of groups) {
            const style = group[round];
            if (!style || picked.length >= columns * perColumn) continue;
            const src = style.exampleUrls?.length === 2 && round % 2 ? style.exampleUrls[1] : style.exampleUrl;
            picked.push({ src, name: style.name });
        }
    return picked;
}

/** Idle screen: one action on the left, a slowly drifting wall of sample photos on the right. Never starts a session by itself.
 *  `note` sits under the start button: the price once set, and that the wait comes with mini-games.
 *  `unavailable` blocks the start before staff collect payment for a booth that cannot generate. */
export function AttractScreen({ styles, unavailable = false, note = '', onStart }: { styles: Style[]; unavailable?: boolean; note?: string; onStart: () => void }) {
    const photos = wallPhotos(styles);
    const lanes = Array.from({ length: columns }, (_, c) => photos.filter((_, i) => i % columns === c));
    return <section className="attract-screen" aria-label="拍照机待机页">
        <div className="attract-copy"><h1><span className="attract-title-line">今天，</span><span className="attract-title-line">留张<em>好照片。</em></span></h1><ol className="attract-steps" aria-label="体验流程">{steps.map((text, i) => <li key={text}><b>{i + 1}</b><span>{text}</span></li>)}</ol>
            {unavailable ? <div className="service-paused" role="status"><strong>暂停服务</strong><p>设备正在准备，请联系工作人员。</p></div> : <><button className="primary start-button" onClick={onStart}>开始拍照 <span aria-hidden="true">→</span></button>{note && <p className="attract-note">{note}</p>}</>}</div>
        <div className="attract-wall" aria-hidden="true" onClick={unavailable ? undefined : onStart}>
            {lanes.map((lane, c) => !!lane.length && <div key={c} className={`wall-lane wall-lane-${c}`}>
                {/* Two copies make the loop seamless: the lane scrolls exactly one copy's height. */}
                <div className="wall-track">{[...lane, ...lane].map((photo, i) => <figure key={i} className="wall-card">
                    <img src={photo.src} alt="" decoding="async" draggable={false} />
                    <figcaption>{photo.name}</figcaption>
                </figure>)}</div>
            </div>)}
            {!photos.length && <div className="carousel-empty">暂无风格预览</div>}
        </div>
    </section>;
}

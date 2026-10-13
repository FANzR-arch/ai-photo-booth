import { PhotoFrame } from '../PhotoFrame';
import type { Caption, FrameId } from '../../../../packages/shared/frames';
import type { PhotoOrientation } from '../../../../packages/shared/photo-orientation';

export type RevealStep = 'flip' | 'develop' | 'compare';

/** D3 + D2: the original turns over into a polaroid that develops, then sits beside the original for a moment. */
export function Reveal({ step, original, result, frame, caption, orientation, theme, onTap }: {
    step: RevealStep; original: string; result: string; frame: FrameId; caption: Caption; orientation?: PhotoOrientation; theme?: string; onTap: () => void;
}) {
    const date = new Date();
    return <div className="wait-reveal" data-step={step} data-original={original ? 'yes' : 'no'} onPointerDown={onTap} role="status" aria-label="照片画好了">
        <p className="reveal-title">照片画好了！</p>
        <div className="reveal-row">
            {original && step === 'compare' && <figure className="reveal-original"><img src={original} alt="原照片" draggable={false} /><figcaption>原照片</figcaption></figure>}
            <div className="reveal-card">
                {original && <div className="reveal-face reveal-front"><img src={original} alt="" draggable={false} /></div>}
                <div className="reveal-face reveal-back"><div className="reveal-polaroid">
                    <PhotoFrame src={result} alt="生成照片" frame={frame} caption={caption} orientation={orientation} />
                    <span>{theme} · {date.getMonth() + 1}.{date.getDate()}</span>
                </div></div>
            </div>
        </div>
        <p className="reveal-hint">{step === 'develop' ? '正在显影…点一下马上看' : ' '}</p>
    </div>;
}

import type { ReactNode } from 'react';
import { PhotoFrame } from './PhotoFrame';
import type { Caption, FrameId } from '../../../packages/shared/frames';
import type { PhotoOrientation } from '../../../packages/shared/photo-orientation';

/** The visitor's original photo while AI works on it: a brush sweep, the current stage and the time waited so far (never a countdown). */
export function GenerationPreview({ photo, active, demo, theme, frame = 'none', caption, orientation, seconds, stage, notice, overlay }: {
    photo: string; active: boolean; demo: boolean; theme?: string; frame?: FrameId; caption?: Caption; orientation?: PhotoOrientation;
    seconds: number; stage?: string; notice?: string; overlay?: ReactNode;
}) {
    return <div className={`generation-preview ${active ? 'is-rendering' : ''}`}>
        <div className="generation-photo">
            {photo ? <PhotoFrame src={photo} alt="重绘前的原照片" frame={frame} caption={caption} orientation={orientation} crop /> : <div className="generation-placeholder"><span>✳</span><p>已恢复生成任务</p></div>}
            {active && <div className="generation-sweep" aria-hidden="true" />}
            {photo && overlay}
            {photo && !overlay && <span className="generation-original">原照片</span>}
            <div className="generation-badge" role="status"><span className="generation-spark" aria-hidden="true">✳</span>
                {active ? (demo ? '效果制作中' : '重绘中') : '暂未完成'}
                {active && <span className="generation-dots" aria-hidden="true"><i /><i /><i /></span>}
            </div>
        </div>
        <div className="generation-caption"><span>{theme || '你的专属照片'}{active && stage ? <b className="generation-stage"> · {stage}</b> : null}</span>
            {active && <span className="generation-elapsed">已等待 {seconds} 秒</span>}
        </div>
        {active && notice && <p className="generation-note" role="status">{notice}</p>}
    </div>;
}

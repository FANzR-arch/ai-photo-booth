import { useEffect, useState } from 'react';
import { PhotoFrame } from './PhotoFrame';
import type { FrameId, Caption } from '../../../packages/shared/frames';
import type { PhotoOrientation } from '../../../packages/shared/photo-orientation';

/** Keep the captured original visible; animation indicates activity, not progress. */
export function GenerationPreview({ photo, active, demo, theme, frame = 'none', caption, orientation }: {
    photo: string; active: boolean; demo: boolean; theme?: string; frame?: FrameId; caption?: Caption; orientation?: PhotoOrientation;
}) {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        setSeconds(0);
        if (!active) return;
        const started = Date.now();
        const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [active]);
    return <div className={`generation-preview ${active ? 'is-rendering' : ''}`}>
        <div className="generation-photo">
            {photo ? <PhotoFrame src={photo} alt="重绘前的原照片" frame={frame} caption={caption} orientation={orientation} crop /> : <div className="generation-placeholder"><span>✳</span><p>已恢复生成任务</p></div>}
            {active && <div className="generation-sweep" aria-hidden="true" />}
            {photo && <span className="generation-original">原照片</span>}
            <div className="generation-badge" role="status"><span className="generation-spark" aria-hidden="true">✳</span>
                {active ? (demo ? '效果制作中' : '重绘中') : '暂未完成'}
                {active && <span className="generation-dots" aria-hidden="true"><i /><i /><i /></span>}
            </div>
        </div>
        <div className="generation-caption"><span>{theme || '你的专属照片'}</span>
            {active && <span className="generation-elapsed">已等待 {seconds} 秒</span>}
        </div>
        {active && seconds >= 40 && <p className="generation-note" role="status">仍在处理中…</p>}
    </div>;
}

import type { DistanceHint } from '../../../packages/shared/portrait-settings';

/** One continuous head-and-shoulders line: crown at y≈40, chin at y≈134, shoulders running off the bottom edge. */
const BUST = 'M86 300 C88 238 106 206 142 194 C164 187 180 180 182 160 C183 152 183 144 182 136 C171 127 164 108 164 86 C164 58 180 40 200 40 C220 40 236 58 236 86 C236 108 229 127 218 136 C217 144 217 152 218 160 C220 180 236 187 258 194 C294 206 312 238 314 300';

/** Head-to-waist bust on the 4:3 viewfinder: the frame dims softly outside it so visitors see where to stand; the line turns green when the distance check says it is right. */
export function PoseGuide({ distance }: { distance: DistanceHint }) {
    return <svg className={`pose-guide distance-${distance}`} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
            <filter id="pose-guide-feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
            <mask id="pose-guide-cutout">
                <rect width="400" height="300" fill="#fff" />
                <path d={`${BUST} L314 340 L86 340 Z`} fill="#000" filter="url(#pose-guide-feather)" />
            </mask>
        </defs>
        <rect className="pose-guide-shade" width="400" height="300" mask="url(#pose-guide-cutout)" />
        <path className="pose-guide-line" d={BUST} />
    </svg>;
}

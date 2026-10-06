import type { DistanceHint } from '../../../packages/shared/portrait-settings';

/** Head-to-waist outline on the 4:3 viewfinder: where to stand, turning green when the distance check says it is right. */
export function PoseGuide({ distance }: { distance: DistanceHint }) {
    return <svg className={`pose-guide distance-${distance}`} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <ellipse cx="200" cy="86" rx="36" ry="46" />
        <path d="M188 130 L188 150 Q186 172 168 178 C118 190 96 230 92 300 M212 130 L212 150 Q214 172 232 178 C282 190 304 230 308 300" />
    </svg>;
}

/** Back-office portrait processing: beautification strength and automatic reference framing. */
export const beautyLevels = [
    { id: 'off', name: '关闭', note: '只轻修暂时性瑕疵，完整保留皮肤状态。' },
    { id: 'light', name: '轻度', note: '均匀肤色、淡化痘印与暗沉，保留毛孔质感；不改变脸型与五官。' },
    { id: 'medium', name: '中度', note: '肤色通透、去除痘印细纹、轻微提亮眼神与唇色；仍保留本人脸型、五官位置与年龄感。' },
] as const;
export type BeautyLevel = typeof beautyLevels[number]['id'];
export const isBeautyLevel = (value: unknown): value is BeautyLevel => beautyLevels.some(level => level.id === value);
export interface PortraitSettings {
    beauty: BeautyLevel;
    /** Re-crop or pad the uploaded photo so the face occupies a natural share of the frame before generation. */
    reframe: boolean;
}
export const defaultPortraitSettings: PortraitSettings = { beauty: 'light', reframe: true };

/** Viewfinder feedback from the local face check; 'unknown' means no answer yet or detection unavailable. */
export type DistanceHint = 'unknown' | 'none' | 'closer' | 'ok' | 'farther';
export const distanceHintText: Record<DistanceHint, string> = {
    unknown: '离摄像头约一米，让头顶到腰部都在画面里',
    none: '请站到画面中央，露出整张脸',
    closer: '离得有点远，请靠近一点',
    farther: '离得太近了，请退后到约一米',
    ok: '距离正好，保持这个位置',
};

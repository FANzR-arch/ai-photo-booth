import type { Style } from './types';
import type { Purpose } from './portrait-experience';

/** Gallery navigation by subject; legacy session purposes still control capture guidance and frames. */
export const photoCategories = [
    { id: 'portrait', name: '人像写真', note: '自然柔光、黑白肖像、电影与杂志风格', purpose: 'self', styles: [
        'self-01', 'self-08', 'self-03', 'warm-low-key', 'self-02', 'self-09', 'editorial', 'cinema',
        'self-04', 'self-05', 'self-06', 'self-07', 'self-10',
    ] },
    { id: 'professional', name: '职业形象', note: '商务形象与医生肖像', purpose: 'self', styles: [
        'business', 'doctor-classic', 'doctor-relaxed', 'doctor-folder', 'doctor-minimal',
    ] },
    { id: 'celebration', name: '生日纪念', note: '生日、成人礼、毕业与节日纪念', purpose: 'memory', styles: [
        'coming-of-age', 'birthday-home', 'birthday-gold', 'memory-07', 'memory-08', 'festival',
    ] },
    { id: 'wedding', name: '婚礼写真', note: '婚纱、西装与复古婚礼布景', purpose: 'memory', styles: [
        'wedding-bride', 'wedding-groom', 'wedding-flash', 'wedding-heart-couple',
    ] },
    { id: 'together', name: '亲友合照', note: '情侣、好友与家人一起入镜', purpose: 'together', styles: [
        'together-01', 'together-02', 'together-03', 'together-04', 'together-05',
        'together-06', 'together-07', 'together-08', 'together-09', 'together-10',
        'film-street-couple', 'film-surf-couple', 'mirror-couple',
    ] },
    { id: 'lifestyle', name: '旅行日常', note: '海岛、街头、书店与四季生活', purpose: 'memory', styles: [
        'island-coconut', 'island-surprise', 'memory-04', 'memory-03', 'memory-01', 'memory-02',
        'memory-05', 'memory-06', 'memory-09', 'memory-10', 'film', 'city',
    ] },
    { id: 'creative', name: '创意艺术', note: '动画、绘画与手作材质的人像演绎', purpose: 'creative', styles: [
        'cartoon', 'anime', 'pixel', 'lowpoly', 'watercolor', 'oilpainting', 'charcoal', 'inkwash',
        'popart', 'risograph', 'cyanotype', 'papercut', 'clay', 'felt', 'stainedglass', 'mosaic',
    ] },
    // Custom styles remain discoverable without guessing their content from their names or IDs.
    { id: 'other', name: '其他模板', note: '新增与自定义主题', purpose: 'creative', styles: ['brand'] },
] as const;
export type PhotoCategory = typeof photoCategories[number]['id'];

export function photoCategoryFor(id: string): PhotoCategory {
    return photoCategories.find(category => (category.styles as readonly string[]).includes(id))?.id ?? 'other';
}

export function categoryStyles(styles: readonly Style[], id: PhotoCategory): Style[] {
    const order: readonly string[] = photoCategories.find(category => category.id === id)!.styles;
    const rank = (style: Style) => order.includes(style.id) ? order.indexOf(style.id) : order.length;
    return styles.filter(style => style.enabled && photoCategoryFor(style.id) === id).sort((a, b) => rank(a) - rank(b));
}

export function photoPurposeFor(style: Style): Purpose {
    if (style.subjectCount === 2) return 'together';
    return photoCategories.find(category => category.id === photoCategoryFor(style.id))!.purpose;
}

import type { Style } from '../../packages/shared/types.js';
import type { ClothingMode } from '../../packages/shared/clothing.js';
import { orientationLabel, orientationRatio, type PhotoOrientation } from '../../packages/shared/photo-orientation.js';
import { automaticStyling, automaticStylingDetailed } from '../../packages/shared/appearance-styling.js';
import type { BeautyLevel } from '../../packages/shared/portrait-settings.js';

/**
 * Seedream follows short, positive prompts best (official guidance: about 300 Chinese characters; long prompts lose details).
 * Every prompt therefore opens with the subject and body-proportion anchor, keeps the theme to one compact paragraph and
 * states what to draw rather than listing prohibitions. Image-to-image models copy the head scale of a close wide-angle
 * reference unless told up front to rebuild proportions.
 */
const bodyProportion = '真实头身比例：肩宽约为头宽的2到2.5倍，85mm人像镜头透视，不照搬原照的近距离透视。';

const beautyPrompt: Record<BeautyLevel, string> = {
    off: '',
    light: '轻度美颜：肤色均匀，淡化痘印与暗沉，保留毛孔质感，不改脸型与五官。',
    medium: '中度美颜：肤色均匀通透，去除痘印与细纹，轻微提亮眼神与唇色，不改脸型与五官。',
};

export interface PromptOptions { beauty?: BeautyLevel }

const naturalExpression = '表情放松自然，嘴唇轻合带微笑，眼睛保持本人的形状。';
const bodyIntegrity = '两条手臂两只手，五指清晰，关节方向自然。';

/** The image API accepts one prompt. Theme-specific rendering stays editable with each style. */
export function generationPrompt(style: Style, clothing: ClothingMode, orientation: PhotoOrientation, options: PromptOptions = {}) {
    const beauty = beautyPrompt[options.beauty ?? 'off'];
    if (style.generationPreset === 'directed-portrait') {
        return [`参考照片中的人物形象，保留本人的五官、脸型、年龄感与原有发长，一眼可辨。${bodyProportion}`, automaticStylingDetailed, style.prompt ?? '',
            '按上文复现动作与场景，不沿用原图姿势；服装按本人适配，不因模板名称套用不合适的男装、女装或婚礼角色。',
            clothing === 'keep'
                ? '用户选择：保留原服装，覆盖上文的换装描述，保留原衣服款式、图案与主色，随新动作自然变形；仍执行场景道具、动作与指定文字。'
                : `用户选择：按主题换装。${style.outfitPrompt || '只采用上文适合本人的那一种服装与配饰方案；不要将男女两套衣物混合到同一个人。'}服装合体，保持本人的身体比例。`,
            naturalExpression, beauty, bodyIntegrity,
            `只输出一张${orientationLabel(orientation)}照片，严格${orientationRatio(orientation)}，不拼图；仅出现主题指定的文字、道具和配饰。`,
        ].filter(Boolean).join('\n');
    }
    // This opt-in preset carries the user's complete poster art direction, including pose, clothing and lettering.
    if (style.generationPreset === 'coming-of-age') {
        return [`参考照片是唯一人物身份依据，保留本人的五官、脸型、年龄感、眼镜与原有发长。${bodyProportion}`, automaticStylingDetailed, style.prompt ?? '',
            naturalExpression, beauty, bodyIntegrity,
            '深蓝针织的剪裁按本人适配，不把长发改短或短发改长。18岁是海报主题文字，不据此改变参考人物的真实年龄感。只生成一张完整的竖版2:3海报，仅生成上述指定文字。',
        ].filter(Boolean).join('\n');
    }
    const ratio = orientation === 'portrait' ? '3:4' : '4:3';
    const subject = `参考照片中的人物形象，按实际人数逐人保留本人的五官、脸型、发型、年龄感、肤色与眼镜，一眼可辨，不换脸、不改变体型、不增减人物。${bodyProportion}`;
    const clothingRule = clothing === 'keep'
        ? '用户选择：保留原服装，保留原照衣服的款式、图案与配色，随新姿势自然变形；黑白或艺术媒介主题可统一转换色彩与材质表现。'
        : `用户选择：按主题换装。${style.outfitPrompt?.trim() || `搭配符合“${style.name}”主题的简洁日常服装。`}服装合体，逐人适配，不改变身体比例。`;
    return [
        subject,
        automaticStyling,
        style.prompt ?? '',
        clothingRule,
        naturalExpression,
        beauty,
        bodyIntegrity,
        `只输出一张${orientation === 'portrait' ? '竖版' : '横版'}照片，画面比例严格为${ratio}，腰部以上半身构图，头顶完整，人物居中，无文字、水印或边框。`,
    ].filter(Boolean).join('\n');
}

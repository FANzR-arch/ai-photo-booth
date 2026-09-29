import type { Style } from '../../packages/shared/types.js';
import type { ClothingMode } from '../../packages/shared/clothing.js';
import { orientationLabel, orientationRatio, type PhotoOrientation } from '../../packages/shared/photo-orientation.js';
import { automaticStyling } from '../../packages/shared/appearance-styling.js';

/** The image API accepts one prompt. Theme-specific rendering quality stays editable with each style. */
export function generationPrompt(style: Style, clothing: ClothingMode, orientation: PhotoOrientation) {
    if (style.generationPreset === 'directed-portrait') {
        return [automaticStyling, style.prompt ?? '', '【本次执行优先级】人脸身份、真实年龄与原有性别呈现优先于造型。按文字复现动作，不沿用原图姿势；保留原有发长。按本人自动适配服装，不因模板名称、模特或固定礼服描述套用不适合的男装、女装或婚礼角色。',
            clothing === 'keep'
                ? '用户选择保留原服装：覆盖上文的换装描述，保留原衣服款式、领口、袖长、图案与主色，仅随新动作改变褶皱、透视和光照。仍执行场景道具、动作与指定文字。'
                : `用户选择按主题换装：${style.outfitPrompt || '只采用上文适合本人的那一种服装与配饰方案；不要将男女两套衣物混合到同一个人。'}服装合体，保持本人的身体比例。`,
            `只输出一张${orientationLabel(orientation)}照片，严格${orientationRatio(orientation)}，不拼图；仅出现主题明确指定的文字、道具和配饰。`,
        ].join('\n');
    }
    // This opt-in preset carries the user's complete poster art direction, including pose, clothing and lettering.
    // Do not append the standard portrait rules: the poster defines its own clothing, framing and lettering.
    if (style.generationPreset === 'coming-of-age') {
        return [automaticStyling, style.prompt ?? '', '【身份执行补充】参考照片是唯一人物身份依据。保留原有眼镜与可辨识的痣、雀斑。深蓝针织的剪裁按本人适配，男女都保留原发长与自然发际线，不把长发改短或短发改长。18岁是海报主题文字，不据此改变参考人物的真实年龄感。只生成一张完整的竖版2:3海报，人物身份优先于造型和排版；仅生成上述指定文字。'].join('\n');
    }
    const identity = '以用户上传的照片作为唯一人物身份依据，人脸一致性是最高优先级。完整保留实际人数，逐人保留真实脸型、五官比例、眼睛形状、鼻形、唇形、眉形、发际线、肤色特点、性别特征、年龄感、眼镜和可辨识的痣或雀斑。姿势或表情变化后仍须一眼认出是同一个人；不换脸、不瘦脸、不放大眼睛、不抬高鼻梁、不改变下巴、不改变体型、不额外添加人物，不交换或融合多人面孔。发型可以自然整理，但保留发际线与基本辨识特征。写实主题保留自然皮肤纹理；艺术主题只改变表现媒介，不用统一模特脸或角色脸替换本人。';
    const priority = '优先级：人脸身份与实际人数 > 本次服装选择和输出比例 > 主题动作、构图与视觉风格。照片提供人物身份，不限定最终动作；主题中的衣着或横竖比例描述不得覆盖本次服装与画幅选择。';
    const pose = '按主题提示词中的具体动作复现姿势，可重新安排站姿或坐姿、身体转向、头部朝向、视线、手臂手势和自然表情，无需沿用原照片的姿态、嘴部开合或人物站位。主题未明确动作时，设计符合主题氛围的自然肖像姿势。可为新姿势补全合理的肩颈、手臂与手部，保持真实身体比例。合照可重新安排站位与自然互动，但每个人的身份和实际人数不变，每张脸清晰可辨。动作、表情与镜头角度不得以改变五官结构为代价；服装是否更换不限制动作设计。';
    const integrity = '细节服务于人物辨识，遵循主题媒介，不额外混入其他画风。眼镜框、发际线、耳部、衣领和人体连接连贯；手臂、手指和关节符合解剖与透视，不出现多余、缺失、融合或扭曲的肢体。头发、手部、衣物及人物间的前后遮挡与新姿势一致，双手和配饰不挡住关键五官。';
    const clothingRule = clothing === 'keep'
        ? '用户选择：保留原服装。逐人保留原照片衣服的款式、领口、袖长、层次、图案与主要配色，不添加或替换外套、礼服、制服、学位袍等衣物。衣服可以随新姿势自然变形，重新计算合理的褶皱、透视、光照与阴影，不锁定原照身体姿态。黑白、蓝晒或艺术材质主题可统一转换色彩表现及材质，但不得借此更换服装设计。'
        : `用户选择：按主题换装。按照以下搭配替换衣物，动作独立按主题设计，不受主题中旧的“保留原衣着”描述限制。\n搭配要求：${style.outfitPrompt?.trim() || `搭配符合“${style.name}”主题场景、季节与色调的简洁日常服装，衣料和层次自然，避免夸张舞台装。`}\n每个人的服装均须合体、符合其年龄与原有性别呈现；多人配色协调但不复制成同一套衣服，不交换人物身份，不改变身体比例。衣领、袖口、肩线与新姿势贴合，头发、手部与衣物的遮挡关系正确。不增加帽子、假发或遮脸配饰，不新增文字、商标或道具。衣物材质遵循主题的摄影或艺术表现方式。`;
    return [
        '【系统约束】', identity, priority, automaticStyling,
        '【主题视觉】', style.prompt ?? '',
        '【动作与表情】', pose,
        '【本次服装选择】', clothingRule,
        '【细节与结构】', integrity,
        '【输出要求】', `输出要求：${orientationLabel(orientation)}构图，画面比例严格为${orientation === 'portrait' ? '3:4' : '4:3'}。按主题动作重新安排取景范围，完整保留每个人的头顶与面部，合理呈现肩颈和动作需要入镜的手臂、手部；不受原照裁切范围限制。根据实际人数适配画幅，不拉伸人物、不裁掉合照边缘的人；留白适度，人物仍是视觉中心。动作与服装不得遮挡关键五官；不生成文字、水印、标志或边框。`,
    ].join('\n');
}

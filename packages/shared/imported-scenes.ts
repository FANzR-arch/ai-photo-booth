import type { PhotoOrientation } from './photo-orientation';
import { adaptWardrobeToAppearance } from './appearance-styling';

/** Zip source codes stay stable for test records, gallery grouping and fixed scene framing. */
export const importedScenes: { code: string; id: string; name: string; purpose: 'self' | 'memory' | 'together'; orientation: PhotoOrientation; people: 1 | 2; description: string; color: string }[] = [
 {code:'01',id:'coming-of-age',name:'你好，我的18岁',purpose:'memory',orientation:'poster',people:1,description:'冷灰棚拍 · 深蓝针织与银白艺术字',color:'#233148'},
 {code:'02A',id:'doctor-classic',name:'医生肖像 · 经典',purpose:'self',orientation:'portrait',people:1,description:'白大褂、领带与听诊器 · 自然微笑',color:'#c2ccce'},
 {code:'02B',id:'doctor-relaxed',name:'医生肖像 · 自然',purpose:'self',orientation:'portrait',people:1,description:'浅蓝衬衫 · 双手自然低放',color:'#d5e2eb'},
 {code:'02C',id:'doctor-folder',name:'医生肖像 · 工作时刻',purpose:'self',orientation:'portrait4x5',people:1,description:'短袖白衣、文件夹 · 4:5 职业照',color:'#b3c1d1'},
 {code:'02D',id:'doctor-minimal',name:'医生肖像 · 简约',purpose:'self',orientation:'portrait',people:1,description:'黑色内搭 · 干净的职业神态',color:'#a3a7ac'},
 {code:'03',id:'wedding-flash',name:'直闪婚照',purpose:'together',orientation:'landscape',people:2,description:'灰底直闪 · 戒指盒与花束',color:'#b7b4b2'},
 {code:'04',id:'film-street-couple',name:'胶片日记 · 街头',purpose:'together',orientation:'portrait',people:2,description:'复古冰淇淋车 · 动态拥抱',color:'#995e4b'},
 {code:'05',id:'film-surf-couple',name:'胶片日记 · 冲浪',purpose:'together',orientation:'portrait',people:2,description:'热带海岛 · 双人冲浪板合照',color:'#72a7b0'},
 {code:'06',id:'warm-low-key',name:'暖光暗调肖像',purpose:'self',orientation:'poster',people:1,description:'橄榄灰背景 · 黑衣与温暖侧光',color:'#55584b'},
 {code:'07',id:'birthday-home',name:'生日照 · 居家',purpose:'memory',orientation:'poster',people:1,description:'奶油沙发与窗光 · 粉色花体字',color:'#d9b9bc'},
 {code:'08',id:'birthday-gold',name:'生日照 · 金色派对',purpose:'memory',orientation:'poster',people:1,description:'香槟造型与亮片帘 · 暖金光影',color:'#b39764'},
 {code:'09A',id:'wedding-bride',name:'朱红婚照 · 俏皮',purpose:'memory',orientation:'landscape3x2',people:1,description:'俏皮叉腰 · 画外递来的玫瑰',color:'#a33b2c'},
 {code:'09B',id:'wedding-groom',name:'朱红婚照 · 回应',purpose:'memory',orientation:'landscape3x2',people:1,description:'温暖微笑 · 回应画外花束',color:'#883b31'},
 {code:'09C',id:'wedding-heart-couple',name:'朱红婚照 · 合影',purpose:'together',orientation:'portrait',people:2,description:'并肩微笑 · 脸侧爱心手势',color:'#a54438'},
 {code:'10A',id:'island-coconut',name:'海岛写真 · 椰子',purpose:'self',orientation:'landscape3x2',people:1,description:'捧椰子指向镜头 · 热带日光',color:'#c9ad72'},
 {code:'10B',id:'island-surprise',name:'海岛写真 · 惊喜',purpose:'self',orientation:'landscape3x2',people:1,description:'指向自己的惊讶表情 · 海边小店',color:'#90b6b4'},
 {code:'10C',id:'mirror-couple',name:'幕后镜面合影',purpose:'together',orientation:'portrait',people:2,description:'白衣、黑帽与粉色手机 · 轻松自拍',color:'#c3bfb6'},
];

export const textureDirection = '【成像质感】以清晰原片的真实摄影细节为准：眼睛与眼镜边缘对焦准确，保留鼻翼、面颊的自然细纹、细小毛孔和原有痣、胡须，不把毛孔夸张成砂砾。皮肤、针织、棉布、金属和背景分别呈现各自真实纹理，不用一层噪点代替所有材质。高光渐变柔和不溢出，暗部保留层次；胶片颗粒只在明确要求的场景中轻微出现，柔光光晕仅作用于高光和背景，不模糊人脸。避免强磨皮、蜡像光泽、HDR和锐化白边。人物动作、头部朝向和视线按场景重建，不锁定原照片姿势；身份特征与年龄感始终优先。';

/** Only one uploaded image is available. Preserve the user's original files separately. */
export function adaptScenePrompt(source: string, people: 1 | 2, code?: string) {
 const paragraphs = source.trim().split(/\r?\n\s*\r?\n/);
 paragraphs[0] = people === 1
  ? '仅使用上传照片中的这一个人作为唯一身份参考，没有第二张风格图片。保持真人的脸型、五官相对位置、眼睛形状、鼻形、唇形、眉形、肤色、发际线、原有发长、年龄感、性别特征、眼镜及可辨识的痣与胡须；不美化成另一个人，不因生日或成人礼主题强行改变年龄。服装、动作、环境与文字设计只按下文描述执行。'
  : '上传照片须包含两位本人，原照片左侧人物为A、右侧人物为B。只有这一张身份参考，没有额外风格图片。保持各自脸型、五官比例、肤色、发际线、眼镜及年龄感；不混脸、不交换身份、不创造或复制伴侣。A、B的站位、服装角色与互动按下文执行；发型保留真人基本长度。';
 const adapted = paragraphs.join('\n\n')
  .replaceAll('造型参考是干净中分、发丝贴顺、两侧头发收在耳后并在后方扎起的发型，搭配很小的精致耳饰；套用真人时以原发长为先。', '保留本人发长、原有分缝方向和发际线，只整理凌乱发丝。短发保持短发，不添加耳后长发或发髻；只有本人原为长发时可收在耳后。')
  .replaceAll('造型参考是带轻薄刘海的自然深色长发，一侧头发垂在胸前，另一侧收在耳后；套用真人时保留原本的发长和辨识度。', '保留本人发长和原有轮廓，头发整理自然柔顺。短发保持短发；只有本人原为长发时才允许一侧垂在胸前、另一侧收在耳后。')
  .replaceAll('原样片造型是黑色长发、近中分、蓬松大波浪，头顶和额前保留几根不完全服帖的细发。大面积黑发沿两侧肩膀落下，形成包围脸部的深色轮廓。套用真人时保留其发长与发际线，只借用自然蓬松感。', '发型只整理原照已有头发：保持原来的发际线、分缝方向、发长和耳侧轮廓，头顶带自然蓬松度及几根细发。短发人物绝不生成肩部长发、发髻或额外发束。')
  .replaceAll('发型参考带轻薄刘海的蓬松长卷发，发色自然棕色。', '保留本人原有发长、分缝、刘海轮廓和发色，只整理得蓬松自然；短发人物不加长、不变成长卷发。')
  .replaceAll('造型参考为自然棕色松散盘发，额前与两侧有几缕弯曲碎发，头顶有细巧银色蝴蝶结或丝带形发饰。', '保留原发长、发色与发际线；短发只整理原有短发，不生成盘发或后脑发髻。只有本人原为足够长的头发时才整理成松散盘发。头侧可佩戴细巧银色丝带发饰，不遮挡面孔。')
  .replaceAll('头发整齐收成低盘发，额前保留一小缕弯曲碎发，', '发型保留原有长度与发际线；短发整理自然，只有原本长发才收成低盘发，')
  .replaceAll('发型参考蓬松棕色长卷发，在画面左侧鬓边别一朵橙黄色大花。', '保留本人原发色、发长与分缝，只整理得蓬松；短发不变长、不增加卷发长度。在画面左侧鬓边别一朵橙黄色大花。')
  .replaceAll('头发有自然方向与细小灰白发丝', '头发保留原色与自然方向，不凭空增加灰白发丝')
  .replaceAll('与上一张朱红背景、光线、色调一致', '采用朱红无缝背景、柔和正面光与温暖复古色调')
  .replaceAll('保持与椰子写真相同的布景位置和色调', '使用下述热带小店布景与温暖海岛色调')
  .replaceAll('背景构图与上一张对应，但主体动作不同', '背景采用上述布景，主体执行本段指定动作')
  .replace(/必须去掉中央原品牌，即使它仍留在裁切参考图里，也不要生成该标识。/g, '画面不生成品牌标识。')
  .replaceAll('原小图细节有限，', '')
  + '\n\n' + textureDirection;
 return adaptWardrobeToAppearance(adapted, code);
}

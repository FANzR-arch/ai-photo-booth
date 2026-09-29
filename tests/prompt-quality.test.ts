import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generationPrompt } from '../apps/server/generation-prompt';
import { isRealistic } from '../packages/shared/portrait-experience';
import type { Style } from '../packages/shared/types';

const styles: Style[] = JSON.parse(readFileSync('config/styles/styles.json', 'utf8'));

test('standard themes respect orientation and allow new poses while prioritizing face identity in both clothing modes', () => {
    for (const style of styles) {
        if (style.generationPreset) continue;
        assert.doesNotMatch(style.prompt!, /3:4|4:3|胸部以上|手在画外|半身竖幅/, style.id);
        for (const orientation of ['portrait', 'landscape'] as const) {
            for (const clothing of ['keep', 'theme'] as const) {
                const prompt = generationPrompt(style, clothing, orientation);
                assert.deepEqual([...new Set(prompt.match(/[34]:[34]/g))], [orientation === 'portrait' ? '3:4' : '4:3'], style.id);
                assert.match(prompt, /不拉伸人物、不裁掉合照边缘的人/);
                assert.match(prompt, /人脸一致性是最高优先级/);
                assert.match(prompt, /眼睛形状、鼻形、唇形、眉形、发际线/);
                assert.match(prompt, /可重新安排站姿或坐姿、身体转向、头部朝向、视线、手臂手势和自然表情/);
                assert.match(prompt, /不受原照裁切范围限制/);
                assert.match(prompt, /服装是否更换不限制动作设计/);
                assert.match(prompt, /不出现多余、缺失、融合或扭曲的肢体/);
                assert.doesNotMatch(prompt, /保留原照表情|沿用原照表情|表情沿用原照|保留原照姿势|不改变人物坐姿|以原照片姿态|不重建坐姿|原有姿态|不改变体型或姿态|不增加书本或手势|沿用原照睁闭眼状态|未入镜的手不凭空补画|不新增手势或肢体/);
                assert.ok(prompt.includes(style.prompt!));
            }
        }
    }
});

test('photography gets focus and exposure guidance while artistic themes keep their own rendering medium', () => {
    for (const style of styles) {
        if (style.generationPreset) continue;
        if (isRealistic(style.id)) {
            assert.match(style.prompt!, /合照景深覆盖每个人的面部/);
            assert.match(style.prompt!, /高光保留层次，暗部仍有细节/);
            assert.match(style.prompt!, /黑白主题保持丰富灰阶/);
        } else {
            assert.doesNotMatch(style.prompt!, /皮肤保留细微纹理、真实毛孔尺度/);
        }
    }
    const prompt = (id: string) => generationPrompt(styles.find(s => s.id === id)!, 'keep', 'portrait');
    assert.match(prompt('pixel'), /统一像素网格与像素尺度/);
    assert.match(prompt('pixel'), /不使用抗锯齿/);
    assert.match(prompt('watercolor'), /不把全部边缘锐化成硬线/);
    assert.match(prompt('felt'), /羊毛纤维细软而方向自然/);
    assert.match(prompt('clay'), /指压纹轻微且尺度一致/);
    // Admins can change the medium without an ID-based photographic layer being added behind their edit.
    const custom = { ...styles.find(s => s.id === 'business')!, prompt: '将照片转绘为透明水彩，保留纸纹。' };
    assert.ok(generationPrompt(custom, 'keep', 'landscape').includes(custom.prompt));
    assert.doesNotMatch(generationPrompt(custom, 'keep', 'landscape'), /真实毛孔尺度/);
});

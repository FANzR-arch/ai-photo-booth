import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generationPrompt } from '../apps/server/generation-prompt';
import { isRealistic } from '../packages/shared/portrait-experience';
import type { Style } from '../packages/shared/types';

const styles: Style[] = JSON.parse(readFileSync('config/styles/styles.json', 'utf8'));
const standard = styles.filter(style => !style.generationPreset);

// Seedream's guidance: short, positive prompts of roughly 300 Chinese characters; longer prompts drop details.
test('standard prompts stay compact and lead with the subject and body-proportion anchor', () => {
    for (const style of standard) {
        assert.ok(style.prompt!.length <= 140, `${style.id}: theme prompt ${style.prompt!.length} chars`);
        for (const orientation of ['portrait', 'landscape'] as const) {
            for (const clothing of ['keep', 'theme'] as const) {
                const prompt = generationPrompt(style, clothing, orientation, { beauty: 'medium' });
                assert.ok(prompt.length <= 520, `${style.id}: ${prompt.length} chars`);
                assert.ok(prompt.startsWith('参考照片中的人物形象'), style.id);
                assert.match(prompt.split('\n')[0], /真实头身比例：肩宽约为头宽的2到2.5倍，85mm人像镜头透视/);
                assert.ok(prompt.includes(style.prompt!));
                assert.deepEqual([...new Set(prompt.match(/[34]:[34]/g))], [orientation === 'portrait' ? '3:4' : '4:3'], style.id);
                assert.match(prompt, /腰部以上半身构图，头顶完整，人物居中/);
            }
        }
    }
});

test('all presets apply the restrained expression after the editable theme and outfit, and clothing follows the visitor choice', () => {
    for (const style of styles) {
        const custom = { ...style, prompt: '主题要求：张嘴大笑、睁大眼睛，摆出夸张表情。', outfitPrompt: '搭配红色外套，露齿大笑。' };
        for (const clothing of ['keep', 'theme'] as const) {
            const prompt = generationPrompt(custom, clothing, style.sceneOrientation ?? 'portrait');
            const ruleAt = prompt.indexOf('表情放松自然，嘴唇轻合带微笑');
            assert.ok(ruleAt > prompt.indexOf(custom.prompt), style.id);
            assert.equal(prompt.split('表情放松自然').length, 2, style.id);
            if (style.generationPreset === 'coming-of-age') continue;
            if (clothing === 'theme') { assert.ok(ruleAt > prompt.indexOf(custom.outfitPrompt), style.id); assert.match(prompt, /用户选择：按主题换装/); }
            else { assert.equal(prompt.includes(custom.outfitPrompt), false, style.id); assert.match(prompt, /用户选择：保留原服装/); }
        }
    }
});

test('artistic themes name their medium while photographic themes describe a real scene', () => {
    for (const style of standard) {
        if (isRealistic(style.id)) assert.doesNotMatch(style.prompt!, /转绘为/, style.id);
        else assert.match(style.prompt!, /^转绘为/, style.id);
    }
    const prompt = (id: string) => generationPrompt(styles.find(s => s.id === id)!, 'keep', 'portrait');
    assert.match(prompt('pixel'), /统一像素网格/);
    assert.match(prompt('pixel'), /不使用抗锯齿/);
    assert.match(prompt('watercolor'), /不把全部边缘锐化成硬线/);
    assert.match(prompt('felt'), /细软毛纤维/);
    assert.match(prompt('clay'), /指压纹/);
    assert.match(prompt('cyanotype'), /普鲁士蓝/);
    // Keeping the original clothes still lets black-and-white or craft media convert colour and material.
    assert.match(prompt('charcoal'), /黑白或艺术媒介主题可统一转换色彩与材质表现/);
});

test('every preset keeps limb integrity after the theme and standard themes carry an explicit pose', () => {
    for (const style of styles) {
        for (const clothing of ['keep', 'theme'] as const) {
            const prompt = generationPrompt(style, clothing, style.sceneOrientation ?? 'portrait');
            assert.equal(prompt.split('两条手臂两只手，五指清晰').length, 2, style.id);
            assert.ok(prompt.indexOf('两条手臂两只手') > prompt.indexOf(style.prompt!), style.id);
        }
        if (!style.generationPreset && isRealistic(style.id)) assert.match(style.prompt!, /动作：/, style.id);
    }
});

test('directed scenes and the poster keep their full art direction plus the detailed wardrobe adaptation', () => {
    for (const style of styles.filter(s => s.generationPreset)) {
        const prompt = generationPrompt(style, 'theme', style.sceneOrientation ?? 'poster');
        assert.ok(prompt.includes(style.prompt!));
        assert.match(prompt, /【自动适配人物造型】/);
        assert.match(prompt, /真实头身比例/);
        assert.ok(prompt.startsWith('参考照片'), style.id);
    }
});

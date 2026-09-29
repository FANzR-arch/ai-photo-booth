import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generationPrompt } from '../apps/server/generation-prompt';
import type { Style } from '../packages/shared/types';

test('every bundled theme has distinct clothing guidance, without hardcoded preserve/change conflicts', () => {
    const styles: Style[] = JSON.parse(readFileSync('config/styles/styles.json', 'utf8'));
    assert.equal(styles.length, 70);
    for (const style of styles) {
        if (style.sourceCode) continue; // Imported scenes carry complete wardrobe and composition directions.
        assert.ok(style.outfitPrompt && style.outfitPrompt.length > 20, style.id);
        if (style.generationPreset === 'coming-of-age') continue; // The poster deliberately replaces outfit and pose.
        assert.doesNotMatch(style.prompt!, /保留原有服装|保留原衣着|沿用原照服装|此款为节日换装|穿着保持原照/);
        const keep = generationPrompt(style, 'keep', 'portrait');
        const change = generationPrompt(style, 'theme', 'landscape');
        assert.match(keep, /用户选择：保留原服装/);
        assert.equal(keep.includes(style.outfitPrompt), false, `${style.id}: keep must not receive the outfit instructions`);
        assert.ok(change.includes(style.outfitPrompt), `${style.id}: theme must receive its outfit instructions`);
        assert.match(change, /用户选择：按主题换装/);
        assert.match(keep, /画面比例严格为3:4/); assert.match(change, /画面比例严格为4:3/);
        for (const prompt of [keep, change]) {
            assert.match(prompt, /实际人数/); assert.match(prompt, /不换脸/); assert.match(prompt, /不改变体型/);
            assert.ok(prompt.includes(style.prompt!));
        }
    }
    const festival = styles.find(s => s.id === 'festival')!;
    assert.doesNotMatch(generationPrompt(festival, 'keep', 'portrait'), /暗红色立领外套/);
    assert.match(generationPrompt(festival, 'theme', 'portrait'), /暗红色立领外套/);
    const graduation = styles.find(s => s.id === 'memory-08')!;
    assert.match(generationPrompt(graduation, 'theme', 'portrait'), /合体的深色毕业学位袍/);
    assert.doesNotMatch(generationPrompt(graduation, 'theme', 'portrait'), /不增加学士帽、学位袍/);
});

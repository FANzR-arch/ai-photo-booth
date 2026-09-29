import test from 'node:test';
import assert from 'node:assert/strict';
import { isPhotoOrientation, orientedSize, orientationLabel } from '../packages/shared/photo-orientation';

test('photo orientation maps quality to explicit 3:4 sizes', () => {
    assert.equal(orientedSize('1.5K', 'portrait'), '1152x1536');
    assert.equal(orientedSize('1.5K', 'landscape'), '1536x1152');
    assert.equal(orientedSize('2K', 'portrait'), '1536x2048');
    assert.equal(orientedSize('custom', 'landscape'), 'custom');
    assert.equal(orientationLabel('portrait'), '竖版 3:4');
    assert.equal(isPhotoOrientation('landscape'), true);
    assert.equal(isPhotoOrientation('square'), false);
    assert.equal(isPhotoOrientation('poster'), true);
    assert.equal(orientationLabel('poster'), '竖版 2:3');
    assert.equal(orientedSize('1.5K', 'poster'), '1024x1536');
    const [w,h] = orientedSize('2K', 'poster').split('x').map(Number);
    assert.equal(w / h, 2 / 3);
    assert.equal(w % 64, 0); assert.equal(h % 64, 0);
});

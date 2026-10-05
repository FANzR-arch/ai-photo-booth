import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { detectFaces, frameReference, planFrame, faceRatioBand } from '../apps/server/reference-framing';

// The bundled sample is a 2x2 collage; one quadrant is a close-up where the face fills about 40% of the height.
async function closeUp() {
    const source = sharp('assets/examples/film-reference.png');
    const meta = await source.metadata();
    return source.extract({ left: 0, top: 0, width: Math.floor(meta.width! / 2), height: Math.floor(meta.height! / 2) }).jpeg().toBuffer();
}

test('planFrame leaves natural framing alone and pads a close-up to the output aspect ratio', () => {
    assert.equal(planFrame([{ x: 100, y: 100, width: 60, height: 70, score: 0.9 }], 400, 400, 'portrait'), undefined);
    const canvas = planFrame([{ x: 100, y: 60, width: 150, height: 160, score: 0.9 }], 400, 400, 'portrait')!;
    assert.ok(canvas.height > 400, 'close-up grows the canvas');
    assert.ok(Math.abs(canvas.width / canvas.height - 3 / 4) < 0.01);
    assert.ok(Math.abs(160 / canvas.height - faceRatioBand.ideal) < 0.01);
    assert.ok(canvas.top < 60 && canvas.top + canvas.height > 400, 'face keeps headroom and body space');
    const landscape = planFrame([{ x: 100, y: 60, width: 150, height: 160, score: 0.9 }], 400, 400, 'landscape')!;
    assert.ok(Math.abs(landscape.width / landscape.height - 4 / 3) < 0.01);
    // A tiny face is cropped in rather than padded.
    const far = planFrame([{ x: 180, y: 100, width: 20, height: 24, score: 0.9 }], 400, 400, 'portrait')!;
    assert.ok(far.height < 400);
    assert.equal(planFrame([], 400, 400, 'portrait'), undefined);
});

test('frameReference detects a close-up locally and returns a padded reference within the natural band', async () => {
    const photo = await closeUp();
    const before = await detectFaces(photo);
    assert.equal(before.faces.length, 1);
    assert.ok(before.faces[0].height / before.height > faceRatioBand.max, 'fixture is a close-up');
    const result = await frameReference(photo, 'portrait');
    assert.equal(result.applied, true, result.reason);
    assert.ok(result.framedFaceHeightRatio! >= faceRatioBand.min && result.framedFaceHeightRatio! <= faceRatioBand.max);
    const meta = await sharp(result.photo).metadata();
    assert.ok(Math.abs(meta.width! / meta.height! - 3 / 4) < 0.02);
    assert.ok(meta.width! <= 2048 && meta.height! <= 2048);
    const after = await detectFaces(result.photo);
    assert.equal(after.faces.length, 1, 'padding must not create extra faces');
    assert.ok(Math.abs(after.faces[0].height / after.height - faceRatioBand.ideal) < 0.04);
});

test('frameReference falls back to the original when no face is present', async () => {
    const blank = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#d9c9b0' } }).jpeg().toBuffer();
    const result = await frameReference(blank, 'portrait');
    assert.equal(result.applied, false);
    assert.equal(result.photo, blank);
    assert.equal(result.reason, '未检测到人脸');
});

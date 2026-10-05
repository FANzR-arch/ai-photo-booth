/**
 * Reference framing: image-to-image models largely copy how big the head is in the reference.
 * A close webcam shot therefore yields a big-headed result. Before generation we detect the face and
 * pad (or crop) the photo so the face takes a natural share of a frame with the output aspect ratio.
 * Detection runs locally (tiny face detector on the tfjs wasm backend); nothing leaves the machine.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';
import { orientationRatio, type PhotoOrientation } from '../../packages/shared/photo-orientation.js';

export interface FaceBox { x: number; y: number; width: number; height: number; score: number }
export interface FramingResult {
    photo: Buffer;
    applied: boolean;
    reason: string;
    faces: FaceBox[];
    /** Largest face box height divided by frame height, before and after framing. */
    faceHeightRatio?: number;
    framedFaceHeightRatio?: number;
    canvas?: { left: number; top: number; width: number; height: number };
}

/** Face box (eyebrows to chin) over frame height for a natural waist-up portrait; outside the band we reframe. */
export const faceRatioBand = { min: 0.14, max: 0.22, ideal: 0.18 } as const;
const faceTopShare = 0.24;      // face box top sits here so the crown keeps headroom
const maxFacesShare = 0.7;      // several faces: their union stays inside this share of the width
const detectionWidth = 640;
const outputMaxSide = 2048;

const require = createRequire(import.meta.url);
let detector: Promise<any> | undefined;
async function loadDetector() {
    const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
    await faceapi.tf.setBackend('wasm');
    await faceapi.tf.ready();
    const modelDir = path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelDir);
    return faceapi;
}

/** Faces in source pixel coordinates, largest first. */
export async function detectFaces(photo: Buffer): Promise<{ faces: FaceBox[]; width: number; height: number }> {
    const meta = await sharp(photo).metadata();
    const width = meta.width ?? 0, height = meta.height ?? 0;
    if (!width || !height) throw new Error('无法读取照片尺寸');
    const faceapi = await (detector ??= loadDetector().catch(error => { detector = undefined; throw error; }));
    const { data, info } = await sharp(photo).resize({ width: detectionWidth, height: detectionWidth, fit: 'inside', withoutEnlargement: true })
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const tensor = faceapi.tf.tensor3d(new Uint8Array(data.buffer, data.byteOffset, data.length), [info.height, info.width, 3]);
    try {
        const scale = width / info.width;
        const detections: any[] = await faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }));
        const faces = detections.map(d => ({ x: d.box.x * scale, y: d.box.y * scale, width: d.box.width * scale, height: d.box.height * scale, score: d.score }))
            .sort((a, b) => b.height - a.height);
        return { faces, width, height };
    } finally {
        tensor.dispose();
    }
}

const aspectOf = (orientation: PhotoOrientation) => { const [w, h] = orientationRatio(orientation).split(':').map(Number); return w / h; };

/** Pure framing maths, exported for tests: canvas rectangle in source pixels, or undefined when no change is needed. */
export function planFrame(faces: FaceBox[], width: number, height: number, orientation: PhotoOrientation) {
    if (!faces.length) return undefined;
    const largest = faces[0];
    const ratio = largest.height / height;
    if (ratio >= faceRatioBand.min && ratio <= faceRatioBand.max) return undefined;
    const aspect = aspectOf(orientation);
    let canvasHeight = largest.height / faceRatioBand.ideal;
    let canvasWidth = canvasHeight * aspect;
    const left = Math.min(...faces.map(f => f.x)), right = Math.max(...faces.map(f => f.x + f.width));
    if (right - left > canvasWidth * maxFacesShare) {
        canvasWidth = (right - left) / maxFacesShare;
        canvasHeight = canvasWidth / aspect;
    }
    const top = Math.min(...faces.map(f => f.y));
    return {
        left: Math.round((left + right) / 2 - canvasWidth / 2),
        top: Math.round(top - canvasHeight * faceTopShare),
        width: Math.round(canvasWidth),
        height: Math.round(canvasHeight),
    };
}

/** Compose the source over a flat, muted tone taken from the photo itself: padding must never read as a second subject or a scene. */
async function render(photo: Buffer, width: number, height: number, canvas: { left: number; top: number; width: number; height: number }) {
    const x0 = Math.max(0, canvas.left), y0 = Math.max(0, canvas.top);
    const x1 = Math.min(width, canvas.left + canvas.width), y1 = Math.min(height, canvas.top + canvas.height);
    if (x1 <= x0 || y1 <= y0) throw new Error('取景区域无效');
    const region = await sharp(photo).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).toBuffer();
    const { channels } = await sharp(photo).stats();
    const [r, g, b] = channels.slice(0, 3).map(c => Math.round(c.mean * 0.7));
    return sharp({ create: { width: canvas.width, height: canvas.height, channels: 3, background: { r, g, b } } })
        .composite([{ input: region, left: x0 - canvas.left, top: y0 - canvas.top }])
        .resize({ width: outputMaxSide, height: outputMaxSide, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
}

/** Returns the original photo untouched whenever detection fails or framing is already natural. */
export async function frameReference(photo: Buffer, orientation: PhotoOrientation): Promise<FramingResult> {
    let detected: Awaited<ReturnType<typeof detectFaces>>;
    try { detected = await detectFaces(photo); }
    catch (error) { return { photo, applied: false, reason: `人脸检测不可用：${(error as Error).message}`, faces: [] }; }
    const { faces, width, height } = detected;
    if (!faces.length) return { photo, applied: false, reason: '未检测到人脸', faces };
    const faceHeightRatio = faces[0].height / height;
    const canvas = planFrame(faces, width, height, orientation);
    if (!canvas) return { photo, applied: false, reason: '头部占比已在自然范围', faces, faceHeightRatio };
    try {
        const framed = await render(photo, width, height, canvas);
        return { photo: framed, applied: true, reason: faceHeightRatio > faceRatioBand.max ? '头部占比过大，已扩边' : '头部占比过小，已裁切', faces, faceHeightRatio, framedFaceHeightRatio: faces[0].height / canvas.height, canvas };
    } catch (error) {
        return { photo, applied: false, reason: `重构图失败：${(error as Error).message}`, faces, faceHeightRatio };
    }
}

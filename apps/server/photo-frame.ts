import sharp from 'sharp';
import { printLayout, printSvg, defaultCaption, type FrameId, type Caption } from '../../packages/shared/frames.js';
/** Compose outside the intact photo; the original file is never changed. */
export async function framePhoto(photo: Buffer, id: FrameId = 'none', caption: Caption = defaultCaption) {
 if(id==='none' && !caption.text.trim()) return photo;
 const normalized=await sharp(photo).rotate().toBuffer();
 const meta=await sharp(normalized).metadata(),w=meta.width!,h=meta.height!;
 const g=printLayout(w,h,id,caption);
 return sharp(Buffer.from(printSvg(w,h,id,caption))).composite([{input:normalized,left:g.left,top:g.top}]).jpeg({quality:95}).toBuffer();
}

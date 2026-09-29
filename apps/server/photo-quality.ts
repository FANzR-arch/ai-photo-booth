import sharp from 'sharp';

/** Preserve source detail and strip metadata; previews need enough pixels for high-density displays. */
export const normalizeSourcePhoto = (photo: Buffer) => sharp(photo, { limitInputPixels: 25000000 }).rotate()
    .resize({ width: 3072, height: 3072, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer();
export const fullPhoto = (photo: Buffer) => sharp(photo, { limitInputPixels: 25000000 }).rotate()
    .jpeg({ quality: 97, chromaSubsampling: '4:4:4' }).toBuffer();
export const previewPhoto = (photo: Buffer) => sharp(photo, { limitInputPixels: 25000000 }).rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();

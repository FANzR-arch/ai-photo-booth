export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
    const response = await fetch(path, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
        let message = `请求失败（${response.status}）`;
        try {
            message = (await response.json()).error || message;
        }
        catch { }
        throw Object.assign(new Error(message), { status: response.status });
    }
    return response.json();
}
export async function readFile(file: Blob): Promise<string> {
    if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('请选择 JPG 或 PNG 图片');
    if (file.size > 60 * 1024 * 1024) throw new Error('照片需小于 60 MB');
    // Prepare large camera originals locally; never modify the user's source file.
    if (file.size > 12 * 1024 * 1024) {
        let bitmap: ImageBitmap;
        try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
        catch { throw new Error('照片无法解码，请选择有效的 JPG 或 PNG 图片'); }
        try {
            const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const context = canvas.getContext('2d');
            if (!context) throw new Error('浏览器无法处理照片，请更换浏览器后重试');
            context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const result = canvas.toDataURL('image/jpeg', .92);
            if (!result.startsWith('data:image/jpeg') || result.length > 16 * 1024 * 1024) throw new Error('照片处理失败，请换一张较小的照片');
            return result;
        } finally { bitmap.close(); }
    }
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file); });
}
export const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

/** Seedream transport: no automatic retries; ambiguous outcomes must not be resubmitted. */
import { resolve4 } from 'node:dns/promises';
import { request } from 'node:https';
const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const MAX_IMAGE = 24 * 1024 * 1024;
const MAX_JSON = 36 * 1024 * 1024;
export class ProviderError extends Error {
    constructor(message: string, public unknown = false, public requestId?: string) {
        super(message);
        this.name = 'ProviderError';
    }
}
export interface GenerateInput {
    photo: Buffer;
    prompt: string;
    size: string;
    count: number;
}
export interface GenerateResult {
    images: Buffer[];
    requestId?: string;
    error?: string;
    unknown?: boolean;
}
function publicIpv4(ip: string): boolean {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
        (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}
/** URL fallback is restricted to vendor delivery hosts and pinned public IPv4 DNS. No redirects. */
async function downloadImage(raw: string): Promise<Buffer> {
    const url = new URL(raw);
    const hosts = ['volces.com', 'volccdn.com', 'byteimg.com', 'ibyteimg.com'];
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
        !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
        throw new ProviderError('上游返回了未允许的图片下载地址；请核对官方交付域名，勿直接重试生成。', true);
    }
    const addresses = await Promise.race([
        resolve4(url.hostname),
        new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('DNS timeout')), 10000); timer.unref(); }),
    ]);
    if (!addresses.length || addresses.some(ip => !publicIpv4(ip)))
        throw new ProviderError('上游图片下载地址未通过检查。', true);
    return new Promise((resolve, reject) => {
        const req = request(url, {
            method: 'GET',
            lookup: ((_hostname: string, _options: unknown, callback: Function) => callback(null, addresses[0], 4)) as any,
        }, response => {
            if (response.statusCode !== 200 || !String(response.headers['content-type']).startsWith('image/')) {
                response.resume();
                reject(new ProviderError('图片已生成，但下载响应无效；请检查上游记录。', true));
                return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            response.on('data', (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes > MAX_IMAGE)
                    req.destroy(new Error('Image too large'));
                else
                    chunks.push(chunk);
            });
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        });
        const timer = setTimeout(() => req.destroy(new Error('Image download timeout')), 45000);
        req.on('close', () => clearTimeout(timer));
        req.on('error', reject);
        req.end();
    });
}
async function readJson(response: Response): Promise<any> {
    if (!response.body)
        throw new ProviderError('上游返回空响应；结果可能已生成。', true);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        bytes += value.length;
        if (bytes > MAX_JSON) {
            await reader.cancel();
            throw new ProviderError('上游响应超过大小限制；请检查生成记录。', true);
        }
        chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function generateOne(input: GenerateInput, key: string, model: string): Promise<{
    image: Buffer;
    requestId?: string;
}> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    let requestId: string | undefined;
    let responseReceived = false;
    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model, prompt: input.prompt, image: `data:image/jpeg;base64,${input.photo.toString('base64')}`,
                size: input.size, response_format: 'b64_json', watermark: false,
                
            }),
        });
        responseReceived = true;
        requestId = response.headers.get('x-request-id') ?? response.headers.get('x-tt-logid') ?? undefined;
        if (!response.ok) {
            await response.body?.cancel();
            const unknown = response.status >= 500 || response.status === 408;
            throw new ProviderError(`Seedream 请求失败（HTTP ${response.status}）${unknown ? '，结果状态不确定，请核对上游记录' : '，请检查模型权限、额度或请求参数'}。`, unknown, requestId);
        }
        const body = await readJson(response);
        if (body.error)
            throw new ProviderError('Seedream 返回生成错误，请凭请求编号检查控制台。', false, requestId);
        const result = body.data?.[0];
        if (!result)
            throw new ProviderError('未获得图片；请核对上游是否计费，暂不重复生成。', true, requestId);
        let image: Buffer;
        if (typeof result.b64_json === 'string' && result.b64_json) {
            if (result.b64_json.length > Math.ceil(MAX_IMAGE * 4 / 3) + 4 || !/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(result.b64_json)) {
                throw new ProviderError('上游图片编码或大小异常。', true, requestId);
            }
            image = Buffer.from(result.b64_json, 'base64');
        }
        else if (typeof result.url === 'string')
            image = await downloadImage(result.url);
        else
            throw new ProviderError('上游未返回可保存的图片。', true, requestId);
        if (!image.length || image.length > MAX_IMAGE)
            throw new ProviderError('上游图片为空或超出大小限制。', true, requestId);
        return { image, requestId };
    }
    catch (error) {
        if (error instanceof ProviderError) {
            error.requestId ??= requestId;
            throw error;
        }
        const cause = (error as { cause?: { code?: string; syscall?: string } }).cause;
        if (!responseReceived && cause?.code === 'EACCES' && cause.syscall === 'connect')
            throw new ProviderError('本机网络权限阻止了连接，生成请求未发出。请检查服务运行权限后重新生成。', false);
        throw new ProviderError('生成连接中断、超时或结果解析失败；任务可能已计费，请检查上游记录，勿直接重试。', true, requestId);
    }
    finally {
        clearTimeout(timer);
    }
}
export async function generate(input: GenerateInput, credentials?: { key: string; model: string }): Promise<GenerateResult> {
    const key = (credentials?.key ?? process.env.SEEDREAM_API_KEY)?.trim();
    const model = (credentials?.model ?? process.env.SEEDREAM_MODEL)?.trim();
    if (!key || !model)
        throw new ProviderError('请在设备设置中填写 API 密钥和模型 ID 并保存。');
    if (!input.photo.length || !input.prompt.trim() || !input.size.trim() || ![1, 2].includes(input.count)) {
        throw new ProviderError('照片、提示词、尺寸或生成数量无效。');
    }
    const images: Buffer[] = [];
    const ids: string[] = [];
    for (let i = 0; i < input.count; i++) {
        try {
            const result = await generateOne(input, key, model);
            images.push(result.image);
            if (result.requestId)
                ids.push(result.requestId);
        }
        catch (error) {
            const failure = error instanceof ProviderError ? error : new ProviderError('生成状态不确定。', true);
            if (failure.requestId)
                ids.push(failure.requestId);
            if (!images.length)
                throw failure;
            return { images, requestId: ids.join(', ') || undefined, error: failure.message, unknown: failure.unknown };
        }
    }
    return { images, requestId: ids.join(', ') || undefined };
}

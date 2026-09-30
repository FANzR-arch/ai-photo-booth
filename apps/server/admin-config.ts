/** Read masked provider settings and reuse the local CLI's atomic .env writer. No upstream calls. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';
import { saveCredentials } from '../../scripts/macos/configure.mjs';
const error = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

export function adminConfiguration(root: string, activeKey: string, activeModel: string) {
    const read = () => {
        const file = path.join(root, '.env');
        const values = existsSync(file) ? parse(readFileSync(file)) : {};
        return { key: values.SEEDREAM_API_KEY?.trim() || '', model: values.SEEDREAM_MODEL?.trim() || '' };
    };
    const status = () => {
        const saved = read();
        return {
            keyConfigured: !!saved.key, keyHint: saved.key ? (saved.key.length > 8 ? `••••${saved.key.slice(-4)}` : '••••') : '', model: saved.model,
            activeConfigured: !!(activeKey && activeModel), activeModel,
            restartRequired: saved.key !== activeKey || saved.model !== activeModel,
            providerVerified: false,
        };
    };
    return {
        status,
        save: (key: unknown, model: unknown) => {
            if (typeof key !== 'string' || typeof model !== 'string' || key.length > 1024 || model.length > 200) throw error('配置格式无效。');
            const nextKey = key.trim() || read().key;
            if (!nextKey || !model.trim()) throw error('首次配置请填写 API 密钥和模型 ID。');
            try { saveCredentials(root, `${nextKey}\n${model}\n`); }
            catch (cause) {
                // Validation errors are safe; OS errors may include paths and are not returned verbatim.
                if (/原配置未修改/.test((cause as Error).message)) throw error((cause as Error).message);
                throw Object.assign(Error('配置保存失败，原配置未主动清空。请检查本机文件权限。'), { statusCode: 500 });
            }
            return status();
        },
    };
}

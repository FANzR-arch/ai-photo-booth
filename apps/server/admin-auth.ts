/** Local administrator boundary: scrypt password on disk, revocable sessions in memory. */
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

export const adminIdleMs = 10 * 60_000;
const lifetimeMs = 8 * 60 * 60_000;
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
export const adminPasswordPath = (root: string) => path.join(root, 'data', 'admin-auth.json');

export async function setAdminPassword(root: string, password: string) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128 || !password.trim() || /[\r\n\0]/.test(password))
        throw Error('管理员密码需为 12–128 个字符，不能全为空格或包含换行。');
    const salt = randomBytes(32).toString('hex');
    const hash = (await derive(password, salt)).toString('hex');
    const target = adminPasswordPath(root), temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    try {
        writeFileSync(temporary, JSON.stringify({ version: 1, salt, hash }), { flag: 'wx', mode: 0o600 });
        renameSync(temporary, target);
    } finally { rmSync(temporary, { force: true }); }
}

export function createAdminAccess(root: string, now: () => number) {
    const sessions = new Map<string, { revision: string; touched: number; created: number }>();
    let failures: number[] = [], pending = false, revision = '';
    const credential = () => {
        const file = adminPasswordPath(root);
        if (!existsSync(file)) return undefined;
        try {
            const raw = readFileSync(file, 'utf8'), value = JSON.parse(raw);
            if (value.version !== 1 || !/^[a-f0-9]{64}$/.test(value.salt) || !/^[a-f0-9]{128}$/.test(value.hash)) throw Error();
            const currentRevision = createHash('sha256').update(raw).digest('hex');
            if (currentRevision !== revision) { sessions.clear(); failures = []; revision = currentRevision; }
            return { ...value, revision: currentRevision } as { salt: string; hash: string; revision: string };
        } catch { throw fail('管理员配置无法读取，请从本机维护入口重新设置密码。', 503); }
    };
    const prune = () => { for (const [id, session] of sessions) if (now() - session.touched >= adminIdleMs || now() - session.created >= lifetimeMs) sessions.delete(id); };
    const current = (id: string | undefined, touch = false) => {
        prune();
        const saved = credential(), session = id ? sessions.get(id) : undefined;
        if (!saved || !session || saved.revision !== session.revision) { if (id) sessions.delete(id); return false; }
        if (touch) session.touched = now();
        return true;
    };
    return {
        status: (id?: string) => ({ configured: !!credential(), authenticated: current(id), idleTimeoutMs: adminIdleMs }),
        require: (id?: string) => { if (!current(id)) throw fail('工作台已锁定，请重新登录。', 401); },
        touch: (id?: string) => { if (!current(id, true)) throw fail('工作台已锁定，请重新登录。', 401); },
        logout: (id?: string) => { if (id) sessions.delete(id); },
        login: async (password: unknown) => {
            const saved = credential();
            if (!saved) throw fail('尚未设置管理员密码，请在本机维护入口设置。', 409);
            failures = failures.filter(time => now() - time < 15 * 60_000);
            if (pending || failures.length >= 5) throw fail('尝试次数过多，请在 15 分钟后重试。', 429);
            if (typeof password !== 'string' || password.length > 128 || password.length < 1) { failures.push(now()); throw fail('密码不正确。', 401); }
            pending = true;
            try {
                const actual = await derive(password, saved.salt);
                if (!timingSafeEqual(actual, Buffer.from(saved.hash, 'hex'))) { failures.push(now()); throw fail('密码不正确。', 401); }
                if (credential()?.revision !== saved.revision) throw fail('密码已更新，请重新登录。', 401);
                failures = []; sessions.clear();
                const id = randomBytes(32).toString('hex');
                sessions.set(id, { revision: saved.revision, touched: now(), created: now() });
                return id;
            } finally { pending = false; }
        },
    };
}

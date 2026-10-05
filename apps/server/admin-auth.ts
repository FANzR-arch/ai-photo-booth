/** Local administrator boundary: scrypt password on disk, revocable sessions in memory. */
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, linkSync, rmSync } from 'node:fs';
import path from 'node:path';

export const adminIdleMs = 10 * 60_000;
const lifetimeMs = 8 * 60 * 60_000;
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
export const adminPasswordPath = (root: string) => path.join(root, 'data', 'admin-auth.json');
/** Accepted only while no password file exists; the first default login stores it so it can then be changed. */
export const defaultAdminPassword = '88888888';

export async function setAdminPassword(root: string, password: string, createOnly = false, initial = false) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !password.trim() || /[\r\n\0]/.test(password))
        throw fail('管理员密码需为 8–128 个字符，不能全为空格或包含换行。', 400);
    const salt = randomBytes(32).toString('hex');
    const hash = (await derive(password, salt)).toString('hex');
    const target = adminPasswordPath(root), temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    try {
        writeFileSync(temporary, JSON.stringify({ version: 1, salt, hash, ...(initial ? { initial: true } : {}) }), { flag: 'wx', mode: 0o600 });
        // Atomic create prevents two local instances from overwriting first-use setup.
        if (createOnly) {
            try { linkSync(temporary, target); }
            catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw fail('密码已设置，请用已有密码解锁。', 409); throw error; }
        } else renameSync(temporary, target);
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
            return { ...value, revision: currentRevision } as { salt: string; hash: string; initial?: boolean; revision: string };
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
    const open = (revision: string) => {
        const id = randomBytes(32).toString('hex');
        sessions.set(id, { revision, touched: now(), created: now() });
        return id;
    };
    // Shared by login and password change: the same lockout counts every wrong guess.
    const verify = async (saved: { salt: string; hash: string; revision: string }, password: unknown) => {
        failures = failures.filter(time => now() - time < 15 * 60_000);
        if (failures.length >= 5) throw fail('尝试次数过多，请在 15 分钟后重试。', 429);
        if (typeof password !== 'string' || password.length > 128 || password.length < 1) { failures.push(now()); throw fail('密码不正确。', 401); }
        const actual = await derive(password, saved.salt);
        if (!timingSafeEqual(actual, Buffer.from(saved.hash, 'hex'))) { failures.push(now()); throw fail('密码不正确。', 401); }
        if (credential()?.revision !== saved.revision) throw fail('密码已更新，请重新登录。', 401);
        failures = [];
    };
    return {
        status: (id?: string) => { const saved = credential(); return { configured: !!saved, defaultPassword: !saved || !!saved.initial, authenticated: current(id), idleTimeoutMs: adminIdleMs }; },
        require: (id?: string) => { if (!current(id)) throw fail('工作台已锁定，请重新登录。', 401); },
        touch: (id?: string) => { if (!current(id, true)) throw fail('工作台已锁定，请重新登录。', 401); },
        logout: (id?: string) => { if (id) sessions.delete(id); },
        setup: async (password: unknown) => {
            if (credential()) throw fail('密码已设置，请用已有密码解锁。', 409);
            if (pending) throw fail('正在设置密码，请稍后重试。', 429);
            pending = true;
            try {
                await setAdminPassword(root, password as string, true);
                return open(credential()!.revision);
            } finally { pending = false; }
        },
        login: async (password: unknown) => {
            if (pending) throw fail('尝试次数过多，请在 15 分钟后重试。', 429);
            pending = true;
            try {
                failures = failures.filter(time => now() - time < 15 * 60_000);
                if (failures.length >= 5) throw fail('尝试次数过多，请在 15 分钟后重试。', 429);
                let saved = credential();
                if (!saved) {
                    if (password !== defaultAdminPassword) { failures.push(now()); throw fail('密码不正确。', 401); }
                    try { await setAdminPassword(root, defaultAdminPassword, true, true); }
                    catch (error) { if ((error as { statusCode?: number }).statusCode !== 409) throw error; }
                    saved = credential()!;
                }
                await verify(saved, password);
                sessions.clear();
                return open(saved.revision);
            } finally { pending = false; }
        },
        change: async (id: string | undefined, currentPassword: unknown, nextPassword: unknown) => {
            if (!current(id)) throw fail('工作台已锁定，请重新登录。', 401);
            if (typeof nextPassword !== 'string' || nextPassword === defaultAdminPassword) throw fail('新密码不能使用默认密码。', 400);
            if (pending) throw fail('正在处理，请稍后重试。', 429);
            pending = true;
            try {
                await verify(credential()!, currentPassword);
                if (nextPassword === currentPassword) throw fail('新密码需与当前密码不同。', 400);
                await setAdminPassword(root, nextPassword);
                sessions.clear(); // Every other open workbench must log in with the new password.
                return open(credential()!.revision);
            } finally { pending = false; }
        },
    };
}

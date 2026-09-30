/** Interactive local-only recovery. Never accepts passwords in command-line arguments. */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { setAdminPassword } from '../apps/server/admin-auth.js';
try {
    let password: string, confirmation: string;
    if (process.stdin.isTTY) {
        const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
        const reader = createInterface({ input: process.stdin, output: muted, terminal: true });
        try {
            process.stdout.write('设置管理员密码（8–128 个字符，输入不显示）：');
            password = await reader.question('');
            process.stdout.write('\n再次输入：');
            confirmation = await reader.question('');
            process.stdout.write('\n');
        } finally { reader.close(); }
    } else {
        let input = ''; for await (const chunk of process.stdin) input += chunk;
        const values = input.split(/\r?\n/);
        [password, confirmation] = values;
        if (values.slice(2).some(Boolean)) throw Error('密码输入格式无效。');
    }
    if (password !== confirmation) throw Error('两次密码不一致，未修改。');
    await setAdminPassword(process.cwd(), password);
    console.log('管理员密码已保存。已有登录失效；请在 /admin 登录。未调用 AI API。');
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }

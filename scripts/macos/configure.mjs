/** Update only Seedream credentials; input arrives on stdin, never in shell arguments or logs. */
import { readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export function updateCredentials(content, key, model) {
  if (!key?.trim() || !model?.trim()) throw new Error('密钥和模型不能为空，原配置未修改。');
  for (const value of [key, model]) {
    if (/[\r\n\0"\\]/.test(value)) throw new Error('配置含不支持的字符，原配置未修改。');
  }
  const remaining = content.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?(?:SEEDREAM_API_KEY|SEEDREAM_MODEL)\s*=/.test(line));
  return `${remaining.join('\n').trimEnd()}\nSEEDREAM_API_KEY="${key.trim()}"\nSEEDREAM_MODEL="${model.trim()}"\n`;
}

export function saveCredentials(root, input) {
  const [key, model, ...extra] = input.split(/\r?\n/);
  if (extra.some(line => line !== '')) throw new Error('输入格式无效，原配置未修改。');
  const target = path.join(root, '.env');
  const content = readFileSync(existsSync(target) ? target : path.join(root, '.env.example'), 'utf8');
  const updated = updateCredentials(content, key, model);
  const temporary = path.join(root, `.env.setup-${randomUUID()}`);
  try {
    writeFileSync(temporary, updated, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, target);
  } finally { rmSync(temporary, { force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, 'configure.mjs')) {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    saveCredentials(process.cwd(), input);
    console.log('配置已保存，未调用 API。关闭已有服务，再选 3 启动后生效。不要将 .env 发到聊天中。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

/** macOS CUPS adapter: read driver choices, save per-app settings, submit without a shell. */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PrinterSettings, PrinterOption } from '../../packages/shared/printing.js';

export type PrintCommand = (file: string, args: string[]) => Promise<string>;
const fault = (message: string, statusCode = 400) => Object.assign(Error(message), { statusCode });
const validName = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,126}$/.test(value);
const command: PrintCommand = (file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, env: { ...process.env, LC_ALL: 'C', LANG: 'C' }, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout));
});
export function parsePrinterOptions(raw: string, ppd = ''): PrinterOption[] {
    const labels = new Map<string, string>();
    for (const line of ppd.split(/\r?\n/)) {
        const match = line.match(/^\*(PageSize|MediaType|EPIJ_Qual)\s+([^\s/:]+)\/([^:]+):/);
        if (match) labels.set(`${match[1]}:${match[2]}`, match[3]);
    }
    return raw.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^(PageSize|MediaType|EPIJ_Qual)\/([^:]+):\s*(.*)$/);
        if (!match) return [];
        return [{ name: match[1], label: match[2], choices: match[3].split(/\s+/).flatMap(item => {
            const value = item.replace(/^\*/, '');
            return validName(value) ? [{ value, label: labels.get(`${match[1]}:${value}`) || value }] : [];
        }) }];
    });
}
export function createMacPrinter(root: string, run: PrintCommand = command, platform: string = process.platform) {
    const file = path.join(root, 'data', 'printer-settings.json');
    const supported = platform === 'darwin';
    const read = (): PrinterSettings | undefined => {
        if (!existsSync(file)) return undefined;
        try { return JSON.parse(readFileSync(file, 'utf8')); }
        catch { throw fault('打印设置无法读取，请重新保存。', 503); }
    };
    const requireMac = () => { if (!supported) throw fault('请在连接打印机的 Mac 上设置打印。', 503); };
    const queues = async () => {
        requireMac();
        const raw = await run('/usr/bin/lpstat', ['-a']);
        return [...new Set(raw.split(/\r?\n/).filter(line => line.trim()).map(line => line.trim().split(/\s+/)[0]).filter(validName))];
    };
    const options = async (queue: string) => {
        if (!validName(queue) || !(await queues()).includes(queue)) throw fault('打印机不存在，请重新选择。');
        const raw = await run('/usr/bin/lpoptions', ['-p', queue, '-l']);
        let ppd = '';
        try { ppd = readFileSync(`/etc/cups/ppd/${queue}.ppd`, 'utf8'); } catch {}
        return parsePrinterOptions(raw, ppd);
    };
    const validate = async (value: PrinterSettings) => {
        requireMac();
        if (!value || value.enabled !== true || value.paperConfirmed !== true || !validName(value.queue) || !validName(value.paper) ||
            typeof value.copies !== 'number' || !Number.isInteger(value.copies) || value.copies < 1 || value.copies > 5 || !value.fit || !['contain', 'cover'].includes(value.fit))
            throw fault('请选择打印机、纸张和份数，并确认实际装纸。');
        const available = await options(value.queue);
        for (const [name, choice] of [['PageSize', value.paper], ['MediaType', value.media], ['EPIJ_Qual', value.quality]]) {
            const field = available.find(option => option.name === name);
            if (name === 'PageSize' && !field) throw fault('驱动没有提供可确认的纸张选项，请先检查打印机驱动。');
            if (field && !field.choices.some(item => item.value === choice)) throw fault(`请选择有效的${name === 'PageSize' ? '纸张' : name === 'MediaType' ? '纸型' : '质量'}。`);
            if (!field && choice) throw fault('打印选项已变化，请重新保存设置。');
        }
        return value;
    };
    return {
        supported,
        status: () => ({ supported, configured: supported && read()?.enabled === true }),
        settings: read,
        queues,
        options,
        save: async (value: PrinterSettings) => {
            if (value?.enabled !== false) await validate(value);
            const saved: PrinterSettings = value?.enabled === false ? { enabled: false } : {
                enabled: true, queue: value.queue, paper: value.paper, media: value.media || '', quality: value.quality || '',
                copies: value.copies, fit: value.fit, paperConfirmed: true,
            };
            mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
            const temporary = `${file}.${randomUUID()}.tmp`;
            try { writeFileSync(temporary, JSON.stringify(saved), { flag: 'wx', mode: 0o600 }); renameSync(temporary, file); }
            finally { rmSync(temporary, { force: true }); }
            return saved;
        },
        prepare: async () => {
            const settings = read();
            if (!settings?.enabled) throw fault('请先在设备设置中配置打印机和实际相纸。', 409);
            return { ...await validate(settings) };
        },
        submit: async (filename: string, settings: PrinterSettings, title: string) => {
            requireMac();
            // All options came from validated driver choices. CUPS copies the file into its spool.
            const args = ['-d', settings.queue!, '-n', String(settings.copies), '-t', title, '-o', `PageSize=${settings.paper}`,
                '-o', settings.fit === 'cover' ? 'fill' : 'fit-to-page', '-o', 'job-sheets=none', '-o', 'job-hold-until=no-hold'];
            if (settings.media) args.push('-o', `MediaType=${settings.media}`);
            if (settings.quality) args.push('-o', `EPIJ_Qual=${settings.quality}`);
            args.push('--', filename);
            const result = await run('/usr/bin/lp', args);
            const id = result.match(/(?:^|\s)([a-zA-Z0-9_][a-zA-Z0-9_.-]*-\d+)(?=\s|$)/)?.[1];
            if (!id || !id.startsWith(`${settings.queue}-`)) throw fault('打印任务响应无法确认，请检查系统打印队列。', 503);
            return id;
        },
    };
}
export type MacPrinter = ReturnType<typeof createMacPrinter>;

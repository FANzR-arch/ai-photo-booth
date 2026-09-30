// Read-only CUPS inventory. No print jobs, device changes, credentials, or customer files.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function printerReport(run, readPpd = () => '') {
  const lines = [
    'SNAP CLUB — Mac 打印能力采集（只读）',
    `采集时间：${new Date().toISOString()}`,
    '驱动支持/默认设置不等于实际装纸；队列接受任务不等于已出纸。',
    '不提交打印任务，不修改默认值，不读取历史打印任务或顾客文件。',
  ];
  const query = (binary, args) => {
    const result = run(binary, args);
    lines.push(`\n$ ${binary} ${args.join(' ')}`);
    if (result.status !== 0 || result.error) {
      lines.push(`未能读取（退出码 ${result.status ?? '无'}，${result.error?.code || '命令失败'}）；能力未知。`);
      return '';
    }
    const output = String(result.stdout || '').trim();
    lines.push(output || '没有返回信息；不能据此推定设备能力。');
    return output;
  };
  const listing = query('/usr/bin/lpstat', ['-p', '-d']);
  const acceptance = query('/usr/bin/lpstat', ['-a']);
  // macOS may localize -p even with LC_ALL=C. In -a, the queue name is
  // the first field; only the following acceptance/status text is localized.
  const queues = [...new Set(acceptance
    ? acceptance.split(/\r?\n/).filter(line => line.trim()).map(line => line.trim().split(/\s+/)[0])
    : [...listing.matchAll(/^printer\s+(\S+)/gm)].map(match => match[1]))];
  for (const queue of queues) {
    // CUPS names are used only as separate arguments and a validated PPD basename.
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,126}$/.test(queue)) {
      lines.push('\n队列名无法安全解析；请由现场人员在系统设置中检查。');
      continue;
    }
    lines.push(`\n--- 队列：${queue} ---`);
    try {
      const ppd = readPpd(queue);
      const metadata = ppd.split(/\r?\n/).filter(line => /^\*(Manufacturer|ModelName|NickName|Product):/.test(line));
      lines.push(metadata.length ? metadata.join('\n') : '驱动型号元数据不可用；可能为免驱队列或无可读 PPD，不能推定缺少驱动。');
    } catch {
      lines.push('驱动型号元数据不可读；不提权、不修改权限。');
    }
    lines.push('以下列出驱动提供的选项；星号 * 通常表示当前默认选项，不代表纸盒实物。');
    query('/usr/bin/lpoptions', ['-p', queue, '-l']);
  }
  if (!queues.length) lines.push('\n没有解析出可检查的打印队列；请确认安装队列并保留上述错误。');
  lines.push('\n需要现场人员确认：实际装纸尺寸/纸型；每单份数与价格；比例不符时裁切或留白。',
    '无法从本报告确认：实际剩余纸量、可靠出纸检测、打印品质、卡纸恢复、应用自动打印。');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.platform !== 'darwin') {
    console.error('请在目标 Mac 上运行；此电脑不能代替现场打印机采集。');
    process.exitCode = 1;
  } else {
    const report = printerReport(
      (binary, args) => spawnSync(binary, args, {
        encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
        env: { ...process.env, LC_ALL: 'C', LANG: 'C' }, shell: false,
      }),
      queue => readFileSync(`/etc/cups/ppd/${queue}.ppd`, 'utf8'),
    );
    if (process.argv.includes('--stdout')) process.stdout.write(report);
    else {
      const dir = path.resolve('diagnostics');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, `mac-printers-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      writeFileSync(file, report, { mode: 0o600, flag: 'wx' });
      console.log(`已保存：${file}`);
    }
  }
}

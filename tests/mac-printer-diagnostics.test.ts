import test from 'node:test';
import assert from 'node:assert/strict';
import { printerReport } from '../scripts/macos/printer-diagnostics.mjs';

test('printer inventory reads capabilities without jobs, mutations or unrelated PPD fields', () => {
  const calls: [string, string[]][] = [];
  const report = printerReport((binary: string, args: string[]) => {
    calls.push([binary, args]);
    return { status: 0, stdout: args.includes('-l') ? 'PageSize/Media Size: *A4 4x6\nBorderless: *False True' : args.includes('-d') ? 'printer EPSON_L805_Series is idle.\nsystem default destination: EPSON_L805_Series' : 'EPSON_L805_Series accepting requests' };
  }, () => '*NickName: "EPSON L805"\n*cupsFilter: "not-for-the-report"\n*Password: "not-for-the-report"');
  assert.deepEqual(calls, [
    ['/usr/bin/lpstat', ['-p', '-d']], ['/usr/bin/lpstat', ['-a']],
    ['/usr/bin/lpoptions', ['-p', 'EPSON_L805_Series', '-l']],
  ]);
  assert.match(report, /\*A4 4x6/);
  assert.match(report, /EPSON L805/);
  assert.match(report, /不代表纸盒实物/);
  assert.doesNotMatch(report, /not-for-the-report/);
});

test('unreadable queues and unusual names remain unknown without unsafe path reads', () => {
  let reads = 0;
  const failed = printerReport(() => ({ status: null, error: { code: 'ETIMEDOUT' } }));
  assert.match(failed, /ETIMEDOUT/);
  assert.match(failed, /能力未知/);
  const unsafe = printerReport((_binary: string, args: string[]) => ({ status: 0, stdout: args.includes('-a') ? '../../private accepting requests' : 'printer ../../private is idle.' }), () => { reads++; return ''; });
  assert.equal(reads, 0);
  assert.match(unsafe, /队列名无法安全解析/);
});

test('localized printer labels and acceptance text still discover every queue', () => {
  const queried: string[] = [];
  const report = printerReport((binary: string, args: string[]) => {
    if (binary.endsWith('lpoptions')) { queried.push(args[1]); return { status: 0, stdout: 'PageSize/纸张尺寸: *A4 EPKG' }; }
    return { status: 0, stdout: args.includes('-a')
      ? 'EPSON_L805_Series 自 2026年9月29日 起接受请求\r\nApeosPort_V_C3376_f8_30_2f_ 不接受请求\r\n'
      : '打印机EPSON_L805_Series处于闲置状态。\n系统默认目标：EPSON_L805_Series' };
  });
  assert.deepEqual(queried, ['EPSON_L805_Series', 'ApeosPort_V_C3376_f8_30_2f_']);
  assert.match(report, /PageSize\/纸张尺寸/);
  assert.doesNotMatch(report, /没有解析出可检查的打印队列/);
});

test('missing default destination does not block discovery through acceptance listing', () => {
  const queried: string[] = [];
  const report = printerReport((binary: string, args: string[]) => {
    if (binary.endsWith('lpoptions')) { queried.push(args[1]); return { status: 0, stdout: 'PageSize: *A4' }; }
    return args.includes('-a') ? { status: 0, stdout: 'EPSON_L805_Series accepting requests' } : { status: 1, stdout: '' };
  });
  assert.deepEqual(queried, ['EPSON_L805_Series']);
  assert.match(report, /PageSize: \*A4/);
});

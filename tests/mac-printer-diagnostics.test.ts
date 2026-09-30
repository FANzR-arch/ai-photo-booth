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
  const unsafe = printerReport(() => ({ status: 0, stdout: 'printer ../../private is idle.' }), () => { reads++; return ''; });
  assert.equal(reads, 0);
  assert.match(unsafe, /队列名无法安全解析/);
});

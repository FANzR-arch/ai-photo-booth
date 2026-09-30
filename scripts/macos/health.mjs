// Deliberately exclude provider keys, model IDs, pickup links and customer records from diagnostics.
import 'dotenv/config';
const port = Number(process.env.PORT || 4377);
try {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('port');
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
  const health = await response.json();
  if (!response.ok || health.service !== 'snap-club') throw new Error('service');
  console.log(JSON.stringify({ service: health.service, mode: health.mode, paymentMode: health.paymentMode, configured: health.configured }));
} catch {
  console.log('固定端口没有可确认的拍照亭服务。免费联调使用随机端口，此结果不代表联调失败。');
  process.exitCode = 1;
}

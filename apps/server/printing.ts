/** Durable at-most-once printing per generated photo. Uncertain submissions never auto-retry. */
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FrameId, Caption } from '../../packages/shared/frames.js';
import type { PrintJob, PrinterSettings } from '../../packages/shared/printing.js';
import { framePhoto } from './photo-frame.js';
import type { MacPrinter } from './mac-printer.js';
const fail = (message: string, statusCode = 400) => Object.assign(Error(message), { statusCode });
interface PrintingOptions {
    printer: MacPrinter;
    data: string;
    now: () => number;
    all: () => PrintJob[];
    get: (id: string) => PrintJob | undefined;
    put: (job: PrintJob) => void;
    photo: (sessionId: string, imageId: string) => { photo: Buffer; frame: FrameId; caption: Caption };
}
export function registerPrinting(app: FastifyInstance, options: PrintingOptions) {
    const { printer, data, now, all, get, put, photo } = options;
    const directory = path.join(data, 'print-jobs');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const filename of readdirSync(directory)) {
        if (/^[a-f0-9-]{36}\.jpg$/.test(filename)) rmSync(path.join(directory, filename), { force: true });
    }
    for (const job of all()) {
        if (job.status === 'preparing') { job.status = 'failed'; job.error = '准备打印时服务重启，未提交打印。'; put(job); }
        else if (job.status === 'submitting') { job.status = 'unknown'; job.error = '服务曾重启，请检查系统打印队列，勿重复打印。'; put(job); }
    }
    const tasks = new Set<Promise<void>>();
    const idFor = (sessionId: string, imageId: string) => createHash('sha256').update(`${sessionId}:${imageId}`).digest('hex');
    app.get('/api/printing', async () => printer.status());
    app.get('/api/admin/printer', async () => ({ ...printer.status(), settings: printer.settings() || { enabled: false }, queues: printer.supported ? await printer.queues() : [] }));
    app.get<{ Querystring: { queue: string } }>('/api/admin/printer/options', async req => ({ options: await printer.options(req.query.queue) }));
    app.put('/api/admin/printer', async req => {
        if (tasks.size) throw fail('正在提交打印，请稍后修改设置。', 409);
        return printer.save(req.body as PrinterSettings);
    });
    app.get<{ Params: { id: string; imageId: string } }>('/api/sessions/:id/print/:imageId', async req => {
        photo(req.params.id, req.params.imageId);
        return { job: get(idFor(req.params.id, req.params.imageId)) || null };
    });
    app.post<{ Params: { id: string }; Body: { imageId: string } }>('/api/sessions/:id/print', { bodyLimit: 2048 }, async req => {
        const sessionId = req.params.id, imageId = req.body?.imageId;
        if (typeof imageId !== 'string' || imageId.length > 100) throw fail('请选择生成照片。');
        const source = photo(sessionId, imageId);
        const id = idFor(sessionId, imageId), existing = get(id);
        if (existing && existing.status !== 'failed') return existing;
        if (tasks.size) throw fail('正在提交上一张照片，请稍后再试。', 409);
        const job: PrintJob = { id, sessionId, imageId, status: 'preparing', createdAt: now() };
        put(job); // Persist before awaiting anything, so duplicate clicks cannot dispatch twice.
        const filename = path.join(directory, `${randomUUID()}.jpg`);
        const task = Promise.resolve().then(async () => {
            try {
                const settings = await printer.prepare();
                const image = await framePhoto(source.photo, source.frame, source.caption);
                photo(sessionId, imageId); // Recheck expiry/end after asynchronous rendering.
                writeFileSync(filename, image, { flag: 'wx', mode: 0o600 });
                job.queue = settings.queue; job.copies = settings.copies;
                job.status = 'submitting'; put(job);
                job.cupsId = await printer.submit(filename, settings, `SNAP-${id.slice(0, 12)}`);
                job.status = 'submitted'; job.error = undefined; put(job);
            } catch (error) {
                const uncertain = job.status === 'submitting';
                job.status = uncertain ? 'unknown' : 'failed';
                job.error = uncertain ? '提交结果不确定，请检查系统打印队列，勿重复打印。' :
                    (error as { statusCode?: number }).statusCode ? (error as Error).message : '打印准备失败，请检查打印机连接与设置。';
                put(job);
            } finally { rmSync(filename, { force: true }); }
        });
        tasks.add(task);
        try { await task; } finally { tasks.delete(task); }
        return get(id)!;
    });
    return { close: () => Promise.allSettled([...tasks]) };
}

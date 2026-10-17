/** Staff copy of each finished photo for reprints. Lives outside data/sessions, so expiry never removes it. */
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
interface ArchivedSession { id: string; createdAt: number; styleName?: string }
const pad = (n: number) => String(n).padStart(2, '0');
// Windows-safe file name: drop reserved characters and trailing dots/spaces.
const safe = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/[. ]+$/, '').slice(0, 40) || '照片';
export function createPhotoArchive(dir: string | undefined) {
    const pending = new Map<string, Promise<void>>();
    const target = (s: ArchivedSession, label: string) => {
        const at = new Date(s.createdAt);
        const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
        const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
        // One folder per visit: 原图, AI图 and the print version side by side.
        return path.join(dir!, `${day}_${time}_${safe(s.styleName ?? '')}`, `${label}.jpg`);
    };
    /** Writes are queued per file so a later frame choice always lands last. Failures are logged, never thrown. */
    const save = (s: ArchivedSession, label: string, image: Buffer | (() => Promise<Buffer>)) => {
        if (!dir) return;
        const file = target(s, label);
        const next = (pending.get(file) ?? Promise.resolve()).then(async () => {
            const buffer = typeof image === 'function' ? await image() : image;
            mkdirSync(path.dirname(file), { recursive: true });
            const temporary = `${file}.${randomUUID()}.part`;
            try { writeFileSync(temporary, buffer); renameSync(temporary, file); }
            finally { rmSync(temporary, { force: true }); }
        }).catch(error => console.error('照片留底保存失败', file, error));
        pending.set(file, next);
        void next.finally(() => { if (pending.get(file) === next) pending.delete(file); });
    };
    /** Synchronous write for the printer: returns the kept file so the job prints exactly what staff can reprint. */
    const keep = (s: ArchivedSession, label: string, image: Buffer) => {
        if (!dir) return;
        const file = target(s, label), temporary = `${file}.${randomUUID()}.part`;
        mkdirSync(path.dirname(file), { recursive: true });
        try { writeFileSync(temporary, image); renameSync(temporary, file); }
        finally { rmSync(temporary, { force: true }); }
        return file;
    };
    return { dir, save, keep, file: target, close: () => Promise.allSettled([...pending.values()]) };
}

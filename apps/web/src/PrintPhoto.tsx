import { useEffect, useRef, useState } from 'react';
import { api } from './api';

import type { PrintJob } from '../../../packages/shared/printing';

export function PrintPhoto({ sessionId, imageId, disabled }: { sessionId: string; imageId?: string; disabled: boolean }) {
    const [config, setConfig] = useState<{ supported: boolean; configured: boolean }>();
    const [job, setJob] = useState<PrintJob | null>(null);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
    const pending = useRef(false), version = useRef(0);
    useEffect(() => {
        const current = ++version.current;
        setJob(null); setConfig(undefined); setError(''); setUncertain(false); setBusy(false); pending.current = false;
        if (!imageId) return;
        void Promise.all([api<{ supported: boolean; configured: boolean }>('/api/printing'), api<{ job: PrintJob | null }>(`/api/sessions/${sessionId}/print/${imageId}`)])
            .then(([settings, state]) => { if (current === version.current) { setConfig(settings); setJob(state.job); } })
            .catch(e => { if (current === version.current) setError(e.message); });
        return () => { version.current++; };
    }, [sessionId, imageId]);
    const submitted = job && ['preparing', 'submitting', 'submitted', 'unknown'].includes(job.status);
    const refresh = async () => {
        const current = version.current;
        try {
            const [settings, state] = await Promise.all([api<{ supported: boolean; configured: boolean }>('/api/printing'), api<{ job: PrintJob | null }>(`/api/sessions/${sessionId}/print/${imageId}`)]);
            if (current === version.current) { setConfig(settings); setJob(state.job); setError(''); setUncertain(false); }
        } catch (e) { if (current === version.current) setError((e as Error).message); }
    };
    return <div className="photo-print-action" style={{ width: '100%', margin: 0 }}>
        <button className="primary" style={{ width: '100%' }} disabled={disabled || !imageId || !config?.configured || busy || !!submitted || uncertain} onClick={async () => {
            if (pending.current) return;
            pending.current = true; setBusy(true); setError(''); const current = version.current;
            try { const result = await api<PrintJob>(`/api/sessions/${sessionId}/print`, { imageId }); if (current === version.current) setJob(result); }
            catch { if (current === version.current) { setUncertain(true); setError('连接中断，请查询打印状态。'); } }
            finally { if (current === version.current) { pending.current = false; setBusy(false); } }
        }}>{busy || job?.status === 'preparing' || job?.status === 'submitting' ? '正在提交…' : job?.status === 'submitted' ? '已提交打印' : '打印照片'}</button>
        {config && !config.configured && <p className="muted">{config.supported ? '请先在设备设置中确认打印机和相纸。' : '请在连接打印机的 Mac 上打印。'}</p>}
        {job?.status === 'submitted' && <p role="status">已提交 {job.copies} 张 · {job.cupsId}</p>}
        {(error || job?.error) && <p className="error" role="alert">{error || job?.error}</p>}
        {(error || job || !config?.configured) && <button className="text-button" type="button" disabled={!imageId || busy} onClick={() => void refresh()}>查询打印状态</button>}
    </div>;
}

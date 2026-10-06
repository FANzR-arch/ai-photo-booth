import { useEffect, useRef, useState } from 'react';
import { api } from './api';

import type { PrintJob } from '../../../packages/shared/printing';

/** `hideWhenUnavailable` keeps printer setup notes off the visitor screen when no printer is configured. */
export function PrintPhoto({ sessionId, imageId, disabled, hideWhenUnavailable = false }: { sessionId: string; imageId?: string; disabled: boolean; hideWhenUnavailable?: boolean }) {
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
    const printing = busy || !!job && ['preparing', 'submitting', 'submitted'].includes(job.status);
    const unknown = uncertain || job?.status === 'unknown';
    if (hideWhenUnavailable && !job && !config?.configured) return null;
    return <div className="photo-print-action" data-print-status={busy ? 'preparing' : uncertain ? 'unknown' : job?.status || 'idle'} style={{ width: '100%', margin: 0 }}>
        <button className="primary" aria-live="polite" style={{ width: '100%' }} disabled={disabled || !imageId || !config?.configured || busy || !!submitted || uncertain} onClick={async () => {
            if (pending.current) return;
            pending.current = true; setBusy(true); setError(''); const current = version.current;
            try { const result = await api<PrintJob>(`/api/sessions/${sessionId}/print`, { imageId }); if (current === version.current) setJob(result); }
            catch (e) { if (current === version.current) {
                const failure = e as Error & { status?: number };
                const rejected = !!failure.status && failure.status >= 400 && failure.status < 500;
                setUncertain(!rejected);
                setError(rejected ? failure.message : '连接中断，请查询打印状态，确认前不要重复打印。');
            } }
            finally { if (current === version.current) { pending.current = false; setBusy(false); } }
        }}>{unknown ? '请确认打印状态' : printing ? '正在打印' : job?.status === 'failed' ? '重试打印' : '打印照片'}</button>
        {config && !config.configured && <p className="muted">{config.supported ? '请先设置打印机和相纸。' : '请在连接打印机的 Mac 上打印。'}</p>}
        {printing && job?.status === 'submitted' && <p className="print-status" role="status">{`已提交${job.copies ? ` ${job.copies} 张` : ''}，请等待出纸。`}</p>}
        {unknown && !error && !job?.error && <p className="print-status" role="status">请查询状态并检查打印机，勿重复打印。</p>}
        {(error || job?.error) && <p className="error" role="alert">{error || job?.error}</p>}
        {(error || job || !config?.configured) && <button className="text-button" type="button" disabled={!imageId || busy} onClick={() => void refresh()}>查询打印状态</button>}
    </div>;
}

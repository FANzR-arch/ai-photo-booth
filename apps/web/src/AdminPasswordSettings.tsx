import { useState } from 'react';
import { api } from './api';

/** Changing the password signs out every other open workbench; this one stays unlocked. */
export function AdminPasswordSettings() {
    const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    const mismatch = !!confirm && next !== confirm;
    return <section className="admin-panel password-panel"><div className="section-line"><h2>修改密码</h2></div>
        {error && <p className="error" role="alert">{error}</p>}
        <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy || mismatch) return; setBusy(true); setError(''); setMessage('');
            try { await api('/api/admin/auth/password', { currentPassword: current, newPassword: next }); setCurrent(''); setNext(''); setConfirm(''); setMessage('密码已修改'); }
            catch (cause) { setError((cause as Error).message); }
            finally { setBusy(false); }
        }}>
            <label>当前密码<input type="password" autoComplete="current-password" value={current} maxLength={128} onChange={e => setCurrent(e.target.value)} required /></label>
            <label>新密码<input type="password" autoComplete="new-password" value={next} minLength={8} maxLength={128} onChange={e => setNext(e.target.value)} required /></label>
            <label>再次输入新密码<input type="password" autoComplete="new-password" value={confirm} minLength={8} maxLength={128} onChange={e => setConfirm(e.target.value)} required /></label>
            {mismatch && <p className="error">两次输入不一致</p>}
            <div className="button-row"><button className="primary" disabled={busy || !current || next.length < 8 || next !== confirm}>{busy ? '正在保存…' : '修改密码'}</button></div>
            <p role="status">{message}</p>
        </form>
    </section>;
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { Brand } from './Brand';
type Status = { configured: boolean; authenticated: boolean; idleTimeoutMs: number };

export function AdminAccess({ children }: { children: (lock: () => Promise<void>) => ReactNode }) {
    const [status, setStatus] = useState<Status>();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const activity = useRef(Date.now()), lastTouch = useRef(Date.now()), alive = useRef(true);
    const lock = async () => {
        setStatus(value => value && { ...value, authenticated: false }); setPassword('');
        try { await api('/api/admin/auth/logout', {}); }
        catch { if (alive.current) setError('界面已锁定。连接恢复后请重新登录；服务端登录最迟在闲置 10 分钟后失效。'); }
    };
    useEffect(() => {
        alive.current = true;
        void api<Status>('/api/admin/auth/status').then(value => { if (alive.current) setStatus(value); }).catch(e => { if (alive.current) setError(e.message); });
        return () => { alive.current = false; };
    }, []);
    useEffect(() => {
        if (!status?.authenticated) return;
        activity.current = lastTouch.current = Date.now();
        let touching = false, active = true;
        const check = () => {
            if (Date.now() - activity.current >= status.idleTimeoutMs) { setError('工作台因长时间无操作已自动锁定。'); void lock(); return false; }
            return true;
        };
        const touched = () => { if (check()) activity.current = Date.now(); };
        const expired = () => { setError('管理员登录已失效，请重新登录。'); void lock(); };
        const leave = () => {
            setStatus(value => value && { ...value, authenticated: false }); setPassword('');
            void fetch('/api/admin/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', keepalive: true }).catch(() => {});
        };
        const interval = setInterval(() => {
            if (!check() || touching || activity.current <= lastTouch.current || Date.now() - lastTouch.current < 20_000) return;
            touching = true;
            void api('/api/admin/auth/touch', {}).then(() => { if (active) lastTouch.current = Date.now(); }).catch(() => { if (active) expired(); }).finally(() => { touching = false; });
        }, 1000);
        for (const event of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(event, touched);
        document.addEventListener('visibilitychange', check);
        window.addEventListener('snap-admin-expired', expired);
        window.addEventListener('pagehide', leave);
        return () => {
            active = false; clearInterval(interval);
            for (const event of ['pointerdown', 'keydown', 'wheel']) window.removeEventListener(event, touched);
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('snap-admin-expired', expired);
            window.removeEventListener('pagehide', leave);
        };
    }, [status?.authenticated]);
    if (status?.authenticated) return <>{children(lock)}</>;
    return <div className="shell admin"><header><Brand /><a className="button secondary" href="/">返回拍照亭 ↗</a></header><main className="admin-unlock">
        <span className="eyebrow">DEVICE WORKSPACE</span><h1>解锁设备工作台</h1>
        <p>仅供设备管理员使用。登录后可配置设备、管理主题和查看订单。</p>
        {error && <p className="error" role="alert">{error}</p>}
        {!status ? <p>{error ? '请检查服务连接后刷新页面。' : '正在检查工作台…'}</p> : <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy) return; setBusy(true); setError('');
            try { const value = await api<Status>(status.configured ? '/api/admin/auth/login' : '/api/admin/auth/setup', { password }); setPassword(''); setStatus(value); }
            catch (cause) { setError((cause as Error).message); setPassword(''); try { setStatus(await api<Status>('/api/admin/auth/status')); } catch {} }
            finally { setBusy(false); }
        }}>{!status.configured && <p>首次使用，设置一个至少 8 位的密码。以后用这个密码解锁。</p>}<label>管理员密码<input type="password" autoComplete={status.configured ? 'current-password' : 'new-password'} value={password} minLength={status.configured ? 1 : 8} maxLength={128} onChange={e => setPassword(e.target.value)} autoFocus required /></label><button className="primary" disabled={busy || !password}>{busy ? '正在解锁…' : status.configured ? '解锁工作台' : '设置并解锁'}</button><p className="muted">闲置 10 分钟自动锁定。</p></form>}
    </main></div>;
}

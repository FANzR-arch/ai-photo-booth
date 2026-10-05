import { useEffect, useRef, useState } from 'react';
import { cameraConstraints, cameraFailure, countdownOptions, countdownSeconds, saveCamera, saveCountdown, selectedCamera } from './camera-settings';

export function AdminCameraSettings() {
    const [device, setDevice] = useState(selectedCamera), [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [countdown, setCountdown] = useState(countdownSeconds), [countdownMessage, setCountdownMessage] = useState('');
    const [enabled, setEnabled] = useState(false), [attempt, setAttempt] = useState(0), [ready, setReady] = useState(false);
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [resolution, setResolution] = useState('');
    const video = useRef<HTMLVideoElement>(null);
    const currentStream = useRef<MediaStream | null>(null);
    useEffect(() => {
        if (!enabled) return;
        let active = true, stream: MediaStream | undefined;
        setError(''); setMessage(''); setReady(false); setResolution('');
        if (!navigator.mediaDevices?.getUserMedia) { setError('请在这台电脑使用 localhost 打开，并允许摄像头权限。'); return; }
        const enumerate = async () => {
            try { const all = await navigator.mediaDevices.enumerateDevices(); if (active) setDevices(all.filter(item => item.kind === 'videoinput')); }
            catch { if (active) setError('无法读取摄像头列表，请检查浏览器权限。'); }
        };
        void enumerate();
        void navigator.mediaDevices.getUserMedia(cameraConstraints(device)).then(async result => {
            if (!active) { result.getTracks().forEach(track => track.stop()); return; }
            stream = result;
            currentStream.current = result;
            result.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (active) { setReady(false); setError('摄像头已断开，请重新连接。'); } }, { once: true }));
            await enumerate();
            if (!active) return;
            const settings = result.getVideoTracks()[0]?.getSettings();
            if (settings?.width && settings.height) setResolution(`${settings.width} × ${settings.height}`);
            if (video.current) { video.current.srcObject = result; await video.current.play(); }
        }).catch(cause => { if (active) { stream?.getTracks().forEach(track => track.stop()); setError(cameraFailure(cause.name)); setReady(false); } });
        navigator.mediaDevices.addEventListener?.('devicechange', enumerate);
        return () => { active = false; stream?.getTracks().forEach(track => track.stop()); if (currentStream.current === stream) currentStream.current = null; navigator.mediaDevices.removeEventListener?.('devicechange', enumerate); };
    }, [device, enabled, attempt]);
    return <section className="admin-panel"><div className="section-line"><h2>摄像头</h2></div>

        {error && <p className="error" role="alert">{error}</p>}
        {enabled && <div className="admin-camera-preview"><video ref={video} muted playsInline autoPlay className="mirror" onPlaying={e => { if (currentStream.current?.active && e.currentTarget.videoWidth > 0 && e.currentTarget.videoHeight > 0) setReady(true); }} onWaiting={() => setReady(false)} />{!ready && <span>{error ? '预览不可用' : '正在连接摄像头…'}</span>}</div>}
        <div className="editor-fields"><label>使用的摄像头<select value={device} disabled={!enabled} onChange={e => { setReady(false); setDevice(e.target.value); }}><option value="">系统默认摄像头</option>{device && !devices.some(item => item.deviceId === device) && <option value={device}>之前选择的摄像头（尚未识别）</option>}{devices.map((item, i) => <option key={item.deviceId || i} value={item.deviceId}>{item.label || `摄像头 ${i + 1}`}</option>)}</select></label>
        {resolution && <p className="muted">当前预览分辨率：{resolution}</p>}
        <label>拍照倒计时<select value={countdown} onChange={e => { const value = Number(e.target.value); setCountdown(value); try { saveCountdown(value); setCountdownMessage(`已保存：${value} 秒`); } catch { setCountdownMessage('浏览器禁止保存设置，请检查站点存储权限。'); } }}>{countdownOptions.map(seconds => <option key={seconds} value={seconds}>{seconds} 秒{seconds === 5 ? '（默认）' : ''}</option>)}</select></label>
        <p className="muted">顾客按下拍照后，倒计时期间可以退到约一米外；取景框会实时提示“退后 / 靠近 / 距离正好”。{countdownMessage}</p>
        <div className="button-row"><button className="secondary" onClick={() => { setEnabled(true); setAttempt(value => value + 1); }}>{enabled ? '重新连接 / 刷新列表' : '打开摄像头预览'}</button><button className="primary" disabled={!enabled || !ready} onClick={() => { try { saveCamera(device); setMessage('已保存'); } catch { setError('浏览器禁止保存设置，请检查站点存储权限。'); } }}>保存为拍照摄像头</button>{enabled && <button className="text-button" onClick={() => { setEnabled(false); setReady(false); }}>关闭预览</button>}</div><p role="status">{message}</p></div>

    </section>;
}

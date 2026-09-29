import { useEffect, useState } from 'react';
import { api } from './api';
import { Brand } from './Brand';
import { timeLeft, usePhotoClock } from './PhotoLibrary';

type PickupData = { expiresAt: number; mode: string; images: { id: string; downloadUrl: string }[] };

/** A phone sees only photos authorized by its pickup token, never the kiosk's round library. */
export function Pickup() {
    const [data, setData] = useState<PickupData>();
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<string>();
    const now = Math.max(usePhotoClock(), Date.now());
    useEffect(() => {
        let active = true;
        api<PickupData>(`/api${location.pathname}`).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; };
    }, []);
    const expired = !!data && now >= data.expiresAt;
    useEffect(() => { if (expired) { setData(undefined); setSelected(undefined); setError('照片已到期并自动删除，已下载的照片不受影响。'); } }, [expired]);
    const images = selected ? data?.images.filter(i => i.id === selected) : data?.images;
    return <div className="shell"><header><Brand href={location.pathname} label="你的照片相册" /></header><main className="pickup">
        {selected && <button className="text-button" onClick={() => setSelected(undefined)}>← 返回相册</button>}
        <h1>{selected ? '查看照片' : '你的照片'}</h1>
        {error ? <div role="alert" className="error">{error}</div> : !data || expired ? <p role="status">正在打开你的相册…</p> : <>
            <p className="photo-expiry">剩余保存时间 {timeLeft(data.expiresAt, now)} · 到期自动删除</p>
            <p className="muted">请在 {new Date(data.expiresAt).toLocaleString('zh-CN')} 前下载。</p>
            <div className="results-grid">{images?.map((item, i) => <article className="photo-print" key={item.id}>
                {selected ? <img src={item.downloadUrl} alt={`已解锁高清照片 ${i + 1}`} /> : <button className="pickup-photo" onClick={() => setSelected(item.id)} aria-label={`查看照片 ${i + 1}`}><img src={item.downloadUrl} alt={`已解锁高清照片 ${i + 1}`} /></button>}
                <a className="button primary" download href={item.downloadUrl}>下载照片 {i + 1} ↗</a>
            </article>)}</div><p className="muted">无法保存时，请用浏览器打开。下载后请在手机相册或下载文件中查看。</p>
        </>}
    </main></div>;
}

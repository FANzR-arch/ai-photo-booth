import { useEffect, useState } from 'react';
import { api } from './api';
import { Brand } from './Brand';
import { timeLeft, usePhotoClock } from './PhotoLibrary';
import type { PickupData } from '../../../packages/shared/types';

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
    const photos = data ? [
        ...(data.original ? [{ id: 'original', downloadUrl: data.original.downloadUrl, title: '拍摄原片', original: true }] : []),
        ...data.images.map((item, index) => ({ ...item, title: data.images.length > 1 ? `AI 成片 ${index + 1}` : 'AI 成片', original: false }))
    ] : [];
    const images = selected ? photos.filter(item => item.id === selected) : photos;
    return <div className="shell"><header><Brand href={location.pathname} label="你的照片相册" /></header><main className="pickup">
        {selected && <button className="text-button" onClick={() => setSelected(undefined)}>← 返回相册</button>}
        <h1>{selected ? images[0]?.title || '查看照片' : '你的照片'}</h1>
        {error ? <div role="alert" className="error">{error}</div> : !data || expired ? <p role="status">正在打开你的相册…</p> : <>
            <p className="photo-expiry">{timeLeft(data.expiresAt, now)} 后自动删除，请及时保存</p>
            <div className="results-grid">{images.map(item => <article className={`photo-print${item.original ? ' pickup-original' : ''}`} key={item.id}>
                <div className="pickup-section-heading"><h2>{item.title}</h2></div>
                {selected ? <img src={item.downloadUrl} alt={item.title} /> : <button className="pickup-photo" onClick={() => setSelected(item.id)} aria-label={`查看${item.title}`}><img src={item.downloadUrl} alt={item.title} /></button>}
                <a className="button primary" download href={item.downloadUrl}>保存{item.title} ↓</a>
            </article>)}</div><p className="muted">无法保存？请在浏览器打开，或长按图片保存。</p>
        </>}
    </main></div>;
}

import { useEffect, useState } from 'react';

export function DisplayControls() {
    const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
    const [message, setMessage] = useState('');
    useEffect(() => {
        const update = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', update);
        return () => document.removeEventListener('fullscreenchange', update);
    }, []);
    const toggle = async () => {
        setMessage('');
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
            else setMessage('此浏览器不支持按钮全屏，可使用浏览器菜单或 F11。');
        } catch { setMessage('未能进入全屏，可使用浏览器菜单或 F11。'); }
    };
    return <div className="display-controls"><button className="secondary" onClick={toggle}>{fullscreen ? '退出全屏' : '全屏演示'}</button>{message && <span role="status">{message}</span>}</div>;
}

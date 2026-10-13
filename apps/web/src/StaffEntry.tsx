import { useEffect, useRef, useState } from 'react';
import { Brand } from './Brand';
import { DisplayControls } from './DisplayControls';
import { saveSkin, selectedSkin, skins } from './skin';

const holdMs = 3000;

/** Hold the logo for three seconds to reach staff controls; the homepage also links to device settings. */
export function StaffEntry() {
    const [open, setOpen] = useState(false);
    const [skin, setSkin] = useState(selectedSkin);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
    useEffect(() => cancel, []);
    return <>
        <div className="staff-entry" onPointerDown={() => { cancel(); timer.current = setTimeout(() => { timer.current = null; setOpen(true); }, holdMs); }}
            onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}>
            <Brand href={null} />
        </div>
        {open && <div className="kiosk-dialog" role="dialog" aria-modal="true" aria-label="工作人员菜单">
            <div className="kiosk-dialog-card">
                <h2>工作人员菜单</h2>
                <DisplayControls />
                <div className="skin-options" role="group" aria-label="界面风格"><span>界面风格（本机）</span>{skins.map(option => <button key={option.id} className="secondary" aria-pressed={skin === option.id}
                    onClick={() => { saveSkin(option.id); setSkin(option.id); }}>{option.name}</button>)}</div>
                <a className="button secondary" href="/admin">设备设置</a>
                <button className="text-button" onClick={() => setOpen(false)}>关闭</button>
            </div>
        </div>}
    </>;
}

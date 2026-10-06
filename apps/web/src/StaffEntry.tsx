import { useEffect, useRef, useState } from 'react';
import { Brand } from './Brand';
import { DisplayControls } from './DisplayControls';

const holdMs = 3000;

/** Visitors see only the logo; staff hold it for three seconds to reach fullscreen and device settings. */
export function StaffEntry() {
    const [open, setOpen] = useState(false);
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
                <a className="button secondary" href="/admin">设备设置</a>
                <button className="text-button" onClick={() => setOpen(false)}>关闭</button>
            </div>
        </div>}
    </>;
}

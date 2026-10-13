import React from 'react';
import { createRoot } from 'react-dom/client';
import { Booth, Pickup } from './Booth';
import { Admin } from './Admin';
import './styles.css';
import './editorial.css';
import './theme-gallery.css';
import './generation-preview.css';
import './studio-polish.css';
import './page-motion.css';
import './photo-frame.css';
import './photo-library.css';
import './booth-flow.css';
import './studio-refresh.css';
import './admin-workspace.css';
import './kiosk-touch.css';
import './wait/wait.css';
import './kiosk-polish.css';
import './skins/memphis.css';
import { applySkin } from './skin';
// The static demo build (vite.static-demo.config.ts) swaps the server for an in-browser stand-in before anything renders.
const staticDemo = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_STATIC_DEMO === '1';
async function start() {
    if (staticDemo) (await import('./demo/mock-api')).installDemoApi();
    applySkin();
    const path = location.pathname;
    createRoot(document.getElementById('root')!).render(path.startsWith('/pickup/') ? <Pickup /> : path === '/admin' ? <Admin /> : <Booth />);
}
void start();

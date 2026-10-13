import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Static demo for Cloudflare Pages: same kiosk UI, in-browser stand-in API (apps/web/src/demo), no server.
const outDir = path.resolve('dist/static-demo');
export default defineConfig({
    root: 'apps/web', plugins: [react(), { name: 'static-demo-output', closeBundle: () => {
        writeFileSync(path.join(outDir, '_redirects'), '/* /index.html 200\n'); // client-side routes such as /pickup/…
        rmSync(path.join(outDir, 'stages.html'), { force: true }); // developer stage previews are not part of the demo
    } }],
    publicDir: '../../assets', define: { 'import.meta.env.VITE_STATIC_DEMO': JSON.stringify('1') },
    build: { outDir, emptyOutDir: true },
});

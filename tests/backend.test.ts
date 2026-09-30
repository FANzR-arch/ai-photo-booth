import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { createApp, type AppOptions } from '../apps/server/app.js';
import { setAdminPassword } from '../apps/server/admin-auth.js';
async function fixture(options: AppOptions = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'booth-test-'));
    mkdirSync(path.join(root, 'config/styles'), { recursive: true });
    writeFileSync(path.join(root, 'config/styles/styles.json'), JSON.stringify([{ id: 'cinema', name: '电影', description: '测试', prompt: 'keep identity', version: 1, enabled: true, exampleUrl: '/examples/cinema.svg', size: '2K', color: '#f00' }]));
    const dataDir = path.join(root, 'data');
    await setAdminPassword(root, 'test-admin-password-only');
    let app = await createApp({ mode: 'demo', ...options, rootDir: root, dataDir });
    let cookie = '';
    const req = async (method: string, url: string, payload?: unknown) => {
        if (url.startsWith('/api/admin') && !cookie) {
            const login = await app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { password: 'test-admin-password-only' }, headers: { host: 'localhost:4377' } });
            assert.equal(login.statusCode, 200); cookie = String(login.headers['set-cookie']).split(';')[0];
        }
        return app.inject({ method: method as any, url, payload: payload as any, headers: { host: 'localhost:4377', cookie } });
    };
    const photo = await sharp({ create: { width: 160, height: 200, channels: 3, background: '#f2a399' } }).jpeg().toBuffer();
    const make = async () => { const s = (await req('POST', '/api/sessions', { styleId: 'cinema' })).json(); assert.ok(s.id); assert.equal((await req('POST', `/api/sessions/${s.id}/photo`, { dataUrl: `data:image/jpeg;base64,${photo.toString('base64')}`, orientation: 'portrait' })).statusCode, 200); return s.id as string; };
    const finish = async (id: string) => { for (let i = 0; i < 100; i++) {
        const s = (await req('GET', `/api/sessions/${id}`)).json();
        if (s.status !== 'generating')
            return s;
        await new Promise(r => setTimeout(r, 10));
    } throw Error('generation did not finish'); };
    return { root, dataDir, photo, req, make, finish, get app() { return app; }, restart: async () => { await app.close(); cookie = ''; app = await createApp({ mode: 'demo', ...options, rootDir: root, dataDir }); }, close: async () => { await app.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('new bundled styles are added on restart without overwriting saved prompts or switches', async () => {
    const f = await fixture();
    try {
        const original = (await f.req('GET', '/api/admin')).json().styles[0];
        await f.req('PUT', '/api/admin/styles/cinema', { ...original, prompt: 'my custom prompt', enabled: false });
        writeFileSync(path.join(f.root, 'config/styles/styles.json'), JSON.stringify([
            { ...original, prompt: 'new bundled prompt' },
            { ...original, id: 'film', name: '复古胶片' },
        ]));
        await f.restart();
        const styles = (await f.req('GET', '/api/admin')).json().styles;
        const saved = styles.find((s: any) => s.id === 'cinema');
        assert.equal(saved.prompt, 'my custom prompt');
        assert.equal(saved.version, 2);
        assert.equal(saved.enabled, false);
        assert.equal(styles.filter((s: any) => s.id === 'film').length, 1);
        await f.restart();
        assert.equal((await f.req('GET', '/api/admin')).json().styles.length, 2);
    } finally { await f.close(); }
});
test('unresolved theme cannot be enabled; resolving variables increments version and permits a session', async () => {
    const f = await fixture();
    try {
        const original = (await f.req('GET', '/api/admin')).json().styles[0];
        const draft = { ...original, prompt: 'Portrait in {{城市}}', enabled: false };
        assert.equal((await f.req('PUT', '/api/admin/styles/cinema', draft)).statusCode, 200);
        assert.equal((await f.req('PUT', '/api/admin/styles/cinema', { ...draft, enabled: true })).statusCode, 400);
        assert.equal((await f.req('POST', '/api/sessions', { styleId: 'cinema' })).statusCode, 400);
        const saved = await f.req('PUT', '/api/admin/styles/cinema', { ...draft, prompt: 'Portrait in Taipei', enabled: true });
        assert.equal(saved.json().version, 3);
        assert.equal((await f.req('POST', '/api/sessions', { styleId: 'cinema' })).statusCode, 200);
    } finally { await f.close(); }
});
test('demo flow preserves locked image authorization, idempotent paid order and pickup after end', async () => {
    const f = await fixture({ imageCount: 2 });
    try {
        const id = await f.make();
        const start = await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal(start.json().status, 'generating');
        const s = await f.finish(id);
        assert.equal(s.status, 'ready');
        assert.equal(s.mode, 'demo');
        assert.equal(s.images.length, 2);
        assert.equal((await f.req('GET', s.images[0].previewUrl)).headers['content-type'], 'image/jpeg');
        const order = (await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: [s.images[0].id] })).json();
        assert.equal(order.amount, 990);
        assert.equal((await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: [s.images[0].id] })).json().id, order.id);
        const paid = (await f.req('POST', `/api/orders/${order.id}/simulate`, { outcome: 'paid' })).json();
        const token = new URL(paid.pickupUrl).pathname.split('/').pop();
        assert.equal((await f.req('POST', `/api/orders/${order.id}/simulate`, { outcome: 'failed' })).json().order.status, 'paid');
        const pickup = (await f.req('GET', `/api/pickup/${token}`)).json();
        assert.equal(pickup.images.length, 1);
        assert.equal((await f.req('GET', pickup.images[0].downloadUrl)).statusCode, 200);
        assert.equal((await f.req('GET', `/api/pickup/${token}/images/${s.images[1].id}`)).statusCode, 404);
        await f.req('POST', `/api/sessions/${id}/end`, {});
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).statusCode, 410);
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).statusCode, 200);
        await f.restart();
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).statusCode, 200);
    }
    finally {
        await f.close();
    }
});
test('duplicate generation makes one upstream call; finished task cannot regenerate', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(r => release = r);
    const photo = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'blue' } }).jpeg().toBuffer();
    const f = await fixture({ mode: 'seedream', imageCount: 1, provider: async () => { calls++; await gate; return { images: [photo], requestId: 'test-request' }; } });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal(calls, 1);
        release();
        const s = await f.finish(id);
        assert.equal(s.requestId, 'test-request');
        assert.equal(s.promptVersion, 1);
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal(calls, 1);
    }
    finally {
        release();
        await f.close();
    }
});
test('clothing choice reaches the provider, survives restart, and cannot change an existing generation', async () => {
    const prompts: string[] = [];
    const f = await fixture({ mode: 'seedream', provider: async input => { prompts.push(input.prompt); return { images: [input.photo] }; } });
    try {
        const style = (await f.req('GET', '/api/admin')).json().styles[0];
        await f.req('PUT', '/api/admin/styles/cinema', { ...style, prompt: '身体侧转30度，双臂交叉，微笑看镜头。', outfitPrompt: '藏蓝夹克与米白衬衫。' });
        const original = await f.make();
        assert.equal((await f.req('GET', `/api/sessions/${original}`)).json().clothingMode, 'keep');
        await f.req('POST', `/api/sessions/${original}/generate`, {}); await f.finish(original);
        assert.match(prompts[0], /用户选择：保留原服装/); assert.doesNotMatch(prompts[0], /藏蓝夹克与米白衬衫/);

        const changed = await f.make();
        const upload = await f.req('POST', `/api/sessions/${changed}/photo`, { dataUrl: `data:image/jpeg;base64,${f.photo.toString('base64')}`, orientation: 'landscape', clothingMode: 'theme' });
        assert.equal(upload.json().clothingMode, 'theme');
        await f.restart();
        assert.equal((await f.req('GET', `/api/sessions/${changed}`)).json().clothingMode, 'theme');
        await f.req('POST', `/api/sessions/${changed}/generate`, {}); await f.finish(changed);
        assert.match(prompts[1], /用户选择：按主题换装/); assert.match(prompts[1], /藏蓝夹克与米白衬衫/); assert.match(prompts[1], /画面比例严格为4:3/);
        for (const prompt of prompts) {
            assert.match(prompt, /身体侧转30度，双臂交叉，微笑看镜头/);
            assert.match(prompt, /人脸一致性是最高优先级/);
            assert.match(prompt, /服装是否更换不限制动作设计/);
            assert.doesNotMatch(prompt, /不改变身体比例、动作或互动|保留姿态、人物间的相对位置|沿用原照睁闭眼状态/);
        }
        const repeated = await f.req('POST', `/api/sessions/${changed}/generate`, { clothingMode: 'keep' });
        assert.equal(repeated.json().clothingMode, 'theme'); assert.equal(prompts.length, 2);
        assert.equal((await f.req('POST', `/api/sessions/${changed}/photo`, { dataUrl: `data:image/jpeg;base64,${f.photo.toString('base64')}`, orientation: 'portrait', clothingMode: 'keep' })).statusCode, 409);
        await f.restart();
        assert.equal((await f.req('GET', `/api/sessions/${changed}`)).json().clothingMode, 'theme');
        assert.equal((await f.req('GET', '/api/styles')).json()[0].outfitPrompt, undefined);
    } finally { await f.close(); }
});

test('invalid clothing options are rejected before uploading or calling the provider; restored photos accept a new choice before generation', async () => {
    let calls = 0;
    const f = await fixture({ mode: 'seedream', provider: async input => { calls++; assert.match(input.prompt, /用户选择：按主题换装/); return { images: [input.photo] }; } });
    try {
        const id = await f.make();
        for (const clothingMode of [true, null, 'custom', '', {}]) {
            assert.equal((await f.req('POST', `/api/sessions/${id}/photo`, { dataUrl: `data:image/jpeg;base64,${f.photo.toString('base64')}`, orientation: 'portrait', clothingMode })).statusCode, 400);
            assert.equal((await f.req('POST', `/api/sessions/${id}/generate`, { clothingMode })).statusCode, 400);
        }
        assert.equal(calls, 0);
        await f.req('POST', `/api/sessions/${id}/generate`, { clothingMode: 'theme' });
        assert.equal((await f.finish(id)).clothingMode, 'theme'); assert.equal(calls, 1);
    } finally { await f.close(); }
});

test('wardrobe migration updates only bundled prompts and never overwrites saved outfit edits or past snapshots', async () => {
    const f = await fixture();
    try {
        const old = (await f.req('GET', '/api/admin')).json().styles[0];
        const id = await f.make(); await f.req('POST', `/api/sessions/${id}/generate`, {}); await f.finish(id);
        writeFileSync(path.join(f.root, 'config/styles/wardrobe-migration.json'), JSON.stringify({ cinema: createHash('sha256').update(old.prompt).digest('hex') }));
        writeFileSync(path.join(f.root, 'config/styles/styles.json'), JSON.stringify([{ ...old, prompt: '主题视觉，不写服装规则。', outfitPrompt: '棕色外套。', version: 2 }]));
        await f.restart();
        let style = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(style.prompt, '主题视觉，不写服装规则。'); assert.equal(style.outfitPrompt, '棕色外套。'); assert.equal(style.version, 2);
        const db = new DatabaseSync(path.join(f.dataDir, 'booth.sqlite'));
        try { assert.equal(JSON.parse(String(db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(id)!.json)).snapshot.prompt, old.prompt); } finally { db.close(); }
        await f.restart(); assert.equal((await f.req('GET', '/api/admin')).json().styles[0].version, 2);
        await f.req('PUT', '/api/admin/styles/cinema', { ...style, prompt: 'custom visual', outfitPrompt: 'custom clothing', enabled: false });
        await f.restart(); style = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(style.prompt, 'custom visual'); assert.equal(style.outfitPrompt, 'custom clothing'); assert.equal(style.enabled, false); assert.equal(style.version, 3);
        // Older admin clients omit this field; they must not silently clear it.
        const { outfitPrompt: _omitted, ...legacy } = style;
        assert.equal((await f.req('PUT', '/api/admin/styles/cinema', legacy)).json().outfitPrompt, 'custom clothing');
        assert.equal((await f.req('PUT', '/api/admin/styles/cinema', { ...style, outfitPrompt: '' })).statusCode, 400);
    } finally { await f.close(); }
});

test('quality upgrade reaches new generations while preserving settings, custom edits and existing snapshots', async () => {
    const received: { prompt: string; size: string }[] = [];
    const f = await fixture({ mode: 'seedream', provider: async input => { received.push(input); return { images: [input.photo] }; } });
    try {
        const original = (await f.req('GET', '/api/admin')).json().styles[0];
        await f.req('PUT', '/api/admin/styles/cinema', { ...original, name: '店内主题', outfitPrompt: '店内藏蓝夹克。' });
        const oldSession = await f.make();
        await f.req('POST', `/api/sessions/${oldSession}/generate`, {});
        assert.equal((await f.finish(oldSession)).status, 'ready');
        const fresh = await f.make();
        const bundled = JSON.parse(readFileSync('config/styles/styles.json', 'utf8')).find((s: any) => s.id === 'cinema');
        writeFileSync(path.join(f.root, 'config/styles/quality-migration.json'), JSON.stringify({ cinema: createHash('sha256').update(original.prompt).digest('hex') }));
        writeFileSync(path.join(f.root, 'config/styles/styles.json'), JSON.stringify([bundled]));
        await f.restart();
        const upgraded = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(upgraded.prompt, bundled.prompt);
        assert.equal(upgraded.name, '店内主题');
        assert.equal(upgraded.size, original.size);
        assert.equal(upgraded.outfitPrompt, '店内藏蓝夹克。');
        await f.restart();
        assert.equal((await f.req('GET', '/api/admin')).json().styles[0].version, upgraded.version);

        const db = new DatabaseSync(path.join(f.dataDir, 'booth.sqlite'));
        try { assert.equal(JSON.parse(String(db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(oldSession)!.json)).snapshot.prompt, original.prompt); } finally { db.close(); }
        assert.ok(received[0].prompt.includes(original.prompt));
        assert.equal(received[0].prompt.includes(bundled.prompt), false);
        await f.req('POST', `/api/sessions/${fresh}/photo`, { dataUrl: `data:image/jpeg;base64,${f.photo.toString('base64')}`, orientation: 'landscape', clothingMode: 'theme' });
        await f.req('POST', `/api/sessions/${fresh}/generate`, {});
        assert.equal((await f.finish(fresh)).status, 'ready');
        assert.equal(received.length, 2);
        assert.ok(received[1].prompt.includes(bundled.prompt));
        assert.match(received[1].prompt, /店内藏蓝夹克/);
        assert.match(received[1].prompt, /合照景深覆盖每个人的面部/);
        assert.match(received[1].prompt, /不拉伸人物、不裁掉合照边缘的人/);
        assert.doesNotMatch(received[1].prompt, /3:4/);
        assert.equal(received[1].size, '2048x1536');

        const custom = (await f.req('PUT', '/api/admin/styles/cinema', { ...upgraded, prompt: '我的水彩提示词', outfitPrompt: '我的搭配', enabled: false })).json();
        await f.restart();
        const saved = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(saved.prompt, custom.prompt); assert.equal(saved.outfitPrompt, custom.outfitPrompt);
        assert.equal(saved.enabled, false); assert.equal(saved.version, custom.version);
    } finally { await f.close(); }
});

test('pose migration upgrades exact bundled visual and outfit rules independently without changing custom content or past snapshots', async () => {
    const f = await fixture();
    try {
        const original = (await f.req('GET', '/api/admin')).json().styles[0];
        const old = (await f.req('PUT', '/api/admin/styles/cinema', { ...original, outfitPrompt: '棕色外套，顺应原有姿态。' })).json();
        const id = await f.make(); await f.req('POST', `/api/sessions/${id}/generate`, {}); await f.finish(id);
        const hash = (value: string) => createHash('sha256').update(value).digest('hex');
        const upgraded = { ...old, prompt: '身体微侧、抬手，严格保留五官。', outfitPrompt: '棕色外套，顺应新姿势。', version: old.version + 1 };
        writeFileSync(path.join(f.root, 'config/styles/pose-migration.json'), JSON.stringify({ cinema: { prompt: hash(old.prompt), outfitPrompt: hash(old.outfitPrompt) } }));
        writeFileSync(path.join(f.root, 'config/styles/styles.json'), JSON.stringify([upgraded]));
        await f.restart();
        const saved = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(saved.prompt, upgraded.prompt); assert.equal(saved.outfitPrompt, upgraded.outfitPrompt);
        assert.equal(saved.version, upgraded.version);
        const db = new DatabaseSync(path.join(f.dataDir, 'booth.sqlite'));
        try {
            const snapshot = JSON.parse(String(db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(id)!.json)).snapshot;
            assert.equal(snapshot.prompt, old.prompt); assert.equal(snapshot.outfitPrompt, old.outfitPrompt);
        } finally { db.close(); }
        await f.restart(); assert.equal((await f.req('GET', '/api/admin')).json().styles[0].version, saved.version);

        // A saved visual edit must not prevent upgrading an untouched bundled outfit rule.
        await f.req('PUT', '/api/admin/styles/cinema', { ...saved, prompt: '自定义动作：抬手扶眼镜。', outfitPrompt: old.outfitPrompt, enabled: false });
        await f.restart();
        const visualEdit = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(visualEdit.prompt, '自定义动作：抬手扶眼镜。'); assert.equal(visualEdit.outfitPrompt, upgraded.outfitPrompt); assert.equal(visualEdit.enabled, false);
        // Conversely, a custom outfit must survive the visual upgrade, including on later restarts.
        await f.req('PUT', '/api/admin/styles/cinema', { ...visualEdit, prompt: old.prompt, outfitPrompt: '自定义红色针织衫。' });
        await f.restart();
        const outfitEdit = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(outfitEdit.prompt, upgraded.prompt); assert.equal(outfitEdit.outfitPrompt, '自定义红色针织衫。');
        await f.restart(); assert.equal((await f.req('GET', '/api/admin')).json().styles[0].version, outfitEdit.version);
    } finally { await f.close(); }
});

test('scene quality upgrades preserve custom fields and past snapshots, and run only once', async () => {
    const f = await fixture();
    try {
        const old = (await f.req('GET','/api/admin')).json().styles[0];
        const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
        const id = await f.make(); await f.req('POST',`/api/sessions/${id}/generate`,{}); await f.finish(id);
        await f.req('PUT','/api/admin/styles/cinema',{...old,prompt:'custom visual',exampleUrl:'/admin-examples/own.jpg',enabled:false});
        writeFileSync(path.join(f.root,'config/styles/scene-quality-migration.json'),JSON.stringify({cinema:{prompt:hash(old.prompt),exampleUrl:hash(old.exampleUrl),size:hash(old.size)}}));
        writeFileSync(path.join(f.root,'config/styles/styles.json'),JSON.stringify([{...old,prompt:'new default',exampleUrl:'/examples/new.webp',size:'HQ'}]));
        await f.restart();
        let saved = (await f.req('GET','/api/admin')).json().styles[0];
        assert.equal(saved.prompt,'custom visual');assert.equal(saved.exampleUrl,'/admin-examples/own.jpg');assert.equal(saved.enabled,false);assert.equal(saved.size,'HQ');
        const version=saved.version;
        await f.restart();saved=(await f.req('GET','/api/admin')).json().styles[0];assert.equal(saved.version,version);
        const db=new DatabaseSync(path.join(f.dataDir,'booth.sqlite'));
        const past=JSON.parse(String(db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(id)!.json));db.close();
        assert.equal(past.snapshot.prompt,old.prompt);assert.equal(past.snapshot.size,old.size);
    } finally {await f.close();}
});

test('directed scenes enforce each ratio, keep clothing choice, and send the complete scene to the provider', async () => {
    const received: {prompt:string;size:string}[]=[];
    const f=await fixture({mode:'seedream',provider:async input=>{received.push(input);return {images:[input.photo]};}});
    try {
        const scenes=JSON.parse(readFileSync('config/styles/styles.json','utf8')).filter((s:any)=>s.generationPreset==='directed-portrait'&&s.enabled);
        writeFileSync(path.join(f.root,'config/styles/styles.json'),JSON.stringify(scenes));await f.restart();
        for(const scene of scenes){
            const s=(await f.req('POST','/api/sessions',{styleId:scene.id})).json();
            assert.equal(s.orientation,scene.sceneOrientation);assert.equal(s.clothingMode,'theme');assert.equal(s.frame,'none');
            const payload={dataUrl:`data:image/jpeg;base64,${f.photo.toString('base64')}`,orientation:s.orientation,clothingMode:'keep'};
            assert.equal((await f.req('POST',`/api/sessions/${s.id}/photo`,{...payload,orientation:s.orientation==='portrait'?'landscape':'portrait'})).statusCode,400);
            assert.equal((await f.req('POST',`/api/sessions/${s.id}/photo`,payload)).statusCode,200);
            await f.req('POST',`/api/sessions/${s.id}/generate`,{clothingMode:'keep'});
            assert.equal((await f.finish(s.id)).status,'ready');
            const sent=received.at(-1)!;assert.ok(sent.prompt.includes(scene.prompt));assert.match(sent.prompt,/覆盖上文的换装描述/);
            assert.doesNotMatch(sent.prompt,/不新增文字、商标或道具/);
        }
        assert.equal(received.length,11);
    } finally {await f.close();}
});

test('scene upgrades accept multiple bundled revisions and preserve independent custom names and prompts', async () => {
    for (const variant of ['first','second','custom-name','custom-prompt']) {
        const f=await fixture();
        try {
            const old=(await f.req('GET','/api/admin')).json().styles[0];
            const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
            const selected={...old, name:variant==='custom-name'?'自定义名字':variant==='first'?old.name:'中间名称',
                prompt:variant==='custom-prompt'?'custom prompt':variant==='first'?old.prompt:'intermediate prompt',enabled:false};
            await f.req('PUT','/api/admin/styles/cinema',selected);
            writeFileSync(path.join(f.root,'config/styles/scene-quality-migration.json'),JSON.stringify({cinema:{
                name:[hash(old.name),hash('中间名称')],prompt:[hash(old.prompt),hash('intermediate prompt')],size:hash(old.size),
            }}));
            writeFileSync(path.join(f.root,'config/styles/styles.json'),JSON.stringify([{...old,name:'新名称',prompt:'adaptive wardrobe',size:'HQ'}]));
            await f.restart();
            const saved=(await f.req('GET','/api/admin')).json().styles[0];
            assert.equal(saved.name,variant==='custom-name'?'自定义名字':'新名称');
            assert.equal(saved.prompt,variant==='custom-prompt'?'custom prompt':'adaptive wardrobe');
            assert.equal(saved.enabled,false);assert.equal(saved.size,'HQ');
            await f.restart();
            assert.equal((await f.req('GET','/api/admin')).json().styles[0].version,saved.version);
        } finally {await f.close();}
    }
});

test('coming-of-age poster uses the supplied art direction, fixed 2:3 size and outfit across restart', async () => {
    const received: { prompt: string; size: string }[] = [];
    const f = await fixture({ mode: 'seedream', provider: async input => { received.push(input); return { images: [input.photo] }; } });
    try {
        const poster = JSON.parse(readFileSync('config/styles/styles.json', 'utf8')).find((s: any) => s.id === 'coming-of-age');
        writeFileSync(path.join(f.root, 'config/styles/styles.json'), JSON.stringify([poster]));
        await f.restart();
        const publicPoster = (await f.req('GET', '/api/styles')).json().find((s: any) => s.id === poster.id);
        assert.equal(publicPoster.generationPreset, 'coming-of-age'); assert.equal(publicPoster.prompt, undefined);
        const session = (await f.req('POST', '/api/sessions', { styleId: poster.id, purpose: 'memory' })).json();
        assert.equal(session.orientation, 'poster'); assert.equal(session.clothingMode, 'theme'); assert.equal(session.frame, 'none');
        const payload = { dataUrl: `data:image/jpeg;base64,${f.photo.toString('base64')}`, orientation: 'poster', clothingMode: 'theme' };
        assert.equal((await f.req('POST', `/api/sessions/${session.id}/photo`, { ...payload, orientation: 'landscape' })).statusCode, 400);
        assert.equal((await f.req('POST', `/api/sessions/${session.id}/photo`, { ...payload, clothingMode: 'keep' })).statusCode, 400);
        assert.equal(received.length, 0);
        assert.equal((await f.req('POST', `/api/sessions/${session.id}/photo`, payload)).statusCode, 200);
        await f.restart();
        const restored = (await f.req('GET', `/api/sessions/${session.id}`)).json();
        assert.equal(restored.orientation, 'poster'); assert.equal(restored.clothingMode, 'theme');
        assert.equal((await f.req('POST', `/api/sessions/${session.id}/generate`, { clothingMode: 'keep' })).statusCode, 400);
        await f.req('POST', `/api/sessions/${session.id}/generate`, {});
        assert.equal((await f.finish(session.id)).status, 'ready');
        assert.equal(received.length, 1); assert.equal(received[0].size, '1216x1824');
        assert.ok(received[0].prompt.includes(poster.prompt));
        for (const text of ['你好', '我的18岁', 'Hello, eighteen', 'Coming of age ceremony', 'Celebration', 'I am just right at every age', '露出上排牙齿', '约30度', '银白色薄浮雕']) assert.ok(received[0].prompt.includes(text), text);
        assert.doesNotMatch(received[0].prompt, /不生成文字|沿用原照睁闭眼状态|保留原服装|3:4|4:3|不新增手势/);
        assert.match(received[0].prompt, /不据此改变参考人物的真实年龄感/);
        const regular = await f.make();
        assert.equal((await f.req('POST', `/api/sessions/${regular}/photo`, payload)).statusCode, 400);
    } finally { await f.close(); }
});

test('unknown result blocks retry; explicitly failed request can retry', async () => {
    let calls = 0;
    const f = await fixture({ mode: 'seedream', provider: async () => { calls++; throw Object.assign(Error('上游超时'), { unknown: true }); } });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal((await f.finish(id)).status, 'unknown');
        assert.equal((await f.req('POST', `/api/sessions/${id}/generate`, {})).statusCode, 409);
        assert.equal(calls, 1);
    }
    finally {
        await f.close();
    }
    const g = await fixture({ mode: 'seedream', provider: async () => { throw Object.assign(Error('rate limited'), { unknown: false }); } });
    try {
        const id = await g.make();
        await g.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal((await g.finish(id)).status, 'failed');
        assert.equal((await g.req('POST', `/api/sessions/${id}/generate`, {})).statusCode, 200);
        await g.finish(id);
    }
    finally {
        await g.close();
    }
});
test('partial generation has one-image price; unrelated session cannot order its image', async () => {
    const photo = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const f = await fixture({ mode: 'seedream', imageCount: 2, provider: async () => ({ images: [photo], error: 'second image failed', unknown: true }) });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        const s = await f.finish(id);
        assert.equal(s.status, 'partial');
        assert.equal(s.error, 'second image failed');
        const o = (await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: s.images.map((x: any) => x.id) })).json();
        assert.equal(o.amount, 990);
        const id2 = await f.make();
        await f.req('POST', `/api/sessions/${id2}/generate`, {});
        await f.finish(id2);
        assert.equal((await f.req('POST', `/api/sessions/${id2}/orders`, { imageIds: [s.images[0].id] })).statusCode, 400);
    }
    finally {
        await f.close();
    }
});
test('expired links return 410 and startup cleanup removes images', async () => {
    let time = 1000;
    const f = await fixture({ clock: () => time, ttlMs: 10000 });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        const s = await f.finish(id);
        const o = (await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: [s.images[0].id] })).json();
        const p = (await f.req('POST', `/api/orders/${o.id}/simulate`, { outcome: 'paid' })).json();
        const token = new URL(p.pickupUrl).pathname.split('/').pop();
        time = 12000;
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).statusCode, 410);
        await f.restart();
        assert.equal(existsSync(path.join(f.dataDir, 'sessions', id)), false);
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).statusCode, 410);
    }
    finally {
        await f.close();
    }
});
test('new photos get ten minutes from completion; purchases and views do not extend it; timer erases private files and captions', async () => {
    let time = 1000, release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    const photo = await sharp({ create: { width: 40, height: 40, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const f = await fixture({ clock: () => time, mode: 'seedream', provider: async () => { await gate; return { images: [photo] }; } });
    try {
        const id = await f.make();
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).json().expiresAt, 601000);
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        time = 31000; release();
        const s = await f.finish(id);
        assert.equal(s.completedAt, time); assert.equal(s.expiresAt, 631000);
        await f.req('POST', `/api/sessions/${id}/frame`, { frame: 'instant', caption: { text: 'private caption', font: 'sans', size: 'medium', align: 'center', color: 'auto' } });
        time = 600000;
        const o = (await f.req('POST', `/api/sessions/${id}/orders`, { imageIds: [s.images[0].id] })).json();
        const p = (await f.req('POST', `/api/orders/${o.id}/simulate`, { outcome: 'paid' })).json();
        const token = new URL(p.pickupUrl).pathname.split('/').pop();
        const pickup = (await f.req('GET', `/api/pickup/${token}`)).json();
        assert.equal(pickup.expiresAt, s.expiresAt);
        assert.equal((await f.req('GET', pickup.images[0].downloadUrl)).statusCode, 200);
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).json().expiresAt, s.expiresAt);
        await f.restart();
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).json().expiresAt, s.expiresAt);
        time = s.expiresAt + 1;
        // No HTTP requests trigger this cleanup: it must happen on the running server's timer.
        await new Promise(resolve => setTimeout(resolve, 1100));
        assert.equal(existsSync(path.join(f.dataDir, 'sessions', id)), false);
        const db = new DatabaseSync(path.join(f.dataDir, 'booth.sqlite'));
        try {
            const record = JSON.parse(String(db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(id)!.json));
            assert.equal(record.token, undefined); assert.equal(record.pickupUrl, undefined); assert.equal(record.photo, undefined); assert.equal(record.snapshot, undefined);
            assert.deepEqual(record.images, []); assert.deepEqual(record.files, {}); assert.ok(record.deletedAt);
            assert.equal(db.prepare("SELECT json FROM records WHERE kind='frame' AND id=?").get(id), undefined);
            assert.ok(db.prepare("SELECT json FROM records WHERE kind='order' AND id=?").get(o.id));
        } finally { db.close(); }
        for (const url of [`/api/sessions/${id}`, `/api/sessions/${id}/original`, s.images[0].previewUrl, `/api/pickup/${token}`, pickup.images[0].downloadUrl]) assert.equal((await f.req('GET', url)).statusCode, 410);
    } finally { release(); await f.close(); }
});

test('expiry during generation cannot restore files after the provider completes', async () => {
    let time = 1000, release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    const photo = await sharp({ create: { width: 40, height: 40, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const f = await fixture({ clock: () => time, mode: 'seedream', provider: async () => { await gate; return { images: [photo] }; } });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        time = 601001;
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).statusCode, 410);
        release(); await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(existsSync(path.join(f.dataDir, 'sessions', id)), false);
        const s = (await f.req('GET', '/api/admin')).json().sessions.find((item: any) => item.id === id);
        assert.equal(s.status, 'ended'); assert.deepEqual(s.images, []);
    } finally { release(); await f.close(); }
});

test('upgrading leaves an existing photo on its original 24-hour deadline', async () => {
    const f = await fixture({ clock: () => 1000 });
    try {
        const id = await f.make(), deadline = 86401000;
        const db = new DatabaseSync(path.join(f.dataDir, 'booth.sqlite'));
        const s = JSON.parse(String(db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(id)!.json));
        delete s.retentionMs; s.expiresAt = deadline;
        db.prepare("UPDATE records SET json=? WHERE kind='session' AND id=?").run(JSON.stringify(s), id); db.close();
        await f.restart();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        assert.equal((await f.finish(id)).expiresAt, deadline);
        await f.restart();
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).json().expiresAt, deadline);
    } finally { await f.close(); }
});

test('security rejects remote kiosk, unknown Host, hostile Origin, non-JSON writes and invalid upload', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.app.inject({ url: '/api/admin', remoteAddress: '192.168.1.22', headers: { host: 'localhost:4377' } })).statusCode, 403);
        assert.equal((await f.app.inject({ url: '/api/health', headers: { host: 'evil.test' } })).statusCode, 403);
        assert.equal((await f.app.inject({ method: 'POST', url: '/api/sessions', headers: { host: 'localhost:4377', origin: 'https://evil.test' }, payload: { styleId: 'cinema' } })).statusCode, 403);
        assert.equal((await f.app.inject({ method: 'POST', url: '/api/sessions', headers: { host: 'localhost:4377', 'content-type': 'text/plain' }, payload: '{}' })).statusCode, 415);
        const id = await f.make();
        assert.equal((await f.req('POST', `/api/sessions/${id}/photo`, { dataUrl: 'data:image/jpeg;base64,YmFk' })).statusCode, 400);
        assert.equal((await f.req('GET', '/data/booth.sqlite')).statusCode, 404);
        assert.equal((await f.req('GET', '/api/styles')).json()[0].prompt, undefined);
    }
    finally {
        await f.close();
    }
});
test('ended session cannot be revived by a late provider response', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => release = r);
    const photo = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'blue' } }).jpeg().toBuffer();
    const f = await fixture({ mode: 'seedream', provider: async () => { await gate; return { images: [photo] }; } });
    try {
        const id = await f.make();
        await f.req('POST', `/api/sessions/${id}/generate`, {});
        await f.req('POST', `/api/sessions/${id}/end`, {});
        release();
        await new Promise(r => setTimeout(r, 30));
        const admin = (await f.req('GET', '/api/admin')).json();
        assert.equal(admin.sessions.find((s: any) => s.id === id).status, 'ended');
        assert.equal(admin.sessions.find((s: any) => s.id === id).images.length, 0);
    }
    finally {
        release();
        await f.close();
    }
});
test('startup marks interrupted generating tasks unknown without contacting provider', async () => {
    let calls = 0;
    const f = await fixture({ mode: 'seedream', provider: async () => { calls++; throw Error('should not run'); } });
    try {
        const id = await f.make();
        const db = new DatabaseSync(path.join(f.dataDir, 'booth.sqlite'));
        const row = db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(id)!;
        const stored = JSON.parse(String(row.json));
        stored.status = 'generating';
        db.prepare("UPDATE records SET json=? WHERE kind='session' AND id=?").run(JSON.stringify(stored), id);
        db.close();
        await f.restart();
        assert.equal((await f.req('GET', `/api/sessions/${id}`)).json().status, 'unknown');
        assert.equal((await f.req('POST', `/api/sessions/${id}/generate`, {})).statusCode, 409);
        assert.equal(calls, 0);
    }
    finally {
        await f.close();
    }
});
test('image upload checks decoded format, not only data URL declaration', async () => {
    const f = await fixture();
    try {
        const id = await f.make();
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="red"/></svg>');
        assert.equal((await f.req('POST', `/api/sessions/${id}/photo`, { dataUrl: `data:image/png;base64,${svg.toString('base64')}` })).statusCode, 400);
    }
    finally {
        await f.close();
    }
});

test('kiosk generates one paid image and serves the original free without adding it to an order', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.req('GET','/api/health')).json().imageCount, 1);
        const id = await f.make();
        const photographed = (await f.req('GET',`/api/sessions/${id}`)).json();
        assert.equal(photographed.originalUrl, `/api/sessions/${id}/original`);
        const original = await f.req('GET', photographed.originalUrl);
        assert.equal(original.statusCode, 200);
        assert.equal(original.headers['content-type'], 'image/jpeg');
        assert.equal(original.headers['cache-control'], 'no-store');
        assert.equal((await sharp(original.rawPayload).metadata()).format, 'jpeg');
        const remote = await f.app.inject({url:photographed.originalUrl,remoteAddress:'192.168.1.20',headers:{host:'localhost:4377'}});
        assert.equal(remote.statusCode,403);
        await f.req('POST',`/api/sessions/${id}/generate`,{});
        const ready=await f.finish(id); assert.equal(ready.images.length,1);
        assert.equal((await f.req('GET',photographed.originalUrl)).statusCode,200);
        assert.equal((await f.req('POST',`/api/sessions/${id}/orders`,{imageIds:['original']})).statusCode,400);
        const order=(await f.req('POST',`/api/sessions/${id}/orders`,{imageIds:[ready.images[0].id]})).json();
        assert.equal(order.amount,990); assert.equal(order.imageIds.length,1);
        await f.req('POST',`/api/sessions/${id}/end`,{});
        assert.equal((await f.req('GET',photographed.originalUrl)).statusCode,410);
    } finally { await f.close(); }
});


test('group photo upgrade preserves settings and past snapshots, reaches provider, and runs once', async () => {
    const received: string[] = [];
    const f = await fixture({ mode: 'seedream', provider: async input => { received.push(input.prompt); return { images: [input.photo] }; } });
    try {
        const original = (await f.req('GET', '/api/admin')).json().styles[0];
        const before = await f.make();
        await f.req('POST', '/api/sessions/' + before + '/generate', {});
        await f.finish(before);
        await f.req('PUT', '/api/admin/styles/cinema', { ...original, name: '我的电影', enabled: false });
        const prompt = '保留参考照片中的所有人物，按实际人数构图';
        writeFileSync(path.join(f.root, 'config/styles/styles.json'), JSON.stringify([{ ...original, prompt, version: 2 }]));
        writeFileSync(path.join(f.root, 'config/styles/group-photo-migration.json'), JSON.stringify({ cinema: createHash('sha256').update(original.prompt).digest('hex') }));
        await f.restart();
        let saved = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(saved.prompt, prompt);
        assert.equal(saved.version, 2);
        assert.equal(saved.name, '我的电影');
        assert.equal(saved.enabled, false);
        const db = new DatabaseSync(path.join(f.dataDir, 'booth.sqlite'));
        try {
            const record = db.prepare('SELECT json FROM records WHERE kind=? AND id=?').get('session', before)!;
            assert.equal(JSON.parse(String(record.json)).snapshot.prompt, original.prompt);
        } finally { db.close(); }
        await f.restart();
        saved = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(saved.version, 2);
        await f.req('PUT', '/api/admin/styles/cinema', { ...saved, enabled: true });
        const after = await f.make();
        await f.req('POST', '/api/sessions/' + after + '/generate', {});
        await f.finish(after);
        assert.ok(received[0].includes(original.prompt));
        assert.ok(received[1].includes(prompt));
        assert.ok(received.every(value => value.includes('画面比例严格为3:4')));
        await f.req('PUT', '/api/admin/styles/cinema', { ...saved, prompt: 'my custom group prompt' });
        await f.restart();
        saved = (await f.req('GET', '/api/admin')).json().styles[0];
        assert.equal(saved.prompt, 'my custom group prompt');
        assert.equal(saved.version, 3);
    } finally { await f.close(); }
});

test('frame survives generation and restart, exports outside image bounds, and never repeats generation', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const f = await fixture({ mode: 'seedream', provider: async input => { calls++; await gate; return { images: [input.photo] }; } });
    try {
        const id = await f.make();
        const original = (await f.req('GET', '/api/sessions/' + id + '/original')).rawPayload;
        await f.req('POST', '/api/sessions/' + id + '/generate', {});
        assert.equal((await f.req('POST', '/api/sessions/' + id + '/frame', { frame: 'instant' })).statusCode, 200);
        assert.equal((await f.req('POST', '/api/sessions/' + id + '/frame', { frame: '../../bad' })).statusCode, 400);
        release();
        const ready = await f.finish(id);
        assert.equal(ready.frame, 'instant');
        await f.restart();
        assert.equal((await f.req('GET', '/api/sessions/' + id)).json().frame, 'instant');
        const order = (await f.req('POST', '/api/sessions/' + id + '/orders', { imageIds: [ready.images[0].id] })).json();
        const paid = (await f.req('POST', '/api/orders/' + order.id + '/simulate', { outcome: 'paid' })).json();
        const token = new URL(paid.pickupUrl).pathname.split('/').pop();
        const url = '/api/pickup/' + token + '/images/' + ready.images[0].id;
        const bordered = await f.req('GET', url);
        const meta = await sharp(bordered.rawPayload).metadata();
        assert.equal(meta.width, 178); // 160 + round(160 * .055) * 2
        assert.equal(meta.height, 241); // 200 + 9 + 32
        const pixel = await sharp(bordered.rawPayload).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
        assert.ok(Math.abs(pixel[0] - 250) < 5 && Math.abs(pixel[1] - 247) < 5);
        await f.req('POST', '/api/sessions/' + id + '/frame', { frame: 'none' });
        const plain = await f.req('GET', url);
        assert.equal((await sharp(plain.rawPayload).metadata()).width, 160);
        assert.deepEqual((await f.req('GET', '/api/sessions/' + id + '/original')).rawPayload, original);
        assert.equal(calls, 1);
        assert.equal((await f.req('GET', '/api/pickup/' + token + '/images/00000000-0000-0000-0000-000000000000')).statusCode, 404);
        await f.req('POST', '/api/sessions/' + id + '/end', {});
        assert.equal((await f.req('POST', '/api/sessions/' + id + '/frame', { frame: 'paper' })).statusCode, 410);
    } finally { release(); await f.close(); }
});

test('demo and preview preserve the image bottom without baked-in banners', async () => {
    const f = await fixture();
    try {
        const id = await f.make();
        await f.req('POST', '/api/sessions/' + id + '/generate', {});
        const s = await f.finish(id);
        const preview = await f.req('GET', s.images[0].previewUrl);
        const { data, info } = await sharp(preview.rawPayload).raw().toBuffer({ resolveWithObject: true });
        const bottom = (info.height - 1) * info.width * info.channels;
        for (let c = 0; c < 3; c++) assert.ok(Math.abs(data[c] - data[bottom + c]) < 5, 'uniform sample must stay uniform at bottom edge');
    } finally { await f.close(); }
});

test('caption validates, survives restart and legacy frame edits, and is included in pickup JPEG', async () => {
 const f=await fixture();
 try {
  const id=await f.make();
  const caption={text:'一起，收藏今天。\nHello & <world>',font:'hand',size:'large',align:'right',color:'auto'};
  const path='/api/sessions/'+id+'/frame';
  assert.equal((await f.req('POST',path,{frame:'postcard',caption})).statusCode,200);
  for(const invalid of [{...caption,text:'长'.repeat(81)},{...caption,font:'url(evil)'},{...caption,size:1000},{...caption,text:'a\n\n\n\nb'}])
   assert.equal((await f.req('POST',path,{frame:'postcard',caption:invalid})).statusCode,400);
  await f.req('POST','/api/sessions/'+id+'/generate',{});
  const ready=await f.finish(id);
  await f.restart();
  assert.deepEqual((await f.req('GET','/api/sessions/'+id)).json().caption,caption);
  await f.req('POST',path,{frame:'instant'});
  assert.deepEqual((await f.req('GET','/api/sessions/'+id)).json().caption,caption);
  const order=(await f.req('POST','/api/sessions/'+id+'/orders',{imageIds:[ready.images[0].id]})).json();
  const paid=(await f.req('POST','/api/orders/'+order.id+'/simulate',{outcome:'paid'})).json();
  const token=new URL(paid.pickupUrl).pathname.split('/').pop();
  const imageUrl='/api/pickup/'+token+'/images/'+ready.images[0].id;
  const withText=await f.req('GET',imageUrl);
  assert.equal(withText.statusCode,200);
  await f.req('POST',path,{frame:'instant',caption:{...caption,text:''}});
  const withoutText=await f.req('GET',imageUrl);
  assert.notDeepEqual(withText.rawPayload,withoutText.rawPayload);
  assert.ok((await sharp(withText.rawPayload).metadata()).height!>(await sharp(withoutText.rawPayload).metadata()).height!);
 }finally{await f.close();}
});

test('recommended decoration and purpose persist but never replace a visitor edit', async () => {
 const f=await fixture();
 try {
  const bad=await f.req('POST','/api/sessions',{styleId:'cinema',purpose:'invalid'});
  assert.equal(bad.statusCode,400);
  const s=(await f.req('POST','/api/sessions',{styleId:'cinema',purpose:'together'})).json();
  assert.equal(s.frame,'midnight'); assert.equal(s.purpose,'together');
  await f.req('POST',`/api/sessions/${s.id}/frame`,{frame:'instant'});
  await f.restart();
  const restored=(await f.req('GET',`/api/sessions/${s.id}`)).json();
  assert.equal(restored.frame,'instant');assert.equal(restored.purpose,'together');
 } finally {await f.close();}
});

test('portrait prompt upgrade preserves custom prompts and is idempotent', async () => {
 const f=await fixture();
 try {
  const original=(await f.req('GET','/api/admin')).json().styles[0];
  writeFileSync(path.join(f.root,'config/styles/portrait-migration.json'),JSON.stringify({cinema:createHash('sha256').update(original.prompt).digest('hex')}));
  writeFileSync(path.join(f.root,'config/styles/styles.json'),JSON.stringify([{...original,prompt:'preserve face and clothing',version:3}]));
  await f.restart();
  const upgraded=(await f.req('GET','/api/admin')).json().styles[0];
  assert.equal(upgraded.prompt,'preserve face and clothing');assert.equal(upgraded.version,3);
  await f.restart();assert.equal((await f.req('GET','/api/admin')).json().styles[0].version,3);
  await f.req('PUT','/api/admin/styles/cinema',{...upgraded,prompt:'custom identity policy'});
  await f.restart();assert.equal((await f.req('GET','/api/admin')).json().styles[0].prompt,'custom identity policy');
 } finally {await f.close();}
});

test('retired templates leave the catalog permanently while pending photos and custom prompts survive', async () => {
 const f=await fixture();
 try {
  const style=(await f.req('GET','/api/admin')).json().styles[0];
  const id=await f.make();
  await f.req('PUT','/api/admin/styles/cinema',{...style,prompt:'custom retired prompt'});
  writeFileSync(path.join(f.root,'config/styles/retired-styles.json'),JSON.stringify({cinema:'replacement'}));
  writeFileSync(path.join(f.root,'config/styles/styles.json'),JSON.stringify([style,{...style,id:'replacement',name:'保留款'}]));
  await f.restart();
  assert.deepEqual((await f.req('GET','/api/styles')).json().map((s:any)=>s.id),['replacement']);
  assert.equal((await f.req('POST','/api/sessions',{styleId:'cinema'})).statusCode,400);
  assert.equal((await f.req('GET',`/api/sessions/${id}/original`)).statusCode,200);
  await f.req('POST',`/api/sessions/${id}/generate`,{});
  assert.equal((await f.finish(id)).status,'ready');
  await f.restart();
  assert.deepEqual((await f.req('GET','/api/admin')).json().styles.map((s:any)=>s.id),['replacement']);
  const db=new DatabaseSync(path.join(f.dataDir,'booth.sqlite'),{readOnly:true});
  try {
   assert.equal(JSON.parse(String(db.prepare("SELECT json FROM records WHERE kind='retired-style' AND id='cinema'").get()!.json)).prompt,'custom retired prompt');
   assert.equal(JSON.parse(String(db.prepare("SELECT json FROM records WHERE kind='session' AND id=?").get(id)!.json)).snapshot.prompt,'custom retired prompt');
  } finally { db.close(); }
 } finally {await f.close();}
});

test('one device admits only one upstream generation even when a visitor starts another session', async () => {
 let release!:()=>void, calls=0;
 const gate=new Promise<void>(resolve=>release=resolve);
 const f=await fixture({mode:'seedream',provider:async()=>{calls++;await gate;return {images:[]};}});
 try {
  const first=await f.make(),second=await f.make();
  await f.req('POST',`/api/sessions/${first}/generate`,{});
  assert.equal((await f.req('POST',`/api/sessions/${second}/generate`,{})).statusCode,429);
  await f.req('POST',`/api/sessions/${first}/end`,{});
  assert.equal((await f.req('POST',`/api/sessions/${second}/generate`,{})).statusCode,429);
  assert.equal(calls,1);
  release();
 } finally {release();await f.close();}
});

// The generation wait: shared timing/rules plus the server side of its extras (fortune slip, sticker-decorated original).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../apps/server/app.js';
import { setAdminPassword } from '../apps/server/admin-auth.js';
import { fortunes, drawFortune, isFortuneId } from '../packages/shared/fortunes.js';
import { slowNotice, stageAt, waitAudience, waitGames, fortuneSet, revealMs, waitTiming, maxStickers } from '../packages/shared/wait-experience.js';
import { addSticker } from '../apps/web/src/wait/stickers.js';
import { existsSync } from 'node:fs';
import { fortuneSrc, friendSrc, lotSrc, stickerSrc, waitArt, waitFriends, waitLots, waitStickers, type WaitFriendId, type WaitLotId, type WaitStickerId } from '../packages/shared/wait-assets.js';
import { stickerSets, bubbleSkins, snapCharacters } from '../packages/shared/wait-experience.js';

test('every illustrated wait asset the page asks for is bundled', () => {
    const file = (url: string) => path.join('assets', url);
    const used = new Set<WaitStickerId>([...Object.values(stickerSets).flat(), ...Object.values(bubbleSkins).flat()]);
    for (const id of used) assert.ok(id in waitStickers);
    const paths = [...(Object.keys(waitStickers) as WaitStickerId[]).map(stickerSrc), ...(Object.keys(waitFriends) as WaitFriendId[]).map(friendSrc),
        waitArt.studio, waitArt.fortuneTube, waitArt.cardBack, ...Object.values(waitArt.fortune),
        ...(Object.keys(waitLots) as WaitLotId[]).map(lotSrc), ...fortunes.map(f => fortuneSrc(f.id))];
    for (const url of paths) assert.ok(existsSync(file(url)), `missing ${url}`);
    for (const style of ['kids-dino', 'kids-firefighter', 'cinema']) for (const id of snapCharacters(style)) assert.ok(id in waitFriends);
});

test('gallery tabs choose the wait game and whether a fortune is offered', () => {
    assert.equal(waitAudience('kids-dino'), 'kids');
    assert.equal(waitAudience('together-01'), 'together');
    assert.equal(waitAudience('wedding-bride'), 'together');
    assert.equal(waitAudience('birthday-home'), 'celebration');
    assert.equal(waitAudience('cinema'), 'general');
    assert.equal(waitAudience('custom-style', 2), 'together');
    assert.deepEqual(waitGames.kids, ['snap', 'bubbles']);
    assert.equal(fortuneSet('kids'), undefined, 'children cannot read a slip');
    assert.equal(fortuneSet('together'), 'together');
});

test('stages describe the work without claiming progress, and notes only appear when it runs long', () => {
    assert.equal(stageAt(0).label, '认出五官');
    assert.equal(stageAt(13000).label, '布光、上色');
    assert.equal(stageAt(10 * 60000).label, '细节精修', 'the last stage holds until the photo is ready');
    assert.equal(slowNotice(59000), undefined);
    assert.match(slowNotice(60000)!, /不会丢/);
    assert.match(slowNotice(95000)!, /再等一下/);
    assert.match(slowNotice(125000)!, /工作人员/);
    assert.ok(waitTiming.finaleMs + revealMs < 7000, 'the hand-over to results stays short');
});

test('fortunes are all good, unique and available for every adult audience', () => {
    assert.equal(new Set(fortunes.map(f => f.id)).size, fortunes.length);
    for (const set of ['general', 'together', 'celebration'] as const) assert.ok(fortunes.filter(f => f.set === set).length >= 8);
    assert.ok(fortunes.every(f => /吉|上上/.test(f.level) && f.text.length <= 16));
    assert.equal(drawFortune('together', () => 0.999).set, 'together');
    assert.equal(isFortuneId('nope'), false);
});

test('stickers fill free spots around the person and stop at the limit', () => {
    let list = addSticker([], 'heart', 1);
    list = addSticker(list, 'star', 2);
    assert.deepEqual(list.map(s => s.slot), [0, 1]);
    list = addSticker(list.filter(s => s.id !== 1), 'blossom', 3);
    assert.equal(list.find(s => s.id === 3)!.slot, 0, 'a removed sticker frees its spot');
    for (let i = 0; i < 20; i++) list = addSticker(list, 'sparkle', 10 + i);
    assert.equal(list.length, maxStickers);
});

async function fixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'wait-test-'));
    mkdirSync(path.join(root, 'config/styles'), { recursive: true });
    writeFileSync(path.join(root, 'config/styles/styles.json'), JSON.stringify([{ id: 'cinema', name: '电影', description: '测试', prompt: 'keep identity', version: 1, enabled: true, exampleUrl: '/examples/cinema.svg', size: '2K', color: '#f00' }]));
    await setAdminPassword(root, 'test-wait-password');
    let time = Date.now();
    const app = await createApp({ mode: 'demo', rootDir: root, dataDir: path.join(root, 'data'), clock: () => time, ttlMs: 600000 });
    const req = (method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, headers: { host: 'localhost:4377' } });
    const photo = await sharp({ create: { width: 120, height: 160, channels: 3, background: '#e9b' } }).jpeg().toBuffer();
    const dataUrl = (b: Buffer, type = 'jpeg') => `data:image/${type};base64,${b.toString('base64')}`;
    return { req, photo, dataUrl, advance: (ms: number) => time += ms, close: async () => { await app.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('fortune and decorated original are saved while waiting and offered on the phone pickup page', async () => {
    const f = await fixture();
    try {
        const s = (await f.req('POST', '/api/sessions', { styleId: 'cinema' })).json();
        assert.equal((await f.req('POST', `/api/sessions/${s.id}/fortune`, { fortune: 'g1' })).statusCode, 409, 'no photo yet');
        await f.req('POST', `/api/sessions/${s.id}/photo`, { dataUrl: f.dataUrl(f.photo), orientation: 'portrait' });
        const decorated = await sharp({ create: { width: 90, height: 120, channels: 3, background: '#39f' } }).png().toBuffer();
        assert.equal((await f.req('POST', `/api/sessions/${s.id}/decorated`, { dataUrl: f.dataUrl(decorated, 'png') })).statusCode, 409, 'decorating starts with generation');
        const started = (await f.req('POST', `/api/sessions/${s.id}/generate`, {})).json();
        assert.equal(typeof started.startedAt, 'number', 'the wait page resumes its clock from here');
        assert.equal((await f.req('POST', `/api/sessions/${s.id}/fortune`, { fortune: 'made-up' })).statusCode, 400);
        assert.equal((await f.req('POST', `/api/sessions/${s.id}/fortune`, { fortune: 't1' })).json().fortune, 't1');
        const saved = (await f.req('POST', `/api/sessions/${s.id}/decorated`, { dataUrl: f.dataUrl(decorated, 'png') })).json();
        assert.match(saved.decoratedUrl, /^\/api\/sessions\/.+\/decorated/);
        assert.equal(JSON.stringify(saved).includes('decorated.jpg'), false, 'no raw file paths');
        const image = await f.req('GET', saved.decoratedUrl);
        assert.equal(image.headers['content-type'], 'image/jpeg');
        const token = saved.pickupUrl.split('/').pop();
        const pickup = (await f.req('GET', `/api/pickup/${token}`)).json();
        assert.deepEqual(pickup.fortune, { level: '大吉', text: '你们俩今天很上镜' });
        assert.equal(pickup.decorated.downloadUrl, `/api/pickup/${token}/decorated`);
        assert.equal((await f.req('GET', pickup.decorated.downloadUrl)).statusCode, 200);
        // Removing every sticker removes the bonus photo again.
        assert.equal((await f.req('POST', `/api/sessions/${s.id}/decorated`, { dataUrl: null })).json().decoratedUrl, undefined);
        assert.equal((await f.req('GET', `/api/pickup/${token}`)).json().decorated, undefined);
        await f.req('POST', `/api/sessions/${s.id}/decorated`, { dataUrl: f.dataUrl(decorated, 'png') });
        f.advance(11 * 60000);
        assert.equal((await f.req('GET', `/api/pickup/${token}/decorated`)).statusCode, 410, 'expires with the other photos');
    } finally { await f.close(); }
});

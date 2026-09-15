import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { generate, ProviderError, type GenerateInput } from '../apps/server/providers/seedream.ts';
// Every request is mocked. Sequential execution isolates global fetch and environment values.
const originalFetch = globalThis.fetch;
const originalKey = process.env.SEEDREAM_API_KEY;
const originalModel = process.env.SEEDREAM_MODEL;
const input: GenerateInput = { photo: Buffer.from('test-photo'), prompt: '保留本人特征', size: '1.5K', count: 1 };
let calls = 0;
beforeEach(() => {
    calls = 0;
    process.env.SEEDREAM_API_KEY = 'mock-key-never-sent';
    process.env.SEEDREAM_MODEL = 'mock-model-not-a-real-id';
    globalThis.fetch = async () => { throw new Error('Unexpected request; network disabled in this test'); };
});
afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined)
        delete process.env.SEEDREAM_API_KEY;
    else
        process.env.SEEDREAM_API_KEY = originalKey;
    if (originalModel === undefined)
        delete process.env.SEEDREAM_MODEL;
    else
        process.env.SEEDREAM_MODEL = originalModel;
});
function imageResponse(id = 'mock-request'): Response {
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('mock-image').toString('base64') }] }), {
        status: 200, headers: { 'x-request-id': id },
    });
}
test('count 1 sends normalized image and single-image API parameters', { concurrency: false }, async () => {
    globalThis.fetch = async (url, options) => {
        calls++;
        assert.equal(url, 'https://ark.cn-beijing.volces.com/api/v3/images/generations');
        assert.equal(options?.method, 'POST');
        assert.equal(options?.redirect, 'error');
        const body = JSON.parse(String(options?.body));
        assert.equal(body.model, 'mock-model-not-a-real-id');
        assert.equal(body.image, `data:image/jpeg;base64,${input.photo.toString('base64')}`);
        assert.equal(body.prompt, input.prompt);
        assert.equal(body.response_format, 'b64_json');
        assert.equal('sequential_image_generation' in body, false);
        assert.equal('stream' in body, false);
        assert.equal(body.size, '1.5K');
        return imageResponse();
    };
    const result = await generate(input);
    assert.equal(calls, 1);
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].toString(), 'mock-image');
    assert.equal(result.requestId, 'mock-request');
});
test('count 2 submits two independent requests and preserves both identifiers', { concurrency: false }, async () => {
    globalThis.fetch = async () => imageResponse(`mock-${++calls}`);
    const result = await generate({ ...input, count: 2 });
    assert.equal(calls, 2);
    assert.equal(result.images.length, 2);
    assert.equal(result.requestId, 'mock-1, mock-2');
});
test('second request failure keeps the first image and ambiguous status without retry', { concurrency: false }, async () => {
    globalThis.fetch = async () => ++calls === 1 ? imageResponse('first') : new Response('unavailable', {
        status: 503, headers: { 'x-request-id': 'second' },
    });
    const result = await generate({ ...input, count: 2 });
    assert.equal(calls, 2);
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].toString(), 'mock-image');
    assert.equal(result.unknown, true);
    assert.match(result.error!, /503/);
    assert.equal(result.requestId, 'first, second');
});
test('401 is a known configuration failure and is not automatically retried', { concurrency: false }, async () => {
    globalThis.fetch = async () => { calls++; return new Response('unauthorized', { status: 401 }); };
    await assert.rejects(() => generate(input), (error: unknown) => error instanceof ProviderError && !error.unknown);
    assert.equal(calls, 1);
});
test('5xx is ambiguous and includes request identifier without automatic retry', { concurrency: false }, async () => {
    globalThis.fetch = async () => { calls++; return new Response('failure', { status: 500, headers: { 'x-tt-logid': 'unknown-request' } }); };
    await assert.rejects(() => generate(input), (error: unknown) => error instanceof ProviderError && error.unknown && error.requestId === 'unknown-request');
    assert.equal(calls, 1);
});
test('network rejection is ambiguous without automatic retry', { concurrency: false }, async () => {
    globalThis.fetch = async () => { calls++; throw new Error('simulated network interruption'); };
    await assert.rejects(() => generate(input), (error: unknown) => error instanceof ProviderError && error.unknown);
    assert.equal(calls, 1);
});

test('connect permission denial is a known failure before a request can reach upstream', { concurrency: false }, async () => {
    globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed', { cause: { code: 'EACCES', syscall: 'connect' } }); };
    await assert.rejects(() => generate(input), (error: unknown) => error instanceof ProviderError && !error.unknown && error.message.includes('请求未发出'));
    assert.equal(calls, 1);
});
test('missing key or model rejects before making a request', { concurrency: false }, async () => {
    globalThis.fetch = async () => { calls++; throw new Error('Must never be called'); };
    delete process.env.SEEDREAM_API_KEY;
    await assert.rejects(() => generate(input), (error: unknown) => error instanceof ProviderError && !error.unknown);
    process.env.SEEDREAM_API_KEY = 'mock-key-never-sent';
    delete process.env.SEEDREAM_MODEL;
    await assert.rejects(() => generate(input), (error: unknown) => error instanceof ProviderError && !error.unknown);
    assert.equal(calls, 0);
});
test('hostile URLs reject before DNS or image HTTP requests', { concurrency: false }, async () => {
    for (const url of [
        'http://127.0.0.1/private', 'https://localhost/private', 'https://volces.com.evil.invalid/image',
        'https://user:password@image.volces.com/image', 'https://image.volces.com:444/image',
    ]) {
        globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ data: [{ url }] }), { status: 200 }); };
        await assert.rejects(() => generate(input), (error: unknown) => error instanceof ProviderError && error.unknown && error.message.includes('未允许'));
    }
    assert.equal(calls, 5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// The deployed worker is ESM even in legacy CommonJS application packages.
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL('../public/_worker.js', import.meta.url))).toString('base64'));
const bytes = Uint8Array.from({ length: 200 }, (_, i) => i);
function serve(headers = {}, method = 'GET', options = {}) {
  const env = { ASSETS: { fetch: async request => {
    assert.equal(request.headers.get('range'), null);
    return new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 70)); c.enqueue(bytes.slice(70, 130)); c.enqueue(bytes.slice(130)); c.close(); } }), {
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': '200', ETag: '"stable"', 'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT', ...options },
    });
  } } };
  return worker.fetch(new Request('https://example.com/test.mp4', { method, headers }), env);
}
for (const [range, start, end] of [['bytes=0-9', 0, 9], ['bytes=65-135', 65, 135], ['bytes=190-', 190, 199], ['bytes=-10', 190, 199], ['bytes=190-999', 190, 199]]) {
  test(`exact streamed bytes for ${range}`, async () => {
    const response = await serve({ Range: range });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/200`);
    assert.equal(response.headers.get('content-length'), String(end - start + 1));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(start, end + 1));
  });
}
test('unsatisfiable ranges return honest 416', async () => {
  for (const range of ['bytes=200-', 'bytes=50-20', 'bytes=-0']) {
    const r = await serve({ Range: range }); assert.equal(r.status, 416); assert.equal(r.headers.get('content-range'), 'bytes */200');
  }
});
test('malformed, multiple, and mismatched If-Range return full representations', async () => {
  for (const headers of [{ Range: 'garbage' }, { Range: 'bytes=1-2,4-5' }, { Range: 'bytes=1-2', 'If-Range': '"old"' }, { Range: 'bytes=1-2', 'If-Range': 'W/"stable"' }]) {
    const r = await serve(headers); assert.equal(r.status, 200); assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes);
  }
});
test('matching strong validator allows ranges', async () => { assert.equal((await serve({ Range: 'bytes=1-2', 'If-Range': '"stable"' })).status, 206); });
test('HEAD returns full length and no body', async () => { const r = await serve({ Range: 'bytes=1-2' }, 'HEAD'); assert.equal(r.status, 200); assert.equal(r.headers.get('content-length'), '200'); assert.equal(await r.text(), ''); });
test('SPA HTML fallback is never served as a video', async () => { assert.equal((await serve({}, 'GET', { 'Content-Type': 'text/html' })).status, 404); });
test('nonvideo paths bypass media handling', async () => {
  const response = new Response('static');
  assert.equal(await worker.fetch(new Request('https://example.com/index.html'), { ASSETS: { fetch: async () => response } }), response);
});

test('If-Range dates require an exact Last-Modified match, not an earlier-or-equal comparison', async () => {
  for (const date of ['Tue, 31 Dec 2024 00:00:00 GMT', 'Thu, 02 Jan 2025 00:00:00 GMT', 'not-a-date']) {
    const response = await serve({ Range: 'bytes=1-2', 'If-Range': date });
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  }
  const exact = await serve({ Range: 'bytes=1-2', 'If-Range': 'Wed, 01 Jan 2025 00:00:00 GMT' });
  assert.equal(exact.status, 206);
  assert.deepEqual(new Uint8Array(await exact.arrayBuffer()), bytes.slice(1, 3));
});

function streamAsset(body, { status = 200, headers = {} } = {}) {
  return { ASSETS: { fetch: async () => new Response(body, { status, headers: { 'Content-Type': 'video/mp4', ...headers } }) } };
}

test('truncated streams reject instead of completing a false Content-Length response', async () => {
  for (const range of ['bytes=0-9', 'bytes=50-59']) {
    const body = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 5)); c.close(); } });
    await assert.rejects(worker.fetch(new Request('https://example.com/test.mp4', { headers: { Range: range } }), streamAsset(body, { headers: { 'Content-Length': '200' } })), /ended before the requested byte range/);
    assert.equal(body.locked, false);
  }
});

test('upstream read errors propagate and release the upstream reader', async () => {
  const body = new ReadableStream({ pull(c) { c.error(new Error('upstream disconnected')); } });
  await assert.rejects(worker.fetch(new Request('https://example.com/test.mp4', { headers: { Range: 'bytes=1-20' } }), streamAsset(body, { headers: { 'Content-Length': '200' } })), /upstream disconnected/);
  assert.equal(body.locked, false);
});

test('completed ranges cancel unused upstream bytes and release the reader', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(bytes); }, cancel() { cancelled = true; } });
  const response = await worker.fetch(new Request('https://example.com/test.mp4', { headers: { Range: 'bytes=1-2' } }), streamAsset(body, { headers: { 'Content-Length': '200' } }));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(1, 3));
  await Promise.resolve();
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('request abort cancels a pending range read and releases its reader', async () => {
  let reason;
  const aborter = new AbortController();
  const body = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 10)); }, cancel(value) { reason = value; } });
  const pending = worker.fetch(new Request('https://example.com/test.mp4', { headers: { Range: 'bytes=0-99' }, signal: aborter.signal }), streamAsset(body, { headers: { 'Content-Length': '200' } }));
  const rejection = assert.rejects(pending, error => error.name === 'AbortError');
  await new Promise(resolve => setTimeout(resolve, 0));
  aborter.abort(new DOMException('viewer closed', 'AbortError'));
  await rejection;
  assert.equal(reason.message, 'viewer closed');
  assert.equal(body.locked, false);
});

test('every discarded HEAD body is cancelled, including unknown lengths, failures and HTML fallback', async () => {
  for (const options of [{}, { status: 404 }, { headers: { 'Content-Type': 'text/html' } }]) {
    let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(bytes); }, cancel() { cancelled = true; } });
    const response = await worker.fetch(new Request('https://example.com/test.mp4', { method: 'HEAD' }), streamAsset(body, options));
    assert.equal(await response.text(), '');
    assert.equal(cancelled, true);
    assert.equal(response.status, options.status ?? (options.headers ? 404 : 200));
    assert.equal(response.headers.get('Accept-Ranges'), null);
  }
});

test('unknown sizes return a full response without claiming range support', async () => {
  const response = await worker.fetch(new Request('https://example.com/test.mp4', { headers: { Range: 'bytes=1-2' } }), streamAsset(bytes));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Accept-Ranges'), null);
  assert.equal(response.headers.get('Content-Range'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('conditional 304 from static assets is preserved with validators before range handling', async () => {
  const response = await worker.fetch(new Request('https://example.com/test.mp4', { headers: { Range: 'bytes=1-2', 'If-None-Match': '"stable"' } }), {
    ASSETS: { fetch: async request => {
      assert.equal(request.headers.get('If-None-Match'), '"stable"');
      assert.equal(request.headers.get('Range'), null);
      return new Response(null, { status: 304, headers: { ETag: '"stable"' } });
    } },
  });
  assert.equal(response.status, 304);
  assert.equal(response.headers.get('ETag'), '"stable"');
  assert.equal(await response.text(), '');
});


test('multi-megabyte non-aligned ranges materialize every byte before response publication', async () => {
  const length = 6 * 1024 * 1024, start = 1024 * 1024 + 73, end = 5 * 1024 * 1024 + 139;
  let offset = 0, cancelled = false;
  const body = new ReadableStream({ pull(c) {
    if (offset === length) { c.close(); return; }
    const chunk = new Uint8Array(Math.min(65521, length - offset));
    for (let i = 0; i < chunk.length; i++) chunk[i] = (offset + i) % 251;
    offset += chunk.length; c.enqueue(chunk);
  }, cancel() { cancelled = true; } });
  const response = await worker.fetch(new Request('https://example.com/test.mp4', { headers: { Range: `bytes=${start}-${end}` } }), streamAsset(body, { headers: { 'Content-Length': String(length) } }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Length'), String(end - start + 1));
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
  const actual = new Uint8Array(await response.arrayBuffer());
  assert.equal(actual.length, end - start + 1);
  const expected = new Uint8Array(actual.length);
  for (let i = 0; i < expected.length; i++) expected[i] = (start + i) % 251;
  assert.deepEqual(actual, expected);
});

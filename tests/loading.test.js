import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readWithProgress, downloadOBJ } from '../loading.js';

test('download reports real bytes and preserves streamed content', async () => {
  const updates = [];
  const response = new Response(new ReadableStream({start(controller) {
    controller.enqueue(new TextEncoder().encode('hello'));
    controller.enqueue(new TextEncoder().encode(' world'));
    controller.close();
  }}), {headers:{'content-length':'11'}});
  const blob = await readWithProgress(response, (loaded,total)=>updates.push([loaded,total]));
  assert.equal(await blob.text(), 'hello world');
  assert.deepEqual(updates, [[0,11],[5,11],[11,11]]);
});

test('compressed model decodes exactly; missing gzip falls back to OBJ', async (t) => {
  const text = 'v 1 2 3\nf 1 2 3\n';
  const zipped = gzipSync(text);
  const fetchMock = t.mock.method(globalThis, 'fetch', async()=>new Response(zipped, {headers:{'content-length':String(zipped.length)}}));
  assert.equal(await downloadOBJ('/building.obj', ()=>{}, true), text);
  let requests = [];
  fetchMock.mock.mockImplementation(async(url)=>{
    requests.push(url);
    return url.endsWith('.gz') ? new Response('',{status:404}) : new Response(text);
  });
  assert.equal(await downloadOBJ('/building.obj', ()=>{}, true), text);
  assert.deepEqual(requests, ['/building.obj.gz','/building.obj']);
});

test('browser-decoded gzip is not decompressed twice and HTTP errors surface', async (t) => {
  const text = 'v 1 2 3';
  const fetchMock = t.mock.method(globalThis, 'fetch', async()=>new Response(text, {headers:{'content-encoding':'gzip','content-length':'5'}}));
  const totals=[];
  assert.equal(await downloadOBJ('/building.obj',(loaded,total)=>totals.push(total),true), text);
  assert.ok(totals.every(total=>total===0));
  fetchMock.mock.mockImplementation(async()=>new Response('',{status:503}));
  await assert.rejects(downloadOBJ('/building.obj',()=>{},false), /503/);
});

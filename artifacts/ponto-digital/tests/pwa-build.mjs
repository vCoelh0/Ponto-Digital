import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the built Workbox worker with in-memory browser storage and fetch.
// This never connects to Clerk, the API, or a real user's database.
const output = new URL('../dist/public/', import.meta.url);
const origin = 'https://ponto-digital.test';
const workerCode = await readFile(new URL('sw.js', output), 'utf8');

async function workerEnvironment() {
  const listeners = new Map();
  const stores = new Map();
  const pending = [];
  let online = true;
  let activations = 0;
  const key = (input) => new URL(typeof input === 'string' ? input : input.url, origin).href;
  const storage = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) { entries.set(key(request), response.clone()); },
        async keys() { return [...entries.keys()].map((url) => new Request(url)); },
        async delete(request) { return entries.delete(key(request)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) {
      for (const entries of stores.values()) {
        const response = entries.get(key(request));
        if (response) return response.clone();
      }
      return undefined;
    },
  };
  class ExtendableEvent {
    constructor(type = 'fetch') { this.type = type; }
    waitUntil(promise) { pending.push(promise); }
  }
  class FetchEvent extends ExtendableEvent {
    constructor(request) { super(); this.request = request; }
    respondWith(response) { this.response = Promise.resolve(response); }
  }
  const location = new URL(`${origin}/sw.js`);
  const registration = { scope: `${origin}/` };
  const self = {
    location,
    registration,
    caches: storage,
    clients: { claim: async () => {} },
    skipWaiting: async () => { activations += 1; },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  const context = vm.createContext({
    self, location, registration, caches: storage,
    URL, Request, Response, Headers, ExtendableEvent, FetchEvent,
    console, setTimeout, clearTimeout,
    fetch: async (input) => {
      if (!online) throw new TypeError('Offline');
      const url = new URL(key(input));
      const asset = new URL(`.${url.pathname}`, output);
      const body = await readFile(asset).catch(() => Buffer.from('network response'));
      const response = new Response(body, { status: 200 });
      Object.defineProperty(response, 'url', { value: url.href });
      return response;
    },
  });
  vm.runInContext(workerCode, context, { filename: 'sw.js' });
  const settle = async () => {
    while (pending.length) await Promise.all(pending.splice(0));
  };
  for (const listener of listeners.get('install') ?? []) listener(new ExtendableEvent('install'));
  await settle();

  return {
    stores,
    setOnline(value) { online = value; },
    get activations() { return activations; },
    async request(path, { navigate = false, method = 'GET' } = {}) {
      const request = new Request(new URL(path, origin), { method });
      if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
      const event = new FetchEvent(request);
      for (const listener of listeners.get('fetch') ?? []) listener(event);
      const response = event.response ? await event.response : undefined;
      await settle();
      return response;
    },
    async message(data) {
      for (const listener of listeners.get('message') ?? []) listener({ data });
      await settle();
    },
  };
}

test('manifest uses standalone display and ships correctly sized mobile icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', output), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'pt-BR');
  assert.equal(manifest.start_url, manifest.scope);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of [...manifest.icons, { src: 'icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const png = await readFile(new URL(icon.src, output));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
  }
});

test('offline navigation and build assets are served from the precache', async () => {
  const worker = await workerEnvironment();
  worker.setOnline(false);
  const response = await worker.request('/dashboard', { navigate: true });
  assert.match(await response.text(), /<div id="root"><\/div>/);
  const entries = [...worker.stores.values()].flatMap((store) => [...store.keys()]);
  assert.ok(entries.some((url) => /\/assets\/.*\.js/.test(url)));
  assert.ok(entries.some((url) => /\/assets\/.*\.css/.test(url)));
  assert.ok(entries.some((url) => /\/icons\/pwa-192\.png/.test(url)));
});

test('login stays on the network and has an independent offline fallback', async () => {
  const worker = await workerEnvironment();
  const online = await worker.request('/sign-in', { navigate: true });
  assert.equal(await online.text(), 'network response');
  worker.setOnline(false);
  const offline = await worker.request('/sign-in', { navigate: true });
  assert.match(await offline.text(), /Você está sem conexão/);
});

test('API, Clerk and writes never receive cached application HTML or cached data', async () => {
  const worker = await workerEnvironment();
  for (const path of ['/api/services', '/api/projects', '/api/summary', '/api/__clerk/v1/client', 'https://clerk.example.com/v1/client']) {
    assert.equal(await worker.request(path), undefined, path);
    if (path.startsWith('/')) {
      assert.equal(await worker.request(path, { navigate: true }), undefined, path);
    }
  }
  assert.equal(await worker.request('/api/services', { method: 'POST' }), undefined);
  const entries = [...worker.stores.values()].flatMap((store) => [...store.keys()]);
  assert.ok(entries.every((url) => !/\/api\/|__clerk|\/sign-in|\/sign-up/.test(url)));
});

test('an update only skips waiting after an explicit acceptance message', async () => {
  const worker = await workerEnvironment();
  assert.equal(worker.activations, 0);
  await worker.message({ type: 'UNRELATED' });
  assert.equal(worker.activations, 0);
  await worker.message({ type: 'SKIP_WAITING' });
  assert.equal(worker.activations, 1);
});

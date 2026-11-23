import http from 'node:http';
import { readJsonBody, sendJson, sleep } from './http-utils.ts';
import type { CarDocument, ClusterMetadata, KvRecord } from './types.ts';

const NODE_ID = process.env.NODE_ID ?? 'node-1';
const PORT = Number(process.env.PORT ?? 4001);
const COORDINATOR_URL = process.env.COORDINATOR_URL ?? 'http://127.0.0.1:4000';

let kvStore: KvRecord[] = [];
let carStore: CarDocument[] = [];
// Local document-partitioned secondary indexes (DDIA Fig 6-4)
const localColorIndex = new Map<string, Set<number>>();
const localMakeIndex = new Map<string, Set<number>>();
// Global term-partitioned secondary index shards hosted on this node (DDIA Fig 6-5)
const globalTermIndex = new Map<string, Set<number>>();

let artificialDelayMs = 0;
let overloaded = false;
let gossipEpoch = 0;
let gossipMetadata: ClusterMetadata | null = null;

function rebuildLocalIndexes(): void {
  localColorIndex.clear();
  localMakeIndex.clear();
  for (const car of carStore) {
    if (!localColorIndex.has(car.color)) localColorIndex.set(car.color, new Set());
    localColorIndex.get(car.color)!.add(car.id);
    if (!localMakeIndex.has(car.make)) localMakeIndex.set(car.make, new Set());
    localMakeIndex.get(car.make)!.add(car.id);
  }
}

async function applySimulatedDelay(): Promise<void> {
  if (artificialDelayMs > 0) {
    await sleep(artificialDelayMs);
  }
}

async function refreshMetadata(): Promise<void> {
  try {
    const res = await fetch(`${COORDINATOR_URL}/metadata`);
    if (!res.ok) return;
    const data = (await res.json()) as { metadata: ClusterMetadata };
    if (!gossipMetadata || data.metadata.epoch >= gossipEpoch) {
      gossipMetadata = data.metadata;
      gossipEpoch = data.metadata.epoch;
    }
  } catch {
    // Coordinator might still be starting up
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { nodeId: NODE_ID, ok: true, artificialDelayMs, overloaded, epoch: gossipEpoch });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/internal/dump') {
    sendJson(res, 200, {
      nodeId: NODE_ID,
      kvCount: kvStore.length,
      carCount: carStore.length,
      kv: kvStore,
      cars: carStore,
      localIndexes: {
        colors: Object.fromEntries([...localColorIndex.entries()].map(([k, v]) => [k, [...v]])),
        makes: Object.fromEntries([...localMakeIndex.entries()].map(([k, v]) => [k, [...v]])),
      },
      globalTermIndexes: Object.fromEntries([...globalTermIndex.entries()].map(([k, v]) => [k, [...v]])),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/internal/sync') {
    const body = await readJsonBody<{
      metadata?: ClusterMetadata;
      kv?: KvRecord[];
      cars?: CarDocument[];
      artificialDelayMs?: number;
      overloaded?: boolean;
    }>(req);
    if (body.metadata) {
      gossipMetadata = body.metadata;
      gossipEpoch = body.metadata.epoch;
    }
    if (Array.isArray(body.kv)) kvStore = body.kv;
    if (Array.isArray(body.cars)) {
      carStore = body.cars;
      rebuildLocalIndexes();
    }
    if (body.artificialDelayMs !== undefined) artificialDelayMs = body.artificialDelayMs;
    if (body.overloaded !== undefined) overloaded = body.overloaded;
    sendJson(res, 200, { ok: true, nodeId: NODE_ID, epoch: gossipEpoch });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/internal/clear') {
    const body = await readJsonBody<{ scope?: 'kv' | 'cars' | 'all' }>(req);
    const scope = body.scope ?? 'all';
    if (scope === 'kv' || scope === 'all') kvStore = [];
    if (scope === 'cars' || scope === 'all') {
      carStore = [];
      localColorIndex.clear();
      localMakeIndex.clear();
      globalTermIndex.clear();
    }
    sendJson(res, 200, { ok: true, nodeId: NODE_ID });
    return;
  }

  // KV write (keeps records sorted within partition like SSTables for range scans)
  if (req.method === 'POST' && url.pathname === '/kv') {
    await applySimulatedDelay();
    const record = await readJsonBody<KvRecord>(req);
    const idx = kvStore.findIndex((r) => r.key === record.key);
    if (idx >= 0) kvStore[idx] = record;
    else kvStore.push(record);
    kvStore.sort((a, b) => a.key.localeCompare(b.key));
    const countInPartition = kvStore.filter((r) => r.partitionId === record.partitionId).length;
    sendJson(res, 200, {
      ok: true,
      nodeId: NODE_ID,
      partitionId: record.partitionId,
      countInPartition,
      delayMs: artificialDelayMs,
    });
    return;
  }

  // KV point read or range scan within this node
  if (req.method === 'GET' && url.pathname === '/kv') {
    await applySimulatedDelay();
    const key = url.searchParams.get('key');
    const prefix = url.searchParams.get('prefix');
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    let matches = kvStore;
    if (key) {
      matches = kvStore.filter((r) => r.key === key);
    } else if (prefix) {
      matches = kvStore.filter((r) => r.key.startsWith(prefix));
    } else if (start || end) {
      matches = kvStore.filter((r) => (!start || r.key >= start) && (!end || r.key <= end));
    }
    sendJson(res, 200, { nodeId: NODE_ID, matches, scannedCount: kvStore.length, delayMs: artificialDelayMs });
    return;
  }

  // Write car document + update local secondary index
  if (req.method === 'POST' && url.pathname === '/cars') {
    await applySimulatedDelay();
    const car = await readJsonBody<CarDocument>(req);
    const idx = carStore.findIndex((c) => c.id === car.id);
    if (idx >= 0) carStore[idx] = car;
    else carStore.push(car);
    rebuildLocalIndexes();
    sendJson(res, 200, { ok: true, nodeId: NODE_ID, carId: car.id });
    return;
  }

  // Query local document-partitioned secondary index (DDIA Fig 6-4)
  if (req.method === 'GET' && url.pathname === '/cars/local-query') {
    await applySimulatedDelay();
    const color = url.searchParams.get('color');
    const make = url.searchParams.get('make');
    let ids: number[] | null = null;
    if (color) ids = [...(localColorIndex.get(color) ?? [])];
    if (make) {
      const makeSet = localMakeIndex.get(make) ?? new Set();
      ids = ids ? ids.filter((id) => makeSet.has(id)) : [...makeSet];
    }
    const idSet = new Set(ids ?? carStore.map((c) => c.id));
    const matches = carStore.filter((c) => idSet.has(c.id));
    sendJson(res, 200, { nodeId: NODE_ID, matches, delayMs: artificialDelayMs });
    return;
  }

  // Update global term-partitioned index shard (DDIA Fig 6-5)
  if (req.method === 'POST' && url.pathname === '/global-index') {
    await applySimulatedDelay();
    const body = await readJsonBody<{ term: string; docId: number }>(req);
    if (!globalTermIndex.has(body.term)) globalTermIndex.set(body.term, new Set());
    globalTermIndex.get(body.term)!.add(body.docId);
    sendJson(res, 200, { ok: true, nodeId: NODE_ID, term: body.term });
    return;
  }

  // Query global term-partitioned index shard
  if (req.method === 'GET' && url.pathname === '/global-index') {
    await applySimulatedDelay();
    const term = url.searchParams.get('term') ?? '';
    const docIds = [...(globalTermIndex.get(term) ?? [])];
    sendJson(res, 200, { nodeId: NODE_ID, term, docIds, delayMs: artificialDelayMs });
    return;
  }

  // MPP Stage 1: local scan + filter on cars (DDIA Section 6.5.1)
  if (req.method === 'GET' && url.pathname === '/mpp/scan') {
    await applySimulatedDelay();
    const minYear = Number(url.searchParams.get('minYear') ?? 0);
    const filtered = carStore.filter((c) => c.year >= minYear);
    sendJson(res, 200, { nodeId: NODE_ID, scanned: carStore.length, matched: filtered.length, rows: filtered });
    return;
  }

  // Any-node request forwarding (DDIA Fig 6-7 Approach 1)
  if (req.method === 'POST' && url.pathname === '/forward-get') {
    const body = await readJsonBody<{ key: string; targetNodeId: string; targetNodeUrl: string; staleHint?: boolean }>(req);
    if (body.targetNodeId === NODE_ID) {
      const hit = kvStore.find((r) => r.key === body.key) ?? null;
      sendJson(res, 200, { handledBy: NODE_ID, forwarded: false, record: hit });
      return;
    }
    const resp = await fetch(`${body.targetNodeUrl}/kv?key=${encodeURIComponent(body.key)}`);
    const data = (await resp.json()) as { matches: KvRecord[] };
    sendJson(res, 200, {
      entryNode: NODE_ID,
      forwardedTo: body.targetNodeId,
      forwarded: true,
      staleRedirect: Boolean(body.staleHint),
      record: data.matches[0] ?? null,
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${NODE_ID}] Shard storage node listening on :${PORT}`);
  setTimeout(refreshMetadata, 500);
});

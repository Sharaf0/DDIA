import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { md5First2Bytes, murmur3Hash32, perProcessHash } from './hash.ts';
import { fetchJson, readJsonBody, sendJson, sleep } from './http-utils.ts';
import type {
  CarDocument,
  ClusterMetadata,
  HopTrace,
  IndexMode,
  KvRecord,
  MppStage,
  PartitionAssignment,
  PartitionScheme,
  RoutingMode,
} from './types.ts';

const PORT = Number(process.env.PORT ?? 3060);
const COORDINATOR_URL = process.env.COORDINATOR_URL ?? 'http://127.0.0.1:4000';
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const CELEBRITY_SALT_BUCKETS = 10;
const asyncQueueStats = { pendingUpdates: 0, lastLagMs: 0 };

async function getCluster(): Promise<{
  metadata: ClusterMetadata;
  pendingPlan: unknown;
  cascadeLog: string[];
}> {
  const res = await fetchJson<{
    metadata: ClusterMetadata;
    pendingPlan: unknown;
    cascadeLog: string[];
  }>(`${COORDINATOR_URL}/metadata`);
  return res.data;
}

function getActiveNodes(meta: ClusterMetadata) {
  return meta.nodes.filter((n) => n.active);
}

/** Resolves which node/partition owns a KV key under a given DDIA 6.2 scheme. */
function resolveKvTarget(
  key: string,
  scheme: PartitionScheme,
  meta: ClusterMetadata,
): { partitionId: string; nodeId: string; nodeUrl: string; hashValue?: number } {
  const active = getActiveNodes(meta);
  const parts = meta.partitions;

  if (scheme === 'key_range' || scheme === 'sensor_prefixed') {
    if (meta.rebalanceStrategy === 'dynamic') {
      const match =
        parts.find((p) => key >= (p.keyMin ?? '') && key < (p.keyMax ?? '\uffff')) ??
        parts[parts.length - 1];
      const node = meta.nodes.find((n) => n.id === match.nodeId)!;
      return { partitionId: match.partitionId, nodeId: node.id, nodeUrl: node.url };
    }
    // Map lexicographical prefix [0..Z] into ordered active partitions
    const code = key.charCodeAt(0) || 0;
    const minC = 48; // '0'
    const maxC = 122; // 'z'
    const norm = Math.max(0, Math.min(0.9999, (code - minC) / (maxC - minC)));
    const pIdx = Math.floor(norm * active.length);
    const node = active[pIdx];
    return { partitionId: `r${pIdx}`, nodeId: node.id, nodeUrl: node.url };
  }

  // Hash or Cassandra Compound Key: hash ONLY the partition key portion
  const partitionKey = scheme === 'compound_key' ? key.split('|')[0] : key;
  const h = murmur3Hash32(partitionKey);

  if (meta.rebalanceStrategy === 'hash_mod_n') {
    const idx = h % active.length;
    const node = active[idx];
    return { partitionId: `p${idx}`, nodeId: node.id, nodeUrl: node.url, hashValue: h };
  }

  if (meta.rebalanceStrategy === 'dynamic') {
    const idx = h % parts.length;
    const part = parts[idx];
    const node = meta.nodes.find((n) => n.id === part.nodeId)!;
    return { partitionId: part.partitionId, nodeId: node.id, nodeUrl: node.url, hashValue: h };
  }

  const part = parts.find((p) => h >= (p.hashMin ?? 0) && h <= (p.hashMax ?? 0xffffffff)) ?? parts[0];
  const node = meta.nodes.find((n) => n.id === part.nodeId)!;
  return { partitionId: part.partitionId, nodeId: node.id, nodeUrl: node.url, hashValue: h };
}

/** Resolves global term-index shard (DDIA Fig 6-5: term string determines partition). */
function resolveTermShard(term: string, meta: ClusterMetadata): { nodeId: string; nodeUrl: string; shardLabel: string } {
  const active = getActiveNodes(meta);
  const h = murmur3Hash32(term);
  const node = active[h % active.length];
  return { nodeId: node.id, nodeUrl: node.url, shardLabel: `term-shard(${term}) -> ${node.id}` };
}

function resolveCarDocTarget(docId: number, meta: ClusterMetadata): { partitionId: string; nodeId: string; nodeUrl: string } {
  const active = getActiveNodes(meta);
  if (meta.rebalanceStrategy === 'hash_mod_n') {
    const idx = murmur3Hash32(`car:${docId}`) % active.length;
    const node = active[idx];
    return { partitionId: `p${idx}`, nodeId: node.id, nodeUrl: node.url };
  }
  const h = murmur3Hash32(`car:${docId}`);
  const part =
    meta.partitions.find((p) => h >= (p.hashMin ?? 0) && h <= (p.hashMax ?? 0xffffffff)) ??
    meta.partitions[h % meta.partitions.length];
  const node = meta.nodes.find((n) => n.id === part.nodeId)!;
  return { partitionId: part.partitionId, nodeId: node.id, nodeUrl: node.url };
}

async function clearClusterData(scope: 'kv' | 'cars' | 'all'): Promise<void> {
  const { metadata } = await getCluster();
  await Promise.all(
    metadata.nodes.map((n) =>
      fetchJson(`${n.url}/internal/clear`, { method: 'POST', body: { scope } }).catch(() => null),
    ),
  );
}

const DEFAULT_CARS: Array<Omit<CarDocument, 'partitionId'>> = [
  { id: 191, color: 'red', make: 'Honda', location: 'Palo Alto', year: 2021, price: 22500 },
  { id: 214, color: 'black', make: 'Dodge', location: 'San Jose', year: 2019, price: 18400 },
  { id: 306, color: 'red', make: 'Ford', location: 'Sunnyvale', year: 2022, price: 27900 },
  { id: 515, color: 'silver', make: 'Ford', location: 'Milpitas', year: 2020, price: 24100 },
  { id: 768, color: 'red', make: 'Volvo', location: 'Cupertino', year: 2023, price: 38900 },
  { id: 893, color: 'silver', make: 'Audi', location: 'Santa Clara', year: 2024, price: 45200 },
  { id: 912, color: 'blue', make: 'Honda', location: 'Mountain View', year: 2022, price: 25600 },
  { id: 944, color: 'red', make: 'Audi', location: 'Fremont', year: 2021, price: 36400 },
];

async function writeCarDocument(
  carInput: Omit<CarDocument, 'partitionId'>,
  indexMode: IndexMode,
  asyncLagMs: number,
  simulateDiyRace: boolean,
): Promise<{
  car: CarDocument;
  docWriteNode: string;
  indexWriteNodes: string[];
  totalLatencyMs: number;
  warnings: string[];
}> {
  const started = performance.now();
  const { metadata } = await getCluster();
  const docTarget = resolveCarDocTarget(carInput.id, metadata);
  const car: CarDocument = { ...carInput, partitionId: docTarget.partitionId };
  const warnings: string[] = [];

  await fetchJson(`${docTarget.nodeUrl}/cars`, { method: 'POST', body: car });

  const colorShard = resolveTermShard(`color:${car.color}`, metadata);
  const makeShard = resolveTermShard(`make:${car.make}`, metadata);
  const indexWriteNodes: string[] = [];

  if (indexMode === 'document_local') {
    indexWriteNodes.push(`${docTarget.nodeId} (local)`);
  } else if (simulateDiyRace) {
    // DDIA Footnote (ii): application writes document, then tries to update custom index and fails partially
    await fetchJson(`${colorShard.nodeUrl}/global-index`, {
      method: 'POST',
      body: { term: `color:${car.color}`, docId: car.id },
    });
    indexWriteNodes.push(`${colorShard.nodeId} (color only — make write crashed!)`);
    warnings.push(
      `DIY app-level index race (DDIA Footnote ii): doc #${car.id} & color:${car.color} written, but make:${car.make} update dropped!`,
    );
  } else if (indexMode === 'term_global_sync') {
    await Promise.all([
      fetchJson(`${colorShard.nodeUrl}/global-index`, {
        method: 'POST',
        body: { term: `color:${car.color}`, docId: car.id },
      }),
      fetchJson(`${makeShard.nodeUrl}/global-index`, {
        method: 'POST',
        body: { term: `make:${car.make}`, docId: car.id },
      }),
    ]);
    indexWriteNodes.push(colorShard.nodeId, makeShard.nodeId);
  } else {
    // Async global secondary index (DynamoDB GSI style)
    asyncQueueStats.pendingUpdates += 2;
    asyncQueueStats.lastLagMs = asyncLagMs;
    indexWriteNodes.push(`${colorShard.nodeId} (queued +${asyncLagMs}ms)`, `${makeShard.nodeId} (queued +${asyncLagMs}ms)`);
    warnings.push(
      `Global index update queued asynchronously (${asyncLagMs}ms lag). Immediate reads by color:${car.color} will miss #${car.id}!`,
    );
    void (async () => {
      await sleep(asyncLagMs);
      await Promise.all([
        fetchJson(`${colorShard.nodeUrl}/global-index`, {
          method: 'POST',
          body: { term: `color:${car.color}`, docId: car.id },
        }).catch(() => null),
        fetchJson(`${makeShard.nodeUrl}/global-index`, {
          method: 'POST',
          body: { term: `make:${car.make}`, docId: car.id },
        }).catch(() => null),
      ]);
      asyncQueueStats.pendingUpdates = Math.max(0, asyncQueueStats.pendingUpdates - 2);
    })();
  }

  return {
    car,
    docWriteNode: docTarget.nodeId,
    indexWriteNodes,
    totalLatencyMs: Number((performance.now() - started).toFixed(2)),
    warnings,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  // Serve UI
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Full live cluster snapshot
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const cluster = await getCluster();
    const dumps = await Promise.all(
      cluster.metadata.nodes.map(async (n) => {
        try {
          const r = await fetchJson<{
            nodeId: string;
            kvCount: number;
            carCount: number;
            kv: KvRecord[];
            cars: CarDocument[];
            localIndexes: Record<string, unknown>;
            globalTermIndexes: Record<string, number[]>;
          }>(`${n.url}/internal/dump`, { timeoutMs: 2000 });
          return r.data;
        } catch {
          return {
            nodeId: n.id,
            kvCount: 0,
            carCount: 0,
            kv: [],
            cars: [],
            localIndexes: {},
            globalTermIndexes: {},
          };
        }
      }),
    );
    sendJson(res, 200, {
      ...cluster,
      asyncQueueStats,
      dumps,
    });
    return;
  }

  // Lab 1 (Section 6.2): Key-value workload generator
  if (req.method === 'POST' && url.pathname === '/api/kv/burst') {
    const body = await readJsonBody<{
      scheme?: PartitionScheme;
      workload?: 'timestamps' | 'celebrity' | 'encyclopedia' | 'compound_users';
      count?: number;
      saltCelebrity?: boolean;
      clearFirst?: boolean;
    }>(req);
    const scheme: PartitionScheme = body.scheme ?? 'key_range';
    const workload = body.workload ?? 'timestamps';
    const count = Math.max(4, Math.min(80, Number(body.count ?? 24)));
    const saltCelebrity = Boolean(body.saltCelebrity);

    if (body.clearFirst !== false) {
      await clearClusterData('kv');
    }

    const { metadata } = await getCluster();
    const writesByNode: Record<string, number> = {};
    for (const n of getActiveNodes(metadata)) writesByNode[n.id] = 0;

    const sampleKeys: Array<{ key: string; nodeId: string; partitionId: string }> = [];
    const baseTime = Date.UTC(2026, 10, 23, 4, 15, 0);

    for (let i = 0; i < count; i++) {
      let key = '';
      let saltedFrom: string | undefined;

      if (workload === 'timestamps') {
        const ts = new Date(baseTime + i * 1000).toISOString().slice(0, 19);
        key = scheme === 'sensor_prefixed' ? `sensor_0${(i % 8) + 1}/${ts}` : ts;
      } else if (workload === 'celebrity') {
        const isCeleb = i % 5 !== 0; // 80% celebrity traffic
        if (isCeleb) {
          const base = 'celeb_bieber';
          if (saltCelebrity) {
            const salt = String(i % CELEBRITY_SALT_BUCKETS).padStart(2, '0');
            key = `${base}#${salt}:evt_${String(i).padStart(3, '0')}`;
            // Note: salt is attached to partition key portion so different partitions get writes
            saltedFrom = base;
          } else {
            key = base;
          }
        } else {
          key = `user_${100 + i}`;
        }
      } else if (workload === 'encyclopedia') {
        const words = [
          'Aardvark', 'Bayes', 'Ceara', 'Danube', 'Freon', 'Gaussian',
          'Holderlin', 'Krasnoje', 'Menage', 'Ottawa', 'Reti', 'Solovets', 'Trudeau', 'Zywiec',
        ];
        key = `${words[i % words.length]}_${i}`;
      } else {
        // compound_users: user_id | update_timestamp
        const uid = `user_${(i % 4) + 1}`;
        const ts = new Date(baseTime + i * 2000).toISOString().slice(0, 19);
        key = `${uid}|${ts}`;
      }

      const partitionRoutingKey =
        workload === 'celebrity' && saltCelebrity && saltedFrom
          ? `${saltedFrom}#${String(i % CELEBRITY_SALT_BUCKETS).padStart(2, '0')}`
          : key;
      const target = resolveKvTarget(partitionRoutingKey, scheme, metadata);
      writesByNode[target.nodeId] = (writesByNode[target.nodeId] ?? 0) + 1;

      const rec: KvRecord = {
        key,
        sortKey: key.includes('|') ? key.split('|')[1] : undefined,
        value: { seq: i, workload, scheme },
        partitionId: target.partitionId,
        saltedFrom,
        writtenAt: new Date().toISOString(),
      };
      const resp = await fetchJson<{ countInPartition: number }>(`${target.nodeUrl}/kv`, {
        method: 'POST',
        body: rec,
      });

      if (sampleKeys.length < 10) {
        sampleKeys.push({ key, nodeId: target.nodeId, partitionId: target.partitionId });
      }

      // Trigger dynamic split check if using dynamic strategy
      if (metadata.rebalanceStrategy === 'dynamic' && resp.data.countInPartition >= 10) {
        await fetchJson(`${COORDINATOR_URL}/rebalance/split-check`, {
          method: 'POST',
          body: { partitionId: target.partitionId, count: resp.data.countInPartition },
        });
      }
    }

    const counts = Object.values(writesByNode);
    const maxW = Math.max(...counts, 0);
    const minW = Math.min(...counts, 0);
    const avgW = counts.length ? count / counts.length : 0;

    sendJson(res, 200, {
      scheme,
      workload,
      saltCelebrity,
      totalWritten: count,
      writesByNode,
      skewRatio: minW > 0 ? Number((maxW / minW).toFixed(2)) : maxW > 0 ? '∞ (Hot Spot!)' : '1.0',
      hotSpotDetected: maxW > avgW * 1.6,
      sampleKeys,
    });
    return;
  }

  // Lab 1: Query / range scan / salted celebrity read demonstration
  if (req.method === 'GET' && url.pathname === '/api/kv/query') {
    const mode = url.searchParams.get('mode') ?? 'range';
    const scheme = (url.searchParams.get('scheme') ?? 'key_range') as PartitionScheme;
    const prefix = url.searchParams.get('prefix') ?? '';
    const { metadata } = await getCluster();
    const active = getActiveNodes(metaOrFallback(metadata));
    const started = performance.now();

    if (mode === 'compound_user' && scheme === 'compound_key') {
      const target = resolveKvTarget(prefix || 'user_1', 'compound_key', metadata);
      const r = await fetchJson<{ matches: KvRecord[] }>(
        `${target.nodeUrl}/kv?prefix=${encodeURIComponent((prefix || 'user_1') + '|')}`,
      );
      sendJson(res, 200, {
        mode,
        nodesQueried: [target.nodeId],
        scatterGather: false,
        matches: r.data.matches,
        elapsedMs: Number((performance.now() - started).toFixed(2)),
        note: `Single-partition SSTable range scan on ${target.nodeId} (hashed user_id, sorted timestamp).`,
      });
      return;
    }

    if (mode === 'salted_celebrity') {
      const queries = Array.from({ length: CELEBRITY_SALT_BUCKETS }, (_, b) => {
        const saltedKey = `celeb_bieber#${String(b).padStart(2, '0')}`;
        const t = resolveKvTarget(saltedKey, scheme, metadata);
        return { saltedKey, nodeId: t.nodeId, nodeUrl: t.nodeUrl };
      });
      const results = await Promise.all(
        queries.map(async (q) => {
          const r = await fetchJson<{ matches: KvRecord[] }>(`${q.nodeUrl}/kv?prefix=${encodeURIComponent(q.saltedKey)}`);
          return { nodeId: q.nodeId, count: r.data.matches.length, matches: r.data.matches };
        }),
      );
      const merged = results.flatMap((r) => r.matches);
      sendJson(res, 200, {
        mode,
        fanOutRequests: queries.length,
        nodesQueried: [...new Set(queries.map((q) => q.nodeId))],
        scatterGather: true,
        matches: merged,
        elapsedMs: Number((performance.now() - started).toFixed(2)),
        note: `Read tax: had to query all ${CELEBRITY_SALT_BUCKETS} salted keys (#00..#09) and merge ${merged.length} records!`,
      });
      return;
    }

    // Range query: single/subset partition under key_range, scatter/gather under hash!
    const allResults = await Promise.all(
      active.map(async (n) => {
        const r = await fetchJson<{ matches: KvRecord[] }>(
          `${n.url}/kv?prefix=${encodeURIComponent(prefix)}`,
        );
        return { nodeId: n.id, matches: r.data.matches };
      }),
    );
    const touchedNodes =
      scheme === 'hash'
        ? active.map((n) => n.id)
        : allResults.filter((r) => r.matches.length > 0).map((r) => r.nodeId);

    sendJson(res, 200, {
      mode,
      nodesQueried: scheme === 'hash' ? active.map((n) => n.id) : touchedNodes,
      scatterGather: scheme === 'hash' || scheme === 'sensor_prefixed',
      matches: allResults.flatMap((r) => r.matches),
      elapsedMs: Number((performance.now() - started).toFixed(2)),
      note:
        scheme === 'hash'
          ? 'Hash partitioning destroyed key sort order -> must scatter/gather ALL active nodes for a range scan!'
          : 'Key-range keeps keys sorted inside partitions -> targeted range scan!',
    });
    return;
  }

  // Lab 1: Java Object.hashCode() vs Murmur3 / MD5 cross-process demo (Section 6.2.2)
  if (req.method === 'GET' && url.pathname === '/api/hash-trap') {
    const key = url.searchParams.get('key') ?? '2014-04-19 17:08:10';
    const { metadata } = await getCluster();
    const n = getActiveNodes(metadata).length;
    const processA = perProcessHash(key, 0x12345678);
    const processB = perProcessHash(key, 0x9e3779b9);
    const murmur = murmur3Hash32(key);
    const md5_2b = md5First2Bytes(key);
    sendJson(res, 200, {
      key,
      unsafeProcessA: { hash: processA, partition: processA % n },
      unsafeProcessB: { hash: processB, partition: processB % n },
      deterministicMurmur3: { hash: murmur, partition: murmur % n },
      deterministicMd5First2Bytes: { hash: md5_2b, partition: Math.floor((md5_2b / 65536) * 8) },
    });
    return;
  }

  // Lab 2 (Section 6.3): Seed used-cars dataset (DDIA Fig 6-4 & 6-5)
  if (req.method === 'POST' && url.pathname === '/api/cars/seed') {
    const body = await readJsonBody<{ indexMode?: IndexMode }>(req);
    const indexMode: IndexMode = body.indexMode ?? 'document_local';
    await clearClusterData('cars');
    const results = [];
    for (const car of DEFAULT_CARS) {
      results.push(await writeCarDocument(car, indexMode, 0, false));
    }
    sendJson(res, 200, { seeded: results.length, indexMode, results });
    return;
  }

  // Lab 2: Write a single car document (test sync vs async GSI lag vs DIY race condition)
  if (req.method === 'POST' && url.pathname === '/api/cars/write') {
    const body = await readJsonBody<{
      id?: number;
      color?: string;
      make?: string;
      location?: string;
      year?: number;
      price?: number;
      indexMode?: IndexMode;
      asyncLagMs?: number;
      simulateDiyRace?: boolean;
    }>(req);
    const carInput = {
      id: Number(body.id ?? Math.floor(100 + Math.random() * 899)),
      color: (body.color ?? 'purple').toLowerCase(),
      make: body.make ?? 'Ferrari',
      location: body.location ?? 'Berlin',
      year: Number(body.year ?? 2024),
      price: Number(body.price ?? 89000),
    };
    const result = await writeCarDocument(
      carInput,
      body.indexMode ?? 'term_global_async',
      Number(body.asyncLagMs ?? 2000),
      Boolean(body.simulateDiyRace),
    );
    sendJson(res, 200, result);
    return;
  }

  // Lab 2: Search cars by secondary index (Scatter/Gather vs Global Term Lookup)
  if (req.method === 'GET' && url.pathname === '/api/cars/search') {
    const indexMode = (url.searchParams.get('indexMode') ?? 'document_local') as IndexMode;
    const color = url.searchParams.get('color')?.toLowerCase() ?? 'red';
    const make = url.searchParams.get('make') ?? '';
    const { metadata } = await getCluster();
    const active = getActiveNodes(metadata);
    const started = performance.now();

    if (indexMode === 'document_local') {
      const perNode = await Promise.all(
        active.map(async (node) => {
          const qs = new URLSearchParams();
          if (color) qs.set('color', color);
          if (make) qs.set('make', make);
          const r = await fetchJson<{ nodeId: string; matches: CarDocument[]; delayMs: number }>(
            `${node.url}/cars/local-query?${qs.toString()}`,
          );
          return { nodeId: node.id, elapsedMs: r.elapsedMs, matches: r.data.matches, artificialDelayMs: r.data.delayMs };
        }),
      );
      const totalMs = Number((performance.now() - started).toFixed(2));
      const slowest = perNode.reduce((a, b) => (b.elapsedMs > a.elapsedMs ? b : a), perNode[0]);
      sendJson(res, 200, {
        indexMode,
        scatterGather: true,
        nodesQueried: active.length,
        totalMs,
        tailLatencyDriver: slowest?.nodeId ?? null,
        perNodeTimings: perNode.map((p) => ({ nodeId: p.nodeId, elapsedMs: p.elapsedMs, hits: p.matches.length })),
        matches: perNode.flatMap((p) => p.matches),
        explanation: `Scatter/Gather queried all ${active.length} nodes in parallel. Overall latency (${totalMs}ms) was dictated by slowest node ${slowest?.nodeId} (${slowest?.elapsedMs}ms)!`,
      });
      return;
    }

    // Global Term-Partitioned Index Lookup (only 1 index shard queried for color!)
    const term = `color:${color}`;
    const shard = resolveTermShard(term, metadata);
    const idxRes = await fetchJson<{ nodeId: string; docIds: number[] }>(
      `${shard.nodeUrl}/global-index?term=${encodeURIComponent(term)}`,
    );
    const docIds = idxRes.data.docIds;
    const fetchedDocs: CarDocument[] = [];
    for (const docId of docIds) {
      const docTarget = resolveCarDocTarget(docId, metadata);
      const d = await fetchJson<{ cars: CarDocument[] }>(`${docTarget.nodeUrl}/internal/dump`);
      const found = d.data.cars.find((c) => c.id === docId);
      if (found && (!make || found.make.toLowerCase() === make.toLowerCase())) {
        fetchedDocs.push(found);
      }
    }

    const totalMs = Number((performance.now() - started).toFixed(2));
    sendJson(res, 200, {
      indexMode,
      scatterGather: false,
      indexShardQueried: shard.nodeId,
      term,
      totalMs,
      pendingAsyncUpdates: asyncQueueStats.pendingUpdates,
      perNodeTimings: [{ nodeId: shard.nodeId, elapsedMs: idxRes.elapsedMs, hits: docIds.length }],
      matches: fetchedDocs,
      explanation: `Term-partitioned lookup queried ONLY ${shard.nodeId} for "${term}" (avoiding scatter/gather across ${active.length} nodes).`,
    });
    return;
  }

  // Lab 4 (Section 6.5): Request routing hop tracer (Fig 6-7 & Fig 6-8)
  if (req.method === 'POST' && url.pathname === '/api/routing/trace') {
    const body = await readJsonBody<{ key?: string; mode?: RoutingMode; simulateStaleGossip?: boolean }>(req);
    const key = body.key ?? 'Danube';
    const mode: RoutingMode = body.mode ?? 'routing_tier_zk';
    const simulateStaleGossip = Boolean(body.simulateStaleGossip);
    const { metadata } = await getCluster();
    const active = getActiveNodes(metadata);
    const target = resolveKvTarget(key, 'hash', metadata);
    const hops: HopTrace[] = [];

    if (mode === 'any_node_gossip') {
      const entryNode = active.find((n) => n.id !== target.nodeId) ?? active[0];
      if (simulateStaleGossip) {
        const wrongNode = active.find((n) => n.id !== target.nodeId && n.id !== entryNode.id) ?? active[1] ?? active[0];
        hops.push(
          {
            from: 'Client',
            to: entryNode.id,
            action: `GET "${key}" (Round-robin LB)`,
            detail: `Client contacts any node (${entryNode.id})`,
            durationMs: 4,
          },
          {
            from: entryNode.id,
            to: wrongNode.id,
            action: 'Gossip Forward (STALE)',
            detail: `${entryNode.id} gossip table (epoch ${metadata.epoch - 1}) thinks "${key}" is on ${wrongNode.id}!`,
            durationMs: 12,
            staleRedirect: true,
          },
          {
            from: wrongNode.id,
            to: target.nodeId,
            action: 'Re-forward to True Owner',
            detail: `${wrongNode.id} forwards to current owner ${target.nodeId} (epoch ${metadata.epoch})`,
            durationMs: 9,
          },
        );
      } else {
        const fwdRes = await fetchJson<{ forwarded: boolean; entryNode?: string; forwardedTo?: string }>(
          `${entryNode.url}/forward-get`,
          {
            method: 'POST',
            body: { key, targetNodeId: target.nodeId, targetNodeUrl: target.nodeUrl },
          },
        );
        hops.push(
          {
            from: 'Client',
            to: entryNode.id,
            action: `GET "${key}" (Round-robin LB)`,
            detail: `Client connects to arbitrary node ${entryNode.id}`,
            durationMs: 4,
          },
          {
            from: entryNode.id,
            to: target.nodeId,
            action: 'Node-to-Node Forward',
            detail: `${entryNode.id} checks gossip ring and forwards to ${target.nodeId} (${target.partitionId})`,
            durationMs: fwdRes.elapsedMs,
          },
        );
      }
    } else if (mode === 'routing_tier_zk') {
      hops.push(
        {
          from: 'ZooKeeper',
          to: 'Router Tier',
          action: `Watch Epoch #${metadata.epoch}`,
          detail: 'Router already holds authoritative ZooKeeper partition->node watch update',
          durationMs: 1,
        },
        {
          from: 'Client',
          to: 'Router Tier',
          action: `GET "${key}"`,
          detail: 'Client sends request to partition-aware routing tier (mongos / Helix / moxi style)',
          durationMs: 3,
        },
        {
          from: 'Router Tier',
          to: target.nodeId,
          action: `Route -> ${target.partitionId}`,
          detail: `Router sends directly to ${target.nodeId} (${target.partitionId})`,
          durationMs: 5,
        },
      );
    } else {
      hops.push(
        {
          from: 'ZooKeeper',
          to: 'Smart Client',
          action: `Metadata Sync (Epoch #${metadata.epoch})`,
          detail: 'Partition-aware client subscribes to cluster topology',
          durationMs: 1,
        },
        {
          from: 'Smart Client',
          to: target.nodeId,
          action: `Direct GET "${key}"`,
          detail: `Client connects straight to ${target.nodeId} (${target.partitionId}) — zero intermediate hops!`,
          durationMs: 4,
        },
      );
    }

    sendJson(res, 200, {
      key,
      mode,
      epoch: metadata.epoch,
      targetNodeId: target.nodeId,
      targetPartitionId: target.partitionId,
      totalHops: hops.filter((h) => h.from !== 'ZooKeeper').length,
      hops,
    });
    return;
  }

  // Lab 4 (Section 6.5.1): MPP Parallel Query Execution Visualizer
  if (req.method === 'POST' && url.pathname === '/api/mpp/query') {
    const body = await readJsonBody<{ minYear?: number }>(req);
    const minYear = Number(body.minYear ?? 2020);
    const { metadata } = await getCluster();
    const active = getActiveNodes(metadata);

    const stages: MppStage[] = [];

    // Stage 1: Parallel Local Scan & Filter on every shard container
    const s1Start = performance.now();
    const scanResults = await Promise.all(
      active.map(async (n) => {
        const r = await fetchJson<{ nodeId: string; scanned: number; matched: number; rows: CarDocument[] }>(
          `${n.url}/mpp/scan?minYear=${minYear}`,
        );
        return r.data;
      }),
    );
    stages.push({
      stage: 1,
      name: 'Parallel Local Scan & Filter',
      description: `Every node scans its own local partitions in parallel for WHERE year >= ${minYear}.`,
      perNodeOutput: Object.fromEntries(
        scanResults.map((r) => [r.nodeId, `${r.matched}/${r.scanned} rows matched`]),
      ),
      durationMs: Number((performance.now() - s1Start).toFixed(2)),
    });

    // Stage 2: Hash Shuffle by GROUP BY key (make) across nodes
    const s2Start = performance.now();
    const shuffledByNode: Record<string, CarDocument[]> = {};
    for (const n of active) shuffledByNode[n.id] = [];
    for (const r of scanResults) {
      for (const row of r.rows) {
        const destNode = active[murmur3Hash32(row.make) % active.length].id;
        shuffledByNode[destNode].push(row);
      }
    }
    stages.push({
      stage: 2,
      name: 'Hash Shuffle by GROUP BY (make)',
      description: 'Rows with the same `make` are routed to the same worker node so aggregation runs in parallel.',
      perNodeOutput: Object.fromEntries(
        Object.entries(shuffledByNode).map(([nid, rows]) => [
          nid,
          [...new Set(rows.map((r) => r.make))].map((m) => `${m}(${rows.filter((x) => x.make === m).length})`).join(', ') || 'idle',
        ]),
      ),
      durationMs: Number((performance.now() - s2Start + 4).toFixed(2)),
    });

    // Stage 3: Parallel Aggregation on each node
    const s3Start = performance.now();
    const partialsByNode: Record<string, Array<{ make: string; count: number; avgPrice: number }>> = {};
    for (const [nid, rows] of Object.entries(shuffledByNode)) {
      const byMake = new Map<string, CarDocument[]>();
      for (const row of rows) {
        if (!byMake.has(row.make)) byMake.set(row.make, []);
        byMake.get(row.make)!.push(row);
      }
      partialsByNode[nid] = [...byMake.entries()].map(([make, list]) => ({
        make,
        count: list.length,
        avgPrice: Math.round(list.reduce((acc, x) => acc + x.price, 0) / list.length),
      }));
    }
    stages.push({
      stage: 3,
      name: 'Parallel Partial Aggregation',
      description: 'Each node computes COUNT(*) and AVG(price) independently for its assigned makes.',
      perNodeOutput: partialsByNode,
      durationMs: Number((performance.now() - s3Start + 2).toFixed(2)),
    });

    const finalRows = Object.values(partialsByNode).flat().sort((a, b) => b.count - a.count || a.make.localeCompare(b.make));
    stages.push({
      stage: 4,
      name: 'Coordinator Final Gather',
      description: 'Coordinator collects pre-aggregated summaries (not raw rows!) and returns final SQL result.',
      perNodeOutput: { coordinator: finalRows },
      durationMs: 1.2,
    });

    sendJson(res, 200, {
      sql: `SELECT make, COUNT(*), ROUND(AVG(price)) FROM cars WHERE year >= ${minYear} GROUP BY make;`,
      stages,
      finalRows,
    });
    return;
  }

  // Proxy coordinator actions cleanly through /api/coordinator/*
  if (url.pathname.startsWith('/api/coordinator/')) {
    const targetPath = url.pathname.replace('/api/coordinator', '');
    const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
    const proxied = await fetchJson(`${COORDINATOR_URL}${targetPath}`, { method: req.method, body });
    sendJson(res, proxied.status, proxied.data);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

function metaOrFallback(meta: ClusterMetadata): ClusterMetadata {
  return meta;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[router] DDIA Chapter 6 Visual Lab & Router listening on http://localhost:${PORT}`);
});

import http from 'node:http';
import { murmur3Hash32 } from './hash.ts';
import { fetchJson, readJsonBody, sendJson } from './http-utils.ts';
import type {
  CarDocument,
  ClusterMetadata,
  KvRecord,
  NodeDescriptor,
  PartitionAssignment,
  RebalanceStrategy,
} from './types.ts';

const PORT = Number(process.env.PORT ?? 4000);
const FIXED_PARTITION_COUNT = 16;
const DYNAMIC_SPLIT_THRESHOLD = 10;

const rawNodes = (
  process.env.SHARD_NODES ??
  'node-1:http://127.0.0.1:4001,node-2:http://127.0.0.1:4002,node-3:http://127.0.0.1:4003,node-4:http://127.0.0.1:4004,node-5:http://127.0.0.1:4005,node-6:http://127.0.0.1:4006'
)
  .split(',')
  .map((entry) => {
    const idx = entry.indexOf(':');
    return { id: entry.slice(0, idx), url: entry.slice(idx + 1) };
  });

const nodes: NodeDescriptor[] = rawNodes.map((n, idx) => ({
  id: n.id,
  url: n.url,
  active: idx < 4,
  capacityWeight: 1,
  overloaded: false,
  artificialDelayMs: 0,
  status: idx < 4 ? 'healthy' : 'standby',
}));

let epoch = 1;
let rebalanceStrategy: RebalanceStrategy = 'fixed';
let preSplitDynamic = true;
let autoRebalance = false;
let gossipLagMs = 2500;
let partitions: PartitionAssignment[] = [];
let lastRebalanceSummary: ClusterMetadata['lastRebalanceSummary'] = null;
let pendingPlan: { reason: string; targetNodeId: string; suggestedPartitions: string[] } | null = null;
let cascadeLog: string[] = [];

const sseClients = new Set<http.ServerResponse>();

function activeNodes(): NodeDescriptor[] {
  return nodes.filter((n) => n.active);
}

/** Builds partition assignments according to the selected DDIA 6.4.1 strategy. */
function buildPartitions(strategy: RebalanceStrategy, active: NodeDescriptor[]): PartitionAssignment[] {
  if (active.length === 0) return [];

  if (strategy === 'hash_mod_n') {
    return active.map((node, idx) => ({
      partitionId: `p${idx}`,
      index: idx,
      nodeId: node.id,
      rangeLabel: `hash(key) % ${active.length} == ${idx}`,
    }));
  }

  if (strategy === 'fixed') {
    const maxHash = 0xffffffff;
    const step = Math.floor(maxHash / FIXED_PARTITION_COUNT);
    const activeIds = new Set(active.map((n) => n.id));
    const totalWeight = active.reduce((s, n) => s + Math.max(1, Math.min(3, Math.round(n.capacityWeight))), 0);

    // Target partition count per active node proportional to capacityWeight
    const targetCounts = new Map<string, number>();
    let assignedSum = 0;
    active.forEach((n, idx) => {
      const w = Math.max(1, Math.min(3, Math.round(n.capacityWeight)));
      const cnt =
        idx === active.length - 1
          ? FIXED_PARTITION_COUNT - assignedSum
          : Math.round((FIXED_PARTITION_COUNT * w) / totalWeight);
      targetCounts.set(n.id, cnt);
      assignedSum += cnt;
    });

    // Keep existing owners where possible so only stolen partitions migrate (DDIA Fig 6-6)
    const previousFixed =
      partitions.length === FIXED_PARTITION_COUNT && partitions[0]?.partitionId === 'p0' ? partitions : null;
    const owners: Array<string | null> = Array.from({ length: FIXED_PARTITION_COUNT }, (_, idx) => {
      const prevOwner = previousFixed?.[idx]?.nodeId;
      return prevOwner && activeIds.has(prevOwner) ? prevOwner : null;
    });

    const currentCounts = new Map<string, number>();
    for (const id of activeIds) currentCounts.set(id, 0);
    owners.forEach((owner, idx) => {
      if (!owner) return;
      const count = currentCounts.get(owner) ?? 0;
      const limit = targetCounts.get(owner) ?? 0;
      if (count < limit) {
        currentCounts.set(owner, count + 1);
      } else {
        owners[idx] = null; // Mark surplus partition to be stolen by under-loaded/new node
      }
    });

    const underloaded: string[] = [];
    for (const n of active) {
      const need = (targetCounts.get(n.id) ?? 0) - (currentCounts.get(n.id) ?? 0);
      for (let k = 0; k < need; k++) underloaded.push(n.id);
    }

    let uIdx = 0;
    return Array.from({ length: FIXED_PARTITION_COUNT }, (_, idx) => {
      const hashMin = idx * step;
      const hashMax = idx === FIXED_PARTITION_COUNT - 1 ? maxHash : (idx + 1) * step - 1;
      const nodeId = owners[idx] ?? underloaded[uIdx++] ?? active[idx % active.length].id;
      return {
        partitionId: `p${idx}`,
        index: idx,
        nodeId,
        hashMin,
        hashMax,
        rangeLabel: `H[${(hashMin >>> 24).toString(16).padStart(2, '0')}..${(hashMax >>> 24).toString(16).padStart(2, '0')}]`,
      };
    });
  }

  if (strategy === 'dynamic') {
    if (!preSplitDynamic) {
      return [
        {
          partitionId: 'p0',
          index: 0,
          nodeId: active[0].id,
          keyMin: '',
          keyMax: '\uffff',
          rangeLabel: '[ALL KEYS -> Cold Start Single Partition]',
        },
      ];
    }
    const bounds = ['', 'G', 'N', 'T', '\uffff'];
    return Array.from({ length: 4 }, (_, idx) => ({
      partitionId: `p${idx}`,
      index: idx,
      nodeId: active[idx % active.length].id,
      keyMin: bounds[idx],
      keyMax: bounds[idx + 1],
      rangeLabel: `${bounds[idx] || 'START'} – ${bounds[idx + 1] === '\uffff' ? 'END' : bounds[idx + 1]}`,
    }));
  }

  // proportional (Cassandra vnode style: 4 vnodes per active node)
  const vnodesPerNode = 4;
  const totalVnodes = active.length * vnodesPerNode;
  const maxHash = 0xffffffff;
  const step = Math.floor(maxHash / totalVnodes);
  return Array.from({ length: totalVnodes }, (_, idx) => {
    const hashMin = idx * step;
    const hashMax = idx === totalVnodes - 1 ? maxHash : (idx + 1) * step - 1;
    const node = active[idx % active.length];
    return {
      partitionId: `v${idx}`,
      index: idx,
      nodeId: node.id,
      hashMin,
      hashMax,
      rangeLabel: `vnode-${idx} (${node.id})`,
    };
  });
}

function assignKeyToPartition(key: string, currentPartitions: PartitionAssignment[], strategy: RebalanceStrategy): PartitionAssignment {
  if (strategy === 'dynamic') {
    for (const p of currentPartitions) {
      const min = p.keyMin ?? '';
      const max = p.keyMax ?? '\uffff';
      if (key >= min && key < max) return p;
    }
    return currentPartitions[currentPartitions.length - 1];
  }
  const h = murmur3Hash32(key);
  if (strategy === 'hash_mod_n') {
    return currentPartitions[h % currentPartitions.length];
  }
  for (const p of currentPartitions) {
    if (h >= (p.hashMin ?? 0) && h <= (p.hashMax ?? 0xffffffff)) return p;
  }
  return currentPartitions[0];
}

function getMetadata(): ClusterMetadata {
  return {
    epoch,
    rebalanceStrategy,
    preSplitDynamic,
    autoRebalance,
    gossipLagMs,
    nodes,
    partitions,
    lastRebalanceSummary,
  };
}

function broadcastSse(): void {
  const payload = `data: ${JSON.stringify({ metadata: getMetadata(), pendingPlan, cascadeLog })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function gatherClusterRecords(): Promise<{ kv: KvRecord[]; cars: CarDocument[] }> {
  const allKv: KvRecord[] = [];
  const allCars: CarDocument[] = [];
  await Promise.all(
    nodes.map(async (node) => {
      try {
        const res = await fetchJson<{ kv: KvRecord[]; cars: CarDocument[] }>(`${node.url}/internal/dump`, {
          timeoutMs: 2500,
        });
        if (Array.isArray(res.data.kv)) allKv.push(...res.data.kv);
        if (Array.isArray(res.data.cars)) allCars.push(...res.data.cars);
      } catch {
        // Node may be unreachable during simulated failure
      }
    }),
  );
  return { kv: allKv, cars: allCars };
}

async function pushStateToNodes(
  kvByNode?: Record<string, KvRecord[]>,
  carsByNode?: Record<string, CarDocument[]>,
): Promise<void> {
  const meta = getMetadata();
  await Promise.all(
    nodes.map(async (node) => {
      try {
        await fetchJson(`${node.url}/internal/sync`, {
          method: 'POST',
          body: {
            metadata: meta,
            ...(kvByNode ? { kv: kvByNode[node.id] ?? [] } : {}),
            ...(carsByNode ? { cars: carsByNode[node.id] ?? [] } : {}),
            artificialDelayMs: node.artificialDelayMs,
            overloaded: node.overloaded,
          },
          timeoutMs: 3000,
        });
      } catch {
        // Ignore unreachable standby/failed node
      }
    }),
  );
}

/**
 * Performs a real data rebalance across containers and computes exact key movement metrics.
 */
async function executeRebalance(eventLabel: string, customPartitions?: PartitionAssignment[]): Promise<void> {
  const oldKeyOwners = new Map<string, string>();
  const oldPartitionOwners = new Map<string, string>();
  for (const p of partitions) oldPartitionOwners.set(p.partitionId, p.nodeId);

  const { kv, cars } = await gatherClusterRecords();
  for (const r of kv) {
    const oldP = partitions.find((p) => p.partitionId === r.partitionId);
    if (oldP) oldKeyOwners.set(`kv:${r.key}`, oldP.nodeId);
  }
  for (const c of cars) {
    const oldP = partitions.find((p) => p.partitionId === c.partitionId);
    if (oldP) oldKeyOwners.set(`car:${c.id}`, oldP.nodeId);
  }

  const nextPartitions = customPartitions ?? buildPartitions(rebalanceStrategy, activeNodes());
  partitions = nextPartitions;
  epoch += 1;

  const kvByNode: Record<string, KvRecord[]> = {};
  const carsByNode: Record<string, CarDocument[]> = {};
  for (const n of nodes) {
    kvByNode[n.id] = [];
    carsByNode[n.id] = [];
  }

  let movedKeys = 0;
  const totalKeys = kv.length + cars.length;

  for (const rec of kv) {
    const targetP = assignKeyToPartition(rec.key, partitions, rebalanceStrategy);
    const prevNode = oldKeyOwners.get(`kv:${rec.key}`);
    if (prevNode && prevNode !== targetP.nodeId) movedKeys += 1;
    kvByNode[targetP.nodeId].push({ ...rec, partitionId: targetP.partitionId });
  }

  for (const car of cars) {
    const targetP = assignKeyToPartition(`car:${car.id}`, partitions, rebalanceStrategy);
    const prevNode = oldKeyOwners.get(`car:${car.id}`);
    if (prevNode && prevNode !== targetP.nodeId) movedKeys += 1;
    carsByNode[targetP.nodeId].push({ ...car, partitionId: targetP.partitionId });
  }

  const movedPartitions = partitions
    .filter((p) => oldPartitionOwners.get(p.partitionId) && oldPartitionOwners.get(p.partitionId) !== p.nodeId)
    .map((p) => p.partitionId);

  lastRebalanceSummary = {
    event: eventLabel,
    movedKeys,
    totalKeys,
    movedPercent: totalKeys > 0 ? Number(((movedKeys / totalKeys) * 100).toFixed(1)) : 0,
    movedPartitions,
    timestamp: new Date().toISOString(),
  };

  await pushStateToNodes(kvByNode, carsByNode);
  broadcastSse();
}

/** Splits an oversized dynamic key-range partition in half like a B-Tree node. */
async function splitDynamicPartition(partitionId: string): Promise<boolean> {
  if (rebalanceStrategy !== 'dynamic') return false;
  const idx = partitions.findIndex((p) => p.partitionId === partitionId);
  if (idx === -1) return false;
  const target = partitions[idx];
  const { kv } = await gatherClusterRecords();
  const keysInPartition = kv.filter((r) => r.partitionId === partitionId).map((r) => r.key).sort();
  if (keysInPartition.length < 2) return false;

  const midKey = keysInPartition[Math.floor(keysInPartition.length / 2)];
  const active = activeNodes();
  const nextNode = active[(active.findIndex((n) => n.id === target.nodeId) + 1) % active.length];

  const left: PartitionAssignment = {
    partitionId: `${target.partitionId}a`,
    index: idx,
    nodeId: target.nodeId,
    keyMin: target.keyMin ?? '',
    keyMax: midKey,
    rangeLabel: `${target.keyMin || 'START'} – ${midKey}`,
  };
  const right: PartitionAssignment = {
    partitionId: `${target.partitionId}b`,
    index: idx + 1,
    nodeId: nextNode.id,
    keyMin: midKey,
    keyMax: target.keyMax ?? '\uffff',
    rangeLabel: `${midKey} – ${target.keyMax === '\uffff' ? 'END' : target.keyMax}`,
  };

  const next = [...partitions.slice(0, idx), left, right, ...partitions.slice(idx + 1)].map((p, i) => ({
    ...p,
    index: i,
  }));
  await executeRebalance(`Dynamic split ${partitionId} at "${midKey}" -> ${left.nodeId} & ${right.nodeId}`, next);
  return true;
}

partitions = buildPartitions(rebalanceStrategy, activeNodes());

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, epoch, activeNodes: activeNodes().length });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/metadata') {
    sendJson(res, 200, { metadata: getMetadata(), pendingPlan, cascadeLog });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ metadata: getMetadata(), pendingPlan, cascadeLog })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/config') {
    const body = await readJsonBody<{
      rebalanceStrategy?: RebalanceStrategy;
      preSplitDynamic?: boolean;
      autoRebalance?: boolean;
      gossipLagMs?: number;
    }>(req);
    const strategyChanged = body.rebalanceStrategy && body.rebalanceStrategy !== rebalanceStrategy;
    const preSplitChanged = body.preSplitDynamic !== undefined && body.preSplitDynamic !== preSplitDynamic;
    if (body.rebalanceStrategy) rebalanceStrategy = body.rebalanceStrategy;
    if (body.preSplitDynamic !== undefined) preSplitDynamic = body.preSplitDynamic;
    if (body.autoRebalance !== undefined) autoRebalance = body.autoRebalance;
    if (body.gossipLagMs !== undefined) gossipLagMs = body.gossipLagMs;

    if (strategyChanged || preSplitChanged) {
      await executeRebalance(`Switched strategy to ${rebalanceStrategy}`);
    } else {
      await pushStateToNodes();
      broadcastSse();
    }
    sendJson(res, 200, { metadata: getMetadata(), pendingPlan, cascadeLog });
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/nodes/')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const nodeId = parts[1];
    const action = parts[2];
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
      sendJson(res, 404, { error: `Unknown node ${nodeId}` });
      return;
    }

    if (action === 'activate') {
      node.active = true;
      node.overloaded = false;
      node.artificialDelayMs = 0;
      node.status = 'healthy';
      await executeRebalance(`Node ${nodeId} joined cluster`);
      sendJson(res, 200, { metadata: getMetadata(), cascadeLog });
      return;
    }

    if (action === 'deactivate') {
      if (activeNodes().length <= 2) {
        sendJson(res, 400, { error: 'Keep at least 2 active nodes in the cluster' });
        return;
      }
      node.active = false;
      node.status = 'standby';
      await executeRebalance(`Node ${nodeId} removed from cluster`);
      sendJson(res, 200, { metadata: getMetadata(), cascadeLog });
      return;
    }

    if (action === 'weight') {
      const body = await readJsonBody<{ capacityWeight: number }>(req);
      node.capacityWeight = Math.max(1, Math.min(3, Number(body.capacityWeight ?? 1)));
      await executeRebalance(`Updated ${nodeId} hardware weight to ${node.capacityWeight}x`);
      sendJson(res, 200, { metadata: getMetadata() });
      return;
    }

    if (action === 'delay') {
      const body = await readJsonBody<{ artificialDelayMs: number }>(req);
      node.artificialDelayMs = Math.max(0, Math.min(2000, Number(body.artificialDelayMs ?? 0)));
      node.status = node.artificialDelayMs > 150 ? 'slow' : 'healthy';
      await fetchJson(`${node.url}/internal/sync`, {
        method: 'POST',
        body: { metadata: getMetadata(), artificialDelayMs: node.artificialDelayMs, overloaded: node.overloaded },
      });
      broadcastSse();
      sendJson(res, 200, { metadata: getMetadata() });
      return;
    }

    if (action === 'overload') {
      node.overloaded = true;
      node.artificialDelayMs = 450;
      node.status = 'slow';
      cascadeLog = [
        `[t=0ms] ${nodeId} CPU spikes to 98% (GC pause / heavy query). Response latency 450ms.`,
      ];

      if (autoRebalance) {
        node.status = 'suspected_dead';
        node.active = false;
        cascadeLog.push(
          `[t=300ms] Auto-failure detector marks slow ${nodeId} as DEAD (false positive!).`,
          `[t=350ms] Auto-rebalancer immediately dumps ${nodeId}'s partitions across surviving nodes!`,
        );
        await executeRebalance(`AUTO-REBALANCE triggered by suspected failure of ${nodeId}`);
        const survivors = activeNodes();
        if (survivors[0]) {
          survivors[0].overloaded = true;
          survivors[0].artificialDelayMs = 400;
          survivors[0].status = 'slow';
          cascadeLog.push(
            `[t=900ms] Rebalance transfer I/O + redirected traffic overloads ${survivors[0].id} -> CASCADING FAILURE RISK!`,
          );
        }
        pendingPlan = null;
      } else {
        const affected = partitions.filter((p) => p.nodeId === nodeId).map((p) => p.partitionId);
        pendingPlan = {
          reason: `${nodeId} heartbeat slowed (450ms). Auto-rebalance is OFF — waiting for human approval before moving ${affected.length} partitions.`,
          targetNodeId: nodeId,
          suggestedPartitions: affected,
        };
        cascadeLog.push(
          `[t=300ms] Coordinator flags ${nodeId} slow, proposes rebalance plan (${affected.join(', ')}), and PAUSES for operator approval.`,
        );
      }

      broadcastSse();
      sendJson(res, 200, { metadata: getMetadata(), pendingPlan, cascadeLog });
      return;
    }

    if (action === 'recover') {
      for (const n of nodes) {
        n.overloaded = false;
        n.artificialDelayMs = 0;
        n.status = n.active ? 'healthy' : 'standby';
      }
      if (!node.active) node.active = true;
      node.status = 'healthy';
      pendingPlan = null;
      cascadeLog.push(`[recovered] ${nodeId} stabilized and healthy without cascading storm.`);
      await executeRebalance(`Recovered ${nodeId}`);
      sendJson(res, 200, { metadata: getMetadata(), pendingPlan, cascadeLog });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/rebalance/approve') {
    if (!pendingPlan) {
      sendJson(res, 400, { error: 'No pending rebalance plan' });
      return;
    }
    const target = nodes.find((n) => n.id === pendingPlan?.targetNodeId);
    if (target) {
      target.active = false;
      target.status = 'standby';
    }
    cascadeLog.push(`[approved] Operator committed rebalance away from ${pendingPlan.targetNodeId}.`);
    pendingPlan = null;
    await executeRebalance('Operator-approved rebalance');
    sendJson(res, 200, { metadata: getMetadata(), pendingPlan, cascadeLog });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/rebalance/split-check') {
    const body = await readJsonBody<{ partitionId: string; count?: number }>(req);
    const shouldSplit = (body.count ?? DYNAMIC_SPLIT_THRESHOLD) >= DYNAMIC_SPLIT_THRESHOLD;
    if (shouldSplit) {
      const didSplit = await splitDynamicPartition(body.partitionId);
      sendJson(res, 200, { split: didSplit, metadata: getMetadata() });
      return;
    }
    sendJson(res, 200, { split: false, metadata: getMetadata() });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/reset') {
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].active = i < 4;
      nodes[i].capacityWeight = 1;
      nodes[i].overloaded = false;
      nodes[i].artificialDelayMs = 0;
      nodes[i].status = i < 4 ? 'healthy' : 'standby';
    }
    rebalanceStrategy = 'fixed';
    preSplitDynamic = true;
    autoRebalance = false;
    pendingPlan = null;
    cascadeLog = [];
    lastRebalanceSummary = null;
    partitions = buildPartitions(rebalanceStrategy, activeNodes());
    epoch = 1;
    await pushStateToNodes({}, {});
    broadcastSse();
    sendJson(res, 200, { metadata: getMetadata() });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[coordinator] ZooKeeper-style metadata coordinator listening on :${PORT}`);
});

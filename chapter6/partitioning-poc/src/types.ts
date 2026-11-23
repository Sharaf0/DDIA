export type PartitionScheme =
  | 'key_range'
  | 'sensor_prefixed'
  | 'hash'
  | 'compound_key';

export type IndexMode =
  | 'document_local'
  | 'term_global_sync'
  | 'term_global_async';

export type RebalanceStrategy =
  | 'hash_mod_n'
  | 'fixed'
  | 'dynamic'
  | 'proportional';

export type RoutingMode =
  | 'any_node_gossip'
  | 'routing_tier_zk'
  | 'smart_client';

export interface NodeDescriptor {
  id: string;
  url: string;
  active: boolean;
  capacityWeight: number;
  overloaded: boolean;
  artificialDelayMs: number;
  status: 'healthy' | 'slow' | 'suspected_dead' | 'standby';
}

export interface PartitionAssignment {
  partitionId: string;
  index: number;
  nodeId: string;
  rangeLabel: string;
  hashMin?: number;
  hashMax?: number;
  keyMin?: string;
  keyMax?: string;
}

export interface ClusterMetadata {
  epoch: number;
  rebalanceStrategy: RebalanceStrategy;
  preSplitDynamic: boolean;
  autoRebalance: boolean;
  gossipLagMs: number;
  nodes: NodeDescriptor[];
  partitions: PartitionAssignment[];
  lastRebalanceSummary: {
    event: string;
    movedKeys: number;
    totalKeys: number;
    movedPercent: number;
    movedPartitions: string[];
    timestamp: string;
  } | null;
}

export interface KvRecord {
  key: string;
  sortKey?: string;
  value: Record<string, unknown>;
  partitionId: string;
  saltedFrom?: string;
  writtenAt: string;
}

export interface CarDocument {
  id: number;
  color: string;
  make: string;
  location: string;
  year: number;
  price: number;
  partitionId: string;
}

export interface HopTrace {
  from: string;
  to: string;
  action: string;
  detail: string;
  durationMs: number;
  staleRedirect?: boolean;
}

export interface MppStage {
  stage: number;
  name: string;
  description: string;
  perNodeOutput: Record<string, unknown>;
  durationMs: number;
}

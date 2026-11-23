# DDIA Chapter 6 — Self-Guided Partitioning Lab (Student & Presenter Onboarding)

This project is a **live, 8-container distributed database cluster** built for **Designing Data-Intensive Applications — Chapter 6 (Partitioning)**.

You do **not** need Node.js or any libraries installed on your laptop—only **Docker Desktop** (or Docker Engine + Compose). Everything runs inside containers, and the web dashboard includes **built-in numbered walkthrough buttons** so any student can run and understand every experiment independently.

---

## 1. Quick Start (2 Minutes)

Open a terminal in this folder and start the cluster:

```bash
cd chapter6/partitioning-poc
docker compose up --build -d
```

Wait ~5 seconds for the containers to start, then open your browser to:

**http://localhost:3060**

When you are finished with the session, stop and clean up all containers:

```bash
docker compose down
```

---

## 2. What Just Started? (The 8 Containers)

Think of this as a miniature distributed database running on your laptop:

| Container | Port | Role in DDIA Chapter 6 |
|---|---|---|
| `coordinator` | `:4000` | **ZooKeeper-style metadata store** — tracks the cluster `Epoch`, which node owns which partition, overload alerts, and rebalancing plans. |
| `node-1` .. `node-4` | `:4001`–`:4004` | **4 active database shard nodes** — store real sorted key-value partitions, local secondary indexes, and global term-index shards. |
| `node-5` .. `node-6` | `:4005`–`:4006` | **2 standby nodes** — idle until you click **+ Add Standby Node** during the rebalancing labs. |
| `router` | `:3060` | **Routing tier + MPP query engine + Web UI** — routes client requests, orchestrates parallel SQL stages, and serves the dashboard. |

---

## 3. Built-In Interactive Spotlight Tour (Inside the Browser)

At the top-right of `http://localhost:3060`, click **🎓 Start Guided Tour (15 Steps)** (or use the section quick-jump buttons right below the header). An **Intro.js-style spotlight tour** dims the screen, highlights each control and live shard panel step-by-step, executes the real multi-container cluster experiment in real time, and lets you step through with **Next →**, **← Back**, or your keyboard arrow keys:

### Tab 1: `6.2 Key-Value & Hot Spots`
- **Step 1 — Timestamp Hot Spot:** Writes 28 sequential timestamps (`2026-11-23T04:15:xx`) under *Key Range*. Watch `node-1` turn red (`100% HOT`, `Skew: ∞`) while `node-2..4` sit completely idle.
- **Step 2 — Sensor-Prefix Fix:** Switches to `sensor_01/timestamp` keys. Writes spread evenly across all 4 nodes, **but** look at the JSON result at the bottom-left: scanning across sensors now triggers `scatterGather: true`.
- **Step 3 — Celebrity Hot Key:** Fires 80% of traffic to the *exact same key* (`celeb_bieber`) under *Hash Partitioning*. Proves that hashing cannot split identical keys.
- **Step 4 — Salting + Read Tax:** Appends a random bucket (`celeb_bieber#00..#09`). Writes balance cleanly, while reading the celebrity now pays a **10-request scatter/gather tax** (`fanOutRequests: 10`).
- **Step 5 — Cassandra Compound Key:** Uses `(user_id | timestamp)`. Hashes `user_1` to pick 1 partition and sorts timestamps inside that node's SSTable → `scatterGather: false` (1 node read).
- **Step 6 — Language Hash Trap:** Compares a simulated per-process `hashCode()` (Process A vs Process B returning *different* nodes!) against deterministic `Murmur3` and `MD5` (Figure 6-3).

### Tab 2: `6.3 Secondary Indexes & Tail Latency`
- **Step 1 — Local Index (Figure 6-4):** Seeds the 8 used cars (`191 red Honda`, `214 black Dodge`, etc.) and searches `color=red`. All 4 nodes are queried in parallel (Scatter/Gather) in ~2–4ms.
- **Step 2 — Tail Latency Amplification:** Injects a `450ms` GC pause on `node-2` and runs the exact same search. Notice `node-1`, `node-3`, and `node-4` finish in ~2ms, **yet the entire query waits 450ms+** for the slowest node.
- **Step 3 — Global Term Index (Figure 6-5):** Switches to Term-Partitioned indexing. Searching `color=red` now hits **only 1 index shard** (no scatter/gather across all nodes).
- **Step 4 — Async GSI Lag (DynamoDB Style):** Writes a `purple Ferrari` in async mode and immediately searches `color=purple` → **0 matches**! Wait ~2.5 seconds and click **Search Cars** again to watch it appear once async propagation catches up.
- **Step 5 — Footnote (ii) DIY App-Level Index Race:** Simulates writing a car and updating `color` while crashing before `make` updates — showing why DIY app-level indexes drift out of sync.

### Tab 3: `6.4 Rebalancing & Death Spiral`
- **Step 1 — `hash mod N` Disaster:** Seeds 28 keys and adds `node-5` under `hash(key) mod N`. Watch **~80% of all keys** turn red and move across containers.
- **Step 2 — Fixed Partitions (Figure 6-6):** Resets to 4 nodes, seeds 28 keys under Fixed Partitions (`16` partitions), and adds `node-5`. Only **4 stolen partitions (~20–25% of keys)** move.
- **Step 3 — Dynamic Cold-Start Trap:** Turns *Pre-Split* OFF and writes keys under Dynamic Range Splitting — everything piles onto `node-1` until the 10-key split threshold triggers!
- **Step 4 — Safe Human-in-the-Loop:** Overloads `node-2` (`450ms`) with Auto-Rebalance OFF. The coordinator flags `node-2` slow, proposes a plan, and **pauses for operator approval** (`Approve Manual Plan` button).
- **Step 5 — Auto-Rebalance Death Spiral:** Turns Auto-Rebalance ON and overloads `node-2`. False failure detection marks `node-2` dead, dumps its partitions across surviving nodes, and triggers a **cascading overload** on `node-1`!

### Tab 4: `6.5 Request Routing & MPP SQL`
- **Step 1 — Any-Node Gossip (Stale):** Traces key `Danube` when gossip is stale after a rebalance → **3-hop redirect** (`Client → Entry Node → Wrong Node → True Owner`).
- **Step 2 — ZooKeeper Routing Tier (Figure 6-8):** Router holds the latest ZooKeeper epoch watch → **2 hops** (`Client → Router → Owning Node`).
- **Step 3 — Smart Client (Figure 6-7 #3):** Partition-aware client connects directly to the owning node → **1 hop**.
- **Step 4 — MPP Parallel SQL (Section 6.5.1):** Runs `SELECT make, COUNT(*), ROUND(AVG(price)) FROM cars WHERE year >= 2020 GROUP BY make` across all active containers and visualizes all 4 stages: *Parallel Scan & Filter → Hash Shuffle by `make` → Parallel Partial Aggregation → Coordinator Final Gather*.

---

## 4. Troubleshooting

- **Cluster got into a messy state during experimentation?** Click the white **Reset Cluster** button in the top-right header (`Epoch` resets and all 4 initial nodes return to healthy).
- **Port `3060` or `4000–4006` already in use?** Stop any previous run with `docker compose down`.
- **Want to test from the terminal (`curl`)?**
  ```bash
  # Trigger timestamp hot spot
  curl -s -X POST http://localhost:3060/api/kv/burst -H "Content-Type: application/json" -d '{"scheme":"key_range","workload":"timestamps","count":28}'
  # Run 4-stage MPP SQL query
  curl -s -X POST http://localhost:3060/api/mpp/query -H "Content-Type: application/json" -d '{"minYear":2020}'
  ```

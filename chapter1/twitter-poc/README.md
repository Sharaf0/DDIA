# Twitter Hybrid Architecture Timeline POC

A minimal proof of concept demonstrating Twitter's hybrid architecture for timeline generation, as described in *Designing Data-Intensive Applications*.

## Architecture Overview

This POC implements a **hybrid approach** to timeline generation:

1. **Normal Users** (< 5 followers): Tweets are "fanned out" to followers' Redis caches at **write time**
2. **Celebrities** (≥ 5 followers): Tweets are fetched from PostgreSQL and merged at **read time**

This approach balances write throughput and read latency, avoiding the "celebrity problem" where a single tweet could trigger millions of cache updates.

## Tech Stack

- **Node.js + TypeScript**: Application logic
- **PostgreSQL**: Primary data store (users, follows, tweets)
- **Redis**: In-memory timeline caches
- **RabbitMQ**: Asynchronous message queue for fan-out processing
- **Docker + Docker Compose**: Containerized infrastructure

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local development)

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- RabbitMQ (ports 5672, 15672)
- App service (port 3000)
- Worker service

### 2. Seed the Database

```bash
# Wait for services to be healthy (about 10-15 seconds)
docker compose exec app npm run seed
```

This creates:
- 1 Celebrity user (6 followers - above threshold)
- 10 Normal users (below threshold)
- Follow relationships as specified

### 3. Test the System

#### Post a tweet from a normal user (will fan-out):

```bash
curl -X POST http://localhost:3000/tweet \
  -H "Content-Type: application/json" \
  -d '{"userId": 2, "text": "Hello from a normal user!"}'
```

Expected behavior:
- Tweet saved to PostgreSQL
- Fan-out message sent to RabbitMQ
- Worker pushes tweet ID to followers' Redis lists

#### Post a tweet from the celebrity (will NOT fan-out):

```bash
curl -X POST http://localhost:3000/tweet \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "text": "Celebrity announcement!"}'
```

Expected behavior:
- Tweet saved to PostgreSQL
- NO fan-out (celebrity threshold reached)
- Will be fetched and merged at read time

#### Get a user's timeline:

```bash
curl http://localhost:3000/timeline/2
```

Expected behavior:
- Fetches cached tweets from Redis
- Queries celebrity tweets from PostgreSQL
- Merges and sorts by timestamp
- Returns top 20 tweets

## Performance Measurements

The application logs detailed performance metrics:

### Write Path (`POST /tweet`)
- Total API response time (excluding async processing)
- Fan-out decision logic

### Read Path (`GET /timeline/:userId`)
- Redis fetch time
- Database celebrity query time
- Merge & sort time
- Total response time

Example output:
```
Redis fetch: 2.345ms
DB Celebrity Query: 15.678ms
Merge & Sort: 0.234ms
Total GET /timeline response time: 18.567ms
```

## Project Structure

```
twitter-hybrid-poc/
├── docker-compose.yml          # Infrastructure definition
├── Dockerfile                  # App container build
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
└── src/
    ├── db.ts                   # Database connections & config
    ├── index.ts                # Express API server
    ├── worker.ts               # RabbitMQ consumer
    └── seed.ts                 # Test data generator
```

## Database Schema

### Users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL
);
```

### Follows
```sql
CREATE TABLE follows (
  follower_id INTEGER REFERENCES users(id),
  followee_id INTEGER REFERENCES users(id),
  PRIMARY KEY (follower_id, followee_id)
);
```

### Tweets
```sql
CREATE TABLE tweets (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER REFERENCES users(id),
  text TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Hybrid Logic Explained

### Write Path (POST /tweet)

1. Save tweet to PostgreSQL
2. Count followers: `SELECT COUNT(*) FROM follows WHERE followee_id = userId`
3. **Decision Point:**
   - If `followerCount < CELEBRITY_THRESHOLD (5)`:
     - Send message to RabbitMQ with tweet ID + follower list
     - Worker asynchronously pushes to Redis caches
   - If `followerCount >= CELEBRITY_THRESHOLD`:
     - Skip fan-out entirely
     - Rely on read-time merge

### Worker (Async Fan-out)

1. Consume messages from RabbitMQ
2. For each follower:
   - `LPUSH timeline:{userId} {tweetId}`
   - `LTRIM timeline:{userId} 0 19` (keep last 20)

### Read Path (GET /timeline/:userId)

1. **Step A**: Fetch cached tweet IDs from Redis
2. **Step B**: Query celebrity tweets from PostgreSQL
3. **Step C**: Merge, deduplicate, sort by timestamp, return top 20

## Stopping the System

```bash
# Stop all services
docker compose down

# Stop and remove volumes (clears data)
docker compose down -v
```

## Local Development (Without Docker)

1. Start PostgreSQL, Redis, and RabbitMQ locally
2. Set environment variables:
   ```bash
   export DATABASE_URL=postgres://postgres:postgres@localhost:5432/twitter_poc
   export REDIS_URL=redis://localhost:6379
   export RABBITMQ_URL=amqp://guest:guest@localhost:5672
   ```
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Run seed: `npm run seed`
6. Start server: `npm run start`
7. Start worker (in another terminal): `npm run worker`

## RabbitMQ Management UI

Access at: http://localhost:15672
- Username: `guest`
- Password: `guest`

Monitor queue depth, message rates, and worker consumption.

## Key Takeaways

1. **Hybrid architecture** solves the celebrity problem
2. **Write-time fan-out** for normal users keeps reads fast
3. **Read-time merge** for celebrities avoids write amplification
4. **Async processing** (RabbitMQ) decouples write API from fan-out work
5. **Redis caching** provides sub-millisecond timeline reads
6. **Performance logging** helps identify bottlenecks

## Further Exploration

- Try different `CELEBRITY_THRESHOLD` values
- Add more users and observe scaling behavior
- Monitor RabbitMQ queue depth under load
- Implement pagination for timelines
- Add tweet deletion with cache invalidation
- Experiment with batch fan-out strategies

---

**Based on concepts from:** *Designing Data-Intensive Applications* by Martin Kleppmann

import { Pool } from 'pg';
import { createClient } from 'redis';
import amqp from 'amqplib';

export const CELEBRITY_THRESHOLD = 5;
export const QUEUE_NAME = 'tweet_fanout';

// PostgreSQL Connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/twitter_poc',
});

// Redis Connection
export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});



export async function connectRabbitMQ(): Promise<amqp.Channel> {
  // Use module-level singleton for channel
  if ((connectRabbitMQ as any).channel) {
    return (connectRabbitMQ as any).channel;
  }

  const url = process.env.RABBITMQ_URL;
  if (!url) {
    throw new Error('RABBITMQ_URL is not defined in environment variables');
  }
  const rabbitmqConnection = await amqp.connect(url);
  const rabbitmqChannel = await rabbitmqConnection.createChannel();
  await rabbitmqChannel.assertQueue(QUEUE_NAME, { durable: true });

  (connectRabbitMQ as any).channel = rabbitmqChannel;
  return rabbitmqChannel;
}

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS follows (
        follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        followee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (follower_id, followee_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tweets (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tweets_sender_timestamp 
      ON tweets(sender_id, timestamp DESC)
    `);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

export async function connectRedis() {
  await redisClient.connect();
  console.log('Redis connected successfully');
}

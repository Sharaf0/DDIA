import express from 'express';
import { pool, redisClient, connectRabbitMQ, initializeDatabase, connectRedis, CELEBRITY_THRESHOLD, QUEUE_NAME } from './db';

const app = express();
app.use(express.json());

interface Tweet {
  id: number;
  sender_id: number;
  text: string;
  timestamp: Date;
}

// POST /tweet - Write Path with Hybrid Logic
app.post('/tweet', async (req, res) => {
  const startTime = Date.now();

  try {
    const { userId, text } = req.body;

    if (!userId || !text) {
      return res.status(400).json({ error: 'userId and text are required' });
    }

    // Save tweet to Postgres
    const tweetResult = await pool.query(
      'INSERT INTO tweets (sender_id, text) VALUES ($1, $2) RETURNING id, sender_id, text, timestamp',
      [userId, text]
    );
    const tweet = tweetResult.rows[0];

    // Check follower count
    const followerCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM follows WHERE followee_id = $1',
      [userId]
    );
    const followerCount = parseInt(followerCountResult.rows[0].count);

    console.log(`Tweet ${tweet.id} by user ${userId} has ${followerCount} followers`);

    // Hybrid Logic: Fan-out only for non-celebrities
    if (followerCount < CELEBRITY_THRESHOLD) {
      console.log(`User ${userId} is NOT a celebrity. Initiating fan-out.`);

      // Get all followers
      const followersResult = await pool.query(
        'SELECT follower_id FROM follows WHERE followee_id = $1',
        [userId]
      );

      const channel = await connectRabbitMQ();

      // Publish message to RabbitMQ for async processing
      const message = {
        tweetId: tweet.id,
        followers: followersResult.rows.map(row => row.follower_id)
      };

      channel.sendToQueue(
        QUEUE_NAME,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );

      console.log(`Fan-out message queued for tweet ${tweet.id} to ${followersResult.rows.length} followers`);
    } else {
      console.log(`User ${userId} IS a celebrity. Skipping fan-out (will be merged at read time).`);
    }

    const endTime = Date.now();
    console.log(`POST /tweet API response time: ${endTime - startTime}ms`);

    res.json({
      success: true,
      tweet,
      isCelebrity: followerCount >= CELEBRITY_THRESHOLD,
      followerCount
    });
  } catch (error) {
    console.error('Error posting tweet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const fetchTweetIdsFromRedis = async (userId: string): Promise<Tweet[]> => {
  try {


    console.time('Redis fetch');
    const cachedTweetIds = await redisClient.lRange(`timeline:${userId}`, 0, -1);
    console.timeEnd('Redis fetch');

    let cachedTweets: Tweet[] = [];
    if (cachedTweetIds.length > 0) {
      const tweetIdsStr = cachedTweetIds.join(',');
      const result = await pool.query(
        `SELECT id, sender_id, text, timestamp 
         FROM tweets 
         WHERE id = ANY($1::int[])
         ORDER BY timestamp DESC`,
        [cachedTweetIds]
      );
      cachedTweets = result.rows;
    }
    return cachedTweets;
  } catch (error) {
    console.error('Error fetching tweets from Redis:', error);
    throw error;
  }
}

const fetchCelebrityTweetsFromDB = async (userId: string): Promise<Tweet[]> => {
  try {
    console.time('DB Celebrity Query');
    const celebrityTweetsResult = await pool.query(
      `SELECT t.id, t.sender_id, t.text, t.timestamp
       FROM tweets t
       INNER JOIN follows f ON t.sender_id = f.followee_id
       WHERE f.follower_id = $1
         AND (SELECT COUNT(*) FROM follows WHERE followee_id = t.sender_id) >= $2
       ORDER BY t.timestamp DESC
       LIMIT 20`,
      [userId, CELEBRITY_THRESHOLD]
    );
    const celebrityTweets: Tweet[] = celebrityTweetsResult.rows;
    console.timeEnd('DB Celebrity Query');
    return celebrityTweets;
  } catch (error) {
    console.error('Error fetching celebrity tweets from DB:', error);
    throw error;
  }
}

// GET /timeline/:userId - Read Path with Celebrity Merge
app.get('/timeline/:userId', async (req, res) => {
  const totalStartTime = Date.now();

  try {
    const userId = req.params.userId;

    // Check if userId is provided
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Check if user exists, considering sql injection
    const userCheckResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    if (userCheckResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Step A: Fetch tweet IDs from Redis cache
    const cachedTweets = await fetchTweetIdsFromRedis(userId);

    // Step B: Query celebrity tweets
    const celebrityTweets = await fetchCelebrityTweetsFromDB(userId);

    // Step C: Merge and sort
    console.time('Merge & Sort');
    const allTweets = [...cachedTweets, ...celebrityTweets];

    // Remove duplicates (in case of edge cases)
    const uniqueTweets = Array.from(
      new Map(allTweets.map(tweet => [tweet.id, tweet])).values()
    );

    // Sort by timestamp descending
    uniqueTweets.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Take top 20
    const timeline = uniqueTweets.slice(0, 20);
    console.timeEnd('Merge & Sort');

    const totalEndTime = Date.now();
    console.log(`Total GET /timeline response time: ${totalEndTime - totalStartTime}ms`);

    res.json({
      userId,
      timeline,
      stats: {
        cachedTweets: cachedTweets.length,
        celebrityTweets: celebrityTweets.length,
        totalUnique: uniqueTweets.length,
        returned: timeline.length
      }
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users - List all users
app.get('/users', async (req, res) => {
  console.log('Fetching all users');
  try {
    const result = await pool.query('SELECT id, username FROM users ORDER BY id ASC');
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// GET /followers/:userId - List followers of a user
app.get('/followers/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log(`Fetching followers for user ${userId}`);
  try {
    const result = await pool.query(
      `SELECT u.id, u.username
       FROM users u
       INNER JOIN follows f ON u.id = f.follower_id
       WHERE f.followee_id = $1
       ORDER BY u.id ASC`,
      [userId]
    );
    res.json({ followers: result.rows });
  } catch (error) {
    console.error(`Error fetching followers for user ${userId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await initializeDatabase();
    await connectRedis();
    await connectRabbitMQ();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

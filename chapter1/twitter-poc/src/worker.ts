import { connectRabbitMQ, connectRedis, redisClient, QUEUE_NAME } from './db';

// Worker process to handle fan-out of tweets to followers' timelines
// Listens to RabbitMQ queue for new tweet messages
// For each message, updates Redis timelines of all relevant followers
//
async function startWorker() {
  try {
    await connectRedis();
    const channel = await connectRabbitMQ();

    console.log('Worker started. Waiting for messages...');

    channel.consume(
      QUEUE_NAME,
      async (msg) => {
        if (!msg) return;

        try {
          const message = JSON.parse(msg.content.toString());
          const { tweetId, followers } = message;

          console.log(`Processing fan-out for tweet ${tweetId} to ${followers.length} followers`);

          const startTime = Date.now();

          // Fan-out to all followers' Redis timelines
          for (const followerId of followers) {
            const timelineKey = `timeline:${followerId}`;
            
            // Add tweet ID to the beginning of the list
            await redisClient.lPush(timelineKey, tweetId.toString());
            
            // Trim to keep only last 20 items
            await redisClient.lTrim(timelineKey, 0, 19);
          }

          const endTime = Date.now();
          console.log(`Fan-out completed for tweet ${tweetId} in ${endTime - startTime}ms`);

          // Acknowledge the message, i.e., mark as processed
          channel.ack(msg);
        } catch (error) {
          console.error('Error processing message:', error);
          // Reject and requeue the message
          channel.nack(msg, false, true);
        }
      },
      { noAck: false }
    );
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker();

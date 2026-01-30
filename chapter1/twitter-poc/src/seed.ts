import { pool, initializeDatabase, connectRedis } from './db';

async function seed() {
  try {
    await initializeDatabase();
    await connectRedis();

    const client = await pool.connect();
    //console.log('Seeding database with initial data...');
    try {
      // Clear existing data
      //await client.query('TRUNCATE users, follows, tweets CASCADE');
      //console.log('Cleared existing data');

      // Create 1 Celebrity user
      const currentTime = Date.now();
      const celebrityResult = await client.query(
        `INSERT INTO users (username) VALUES ('celebrity${currentTime}') RETURNING id`
      );
      const celebrityId = celebrityResult.rows[0].id;
      //console.log(`Created Celebrity user (ID: ${celebrityId})`);

      // Create n Normal users, n is a random number between 20 and 100
      const n = Math.floor(Math.random() * (100 - 20 + 1)) + 20;
      console.log(`Seeding ${n} Normal users and 1 Celebrity user...`);
      const normalUserIds: number[] = [];
      for (let i = 1; i <= n; i++) {
        const username = `user${i}_${currentTime}`;
        const result = await client.query(
          `INSERT INTO users (username) VALUES ($1) RETURNING id`,
          [username]
        );
        normalUserIds.push(result.rows[0].id);
      }
      //console.log(`Created ${n} Normal users (IDs: ${normalUserIds.join(', ')})`);

      // Celebrity follows 2 Normal users
      await client.query(
        'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)',
        [celebrityId, normalUserIds[0]]
      );
      await client.query(
        'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)',
        [celebrityId, normalUserIds[1]]
      );
      //console.log(`Celebrity follows user${normalUserIds[0]} and user${normalUserIds[1]}`);

      // 60% of Normal users follow the Celebrity (triggers celebrity threshold of 5)
      const numFollowers = Math.ceil(n * 0.6);
      for (let i = 0; i < numFollowers; i++) {
        await client.query(
          'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)',
          [normalUserIds[i], celebrityId]
        );
      }
      //console.log(`${numFollowers} Normal users now follow Celebrity (triggers threshold)`);

      // Normal users follow each other randomly (below threshold)
      for (let i = 0; i < normalUserIds.length; i++) {
        for (let j = i + 1; j < normalUserIds.length && j < i + 4; j++) {
          await client.query(
            'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)',
            [normalUserIds[i], normalUserIds[j]]
          );
        }
      }
      //console.log('Normal users follow each other randomly');

      // Verify follower counts
      const counts = await client.query(`
        SELECT u.username, u.id, COUNT(f.follower_id) as follower_count
        FROM users u
        LEFT JOIN follows f ON u.id = f.followee_id
        GROUP BY u.id, u.username
        ORDER BY follower_count DESC
      `);

      //console.log('\nFollower counts:');
      // counts.rows.forEach(row => {
      //   console.log(`  ${row.username} (ID: ${row.id}): ${row.follower_count} followers`);
      // });

      //console.log('\n✅ Seeding completed successfully!');
    } finally {
      client.release();
      await pool.end();
      process.exit(0);
    }
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();

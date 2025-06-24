const { TwitterApi } = require("twitter-api-v2");
const { getDb, getSetting, addTweet, addLog } = require("./db.js");

/**
 * Create Twitter client
 */
async function createTwitterClient(credentials = null) {
  // Use provided credentials or get from environment/settings
  const apiKey = credentials?.apiKey || process.env.TWITTER_API_KEY;
  const apiSecret = credentials?.apiSecret || process.env.TWITTER_API_SECRET;
  const accessToken =
    credentials?.accessToken || process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret =
    credentials?.accessSecret || process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error("Twitter API credentials not found");
  }

  console.log(
    `Api keys found: ${apiKey}, ${apiSecret}, ${accessToken}, ${accessSecret}`
  );

  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
}

/**
 * Test Twitter API connection
 */
async function testTwitterConnection(credentials) {
  try {
    const client = await createTwitterClient(credentials);
    const rwClient = client.readWrite;

    // Verify credentials by getting the authenticated user
    const user = await rwClient.v2.me();

    return {
      success: true,
      user: user.data,
    };
  } catch (error) {
    console.error("Error testing Twitter API connection:", error);
    throw new Error(`Twitter API connection failed: ${error.message}`);
  }
}

async function safeUserTimeline(client, userId, options) {
  try {
    return await client.v2.userTimeline(userId, options);
  } catch (err) {
    if (err.code === 429 && err.rateLimit) {
      const waitTime = err.rateLimit.reset * 1000 - Date.now();
      console.warn(
        `⏳ Rate limit hit. Waiting ${Math.ceil(waitTime / 1000)}s...`
      );
      await new Promise((res) => setTimeout(res, waitTime + 1000));
      return await client.v2.userTimeline(userId, options); // Retry once
    }
    throw err; // rethrow other errors
  }
}

/**
 * Fetch tweets from a Twitter account
 */
async function fetchTweetsFromAccount(username, maxTweets = 100) {
  try {
    const client = await createTwitterClient();
    const rwClient = client.readWrite;

    // Get user ID from username
    const user = await rwClient.v2.userByUsername(username);
    if (!user.data) {
      throw new Error(`User @${username} not found`);
    }

    const userId = user.data.id;

    // Fetch tweets
    const tweets = await safeUserTimeline(rwClient, userId, {
      max_results: maxTweets,
      exclude: ["retweets", "replies"],
      expansions: ["author_id", "attachments.media_keys"],
      "tweet.fields": ["created_at", "public_metrics", "entities"],
    });

    const db = await getDb();
    const account = await db.get("SELECT id FROM accounts WHERE username = ?", [
      username,
    ]);

    if (!account) {
      throw new Error(`Account @${username} not found in database`);
    }

    const donationUrl = await getSetting("donation_url");

    // Process and store tweets
    for (const tweet of tweets.data.data) {
      // Process links in tweet
      let modifiedText = tweet.text;

      // Replace donation links with our custom URL
      if (tweet.entities && tweet.entities.urls) {
        for (const url of tweet.entities.urls) {
          // Check if URL matches donation patterns
          // In a real app, you would have a more sophisticated pattern matching system

          modifiedText = modifiedText.replace(
            url.url,
            donationUrl || "https://donate.example.org"
          );
        }
      }

      // Add tweet to database
      await addTweet({
        twitter_id: tweet.id,
        account_id: account.id,
        original_text: tweet.text,
        modified_text: modifiedText,
        original_url: `https://twitter.com/${username}/status/${tweet.id}`,
      });
    }

    // Update last sync time for account
    await db.run(
      "UPDATE accounts SET last_sync = CURRENT_TIMESTAMP WHERE id = ?",
      [account.id]
    );

    await addLog(
      "Tweets fetched",
      `Fetched ${tweets.data.data.length} tweets from @${username}`,
      "success"
    );

    return tweets.data.data.length;
  } catch (error) {
    console.error(`Error fetching tweets from @${username}:`, error);
    await addLog(
      "Error fetching tweets",
      `Error fetching tweets from @${username}: ${error.message}`,
      "error"
    );
    throw error;
  }
}

/**
 * Post a tweet
 */
async function postTweet(text) {
  try {
    const client = await createTwitterClient();
    const rwClient = client.readWrite;

    // Post tweet
    const result = await rwClient.v2.tweet(text);

    await addLog(
      "Tweet posted",
      `Successfully posted tweet: ${text.substring(0, 50)}...`,
      "success"
    );

    return result.data.id;
  } catch (error) {
    console.error("Error posting tweet:", error);
    await addLog(
      "Error posting tweet",
      `Error posting tweet: ${error.message}`,
      "error"
    );
    throw error;
  }
}

module.exports = {
  createTwitterClient,
  testTwitterConnection,
  fetchTweetsFromAccount,
  postTweet,
};

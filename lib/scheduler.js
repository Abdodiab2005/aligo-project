const cron = require("node-cron")
const { getDb, getSetting, markTweetAsPosted, addLog, getReplacementUrl } = require("./db.js")
const { postTweet, fetchTweetsFromAccount } = require("./twitter.js")

let schedulerRunning = false
let scheduledJobs = []

// Utility: Detect and replace URLs in text
async function replaceUrlsInText(text) {
  // Regex: match URLs (http, https, www, or naked domain)
  const urlRegex = /((https?:\/\/)?(www\.)?([a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}(\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?)/gi;
  if (!text) return text;

  // Get fallback URL
  const fallbackUrl = await getSetting("donation_url") || "https://donate.example.org";

  // Replace each URL
  return await text.replace(urlRegex, async (url) => {
    // Normalize url for lookup (strip protocol)
    let lookupUrl = url.replace(/^(https?:\/\/)/i, "");
    let replacement = await getReplacementUrl(lookupUrl);
    return replacement || fallbackUrl;
  });
}

/**
 * Initialize the scheduler
 */
async function initializeScheduler() {
  // Clear any existing scheduled jobs
  stopScheduler();

  // Check if system is enabled
  const systemEnabled = await getSetting("system_enabled");
  if (systemEnabled !== "1") {
    console.log("Tweet automation system is disabled");
    return;
  }

  // Schedule the full pipeline every 30 minutes
  scheduledJobs.push(
    cron.schedule("*/30 * * * *", async () => {
      try {
        await runFullAutomationCycle();
      } catch (error) {
        console.error("Error in automation cycle:", error);
        await addLog("Scheduler error", `Error in automation cycle: ${error.message}`, "error");
      }
    })
  );

  schedulerRunning = true;
  await addLog("Scheduler started", "Tweet automation scheduler started (30 min cycle)", "info");
  console.log("Tweet automation scheduler started (30 min cycle)");
}

// Run the full automation cycle: fetch, schedule, post
async function runFullAutomationCycle() {
  await fetchNewTweets();
  // Get daily quota from settings
  const dailyQuotaStr = await getSetting("daily_quota");
  const dailyQuota = Number.parseInt(dailyQuotaStr || "5", 10);
  await scheduleTweetsForPosting(dailyQuota);
  await processScheduledTweets();
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  scheduledJobs.forEach((job) => job.stop())
  scheduledJobs = []
  schedulerRunning = false
  console.log("Tweet automation scheduler stopped")
}

/**
 * Process scheduled tweets
 */
async function processScheduledTweets() {
  const db = await getDb()

  // Check if system is enabled
  const systemEnabled = await getSetting("system_enabled")
  if (systemEnabled !== "1") {
    return
  }

  // Get daily quota
  const dailyQuotaStr = await getSetting("daily_quota")
  const dailyQuota = Number.parseInt(dailyQuotaStr || "10", 10)

  // Get active hours
  const activeHoursStart = (await getSetting("active_hours_start")) || "08:00"
  const activeHoursEnd = (await getSetting("active_hours_end")) || "22:00"

  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentTimeStr = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`

  // Check if current time is within active hours
  if (currentTimeStr < activeHoursStart || currentTimeStr > activeHoursEnd) {
    console.log(`Current time ${currentTimeStr} is outside active hours (${activeHoursStart}-${activeHoursEnd})`)
    return
  }

  // Get tweets that are scheduled for now or earlier
  const tweets = await db.all(
    `SELECT * FROM tweets 
     WHERE posted = 0 
     AND scheduled_for IS NOT NULL 
     AND scheduled_for <= CURRENT_TIMESTAMP
     ORDER BY scheduled_for ASC 
     LIMIT ?`,
    [dailyQuota],
  )

  if (tweets.length === 0) {
    console.log("No tweets scheduled for posting")
    return
  }

  console.log(`Found ${tweets.length} tweets scheduled for posting`)

  // Count tweets already posted today
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  const postedToday = await db.get(
    `SELECT COUNT(*) as count FROM tweets 
     WHERE posted = 1 
     AND posted_at >= ?`,
    [startOfDay.toISOString()],
  )

  const remainingQuota = dailyQuota - postedToday.count

  if (remainingQuota <= 0) {
    console.log(`Daily quota of ${dailyQuota} tweets already reached`)
    return
  }

  console.log(`Remaining quota for today: ${remainingQuota} tweets`)

  // Post tweets up to the remaining quota
  const tweetsToPost = tweets.slice(0, remainingQuota)

  for (const tweet of tweetsToPost) {
    try {
      // Replace URLs in tweet text
      const textToPost = tweet.modified_text || tweet.original_text;
      const replacedText = await replaceUrlsInText(textToPost);

      // Post tweet
      await postTweet(replacedText);

      // Mark as posted
      await markTweetAsPosted(tweet.id);

      console.log(`Posted tweet ID ${tweet.id}`);

      // Add some delay between posts
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`Error posting tweet ID ${tweet.id}:`, error);
      await addLog("Error posting tweet", `Error posting tweet ID ${tweet.id}: ${error.message}`, "error");
    }
  }
}

/**
 * Fetch new tweets from all active accounts
 */
async function fetchNewTweets() {
  const db = await getDb()

  // Get active accounts
  const accounts = await db.all("SELECT username FROM accounts WHERE active = 1")

  if (accounts.length === 0) {
    console.log("No active accounts found")
    return
  }

  console.log(`Fetching tweets from ${accounts.length} active accounts`);

  let totalFetched = 0;
  const maxTotal = 50;
  let perAccount = Math.max(1, Math.floor(maxTotal / accounts.length));

  for (const [i, account] of accounts.entries()) {
    // Adjust fetch count for last account to not exceed maxTotal
    let fetchCount = (i === accounts.length - 1) ? (maxTotal - totalFetched) : perAccount;
    if (fetchCount <= 0) break;
    try {
      const count = await fetchTweetsFromAccount(account.username, fetchCount);
      totalFetched += count;
      console.log(`Fetched ${count} tweets from @${account.username}`);
      if (totalFetched >= maxTotal) break;
      // Add some delay between API calls
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error fetching tweets from @${account.username}:`, error);
    }
  }

  console.log(`Fetched a total of ${totalFetched} tweets`);
  await addLog("Tweets fetched", `Fetched a total of ${totalFetched} tweets from ${accounts.length} accounts`, "info");
}

/**
 * Schedule tweets for posting
 */
async function scheduleTweetsForPosting() {
  // TO DO: implement scheduling logic
}

module.exports = {
  initializeScheduler,
  stopScheduler,
  processScheduledTweets,
  fetchNewTweets,
}

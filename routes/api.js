const express = require("express");
const {
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  getTweets,
  getTweetById,
  addTweet,
  updateTweet,
  deleteTweet,
  markTweetAsPosted,
  getSetting,
  updateSetting,
  getRecentLogs,
  clearLogs,
  scheduleTweetsForPosting,
  getReplacementUrl,
  setReplacementUrl,
} = require("../lib/db.js");
const {
  fetchTweetsFromAccount,
  postTweet,
  testTwitterConnection,
} = require("../lib/twitter.js");
const {
  processScheduledTweets,
  fetchNewTweets,
} = require("../lib/scheduler.js");

const router = express.Router();

// Middleware to check API auth
function checkApiAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

router.use(checkApiAuth);

// Accounts endpoints
router.get("/accounts", async (req, res) => {
  try {
    const activeOnly = req.query.active === "true";
    const accounts = await getAccounts(activeOnly);
    res.json({ success: true, accounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/accounts", async (req, res) => {
  try {
    const { username, name, description } = req.body;
    if (!username || !name) {
      return res.status(400).json({ error: "Username and name are required" });
    }
    await addAccount(username, name, description);
    res.json({ success: true, message: "Account added successfully" });
  } catch (error) {
    console.error("Error adding account:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/accounts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, name, description, active } = req.body;
    await updateAccount(id, { username, name, description, active });
    res.json({ success: true, message: "Account updated successfully" });
  } catch (error) {
    console.error(`Error updating account ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/accounts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await deleteAccount(id);
    res.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    console.error(`Error deleting account ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/accounts/:username/fetch", async (req, res) => {
  try {
    const { username } = req.params;
    const maxTweets = req.body.maxTweets || 50;
    const count = await fetchTweetsFromAccount(username, maxTweets);
    res.json({
      success: true,
      message: `Fetched ${count} tweets from @${username}`,
    });
  } catch (error) {
    console.error(`Error fetching tweets from @${req.params.username}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Tweets endpoints
router.get("/tweets", async (req, res) => {
  try {
    const options = {
      posted:
        req.query.posted === "true"
          ? true
          : req.query.posted === "false"
          ? false
          : null,
      accountId: req.query.accountId
        ? Number.parseInt(req.query.accountId, 10)
        : null,
      limit: req.query.limit ? Number.parseInt(req.query.limit, 10) : 50,
      offset: req.query.offset ? Number.parseInt(req.query.offset, 10) : 0,
      orderBy: req.query.orderBy || "created_at",
      orderDir: req.query.orderDir || "DESC",
    };
    const tweets = await getTweets(options);
    res.json({ success: true, tweets });
  } catch (error) {
    console.error("Error fetching tweets:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/tweets", async (req, res) => {
  try {
    const { text, accountId, scheduleTime } = req.body;
    if (!text || !accountId) {
      return res.status(400).json({ error: "Text and accountId are required" });
    }
    await addTweet({
      twitter_id: null,
      account_id: accountId,
      original_text: text,
      modified_text: text,
      original_url: null,
      scheduled_for: scheduleTime,
    });
    res.json({ success: true, message: "Tweet added successfully" });
  } catch (error) {
    console.error("Error adding tweet:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/tweets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { text, scheduleTime } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    await updateTweet(id, { modified_text: text, scheduled_for: scheduleTime });
    res.json({ success: true, message: "Tweet updated successfully" });
  } catch (error) {
    console.error(`Error updating tweet ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/tweets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await deleteTweet(id);
    res.json({ success: true, message: "Tweet deleted successfully" });
  } catch (error) {
    console.error(`Error deleting tweet ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/tweets/:id/post", async (req, res) => {
  try {
    const { id } = req.params;
    const tweet = await getTweetById(id);
    if (!tweet) {
      return res.status(404).json({ error: "Tweet not found" });
    }
    await postTweet(tweet.modified_text || tweet.original_text);
    await markTweetAsPosted(tweet.id);
    res.json({ success: true, message: "Tweet posted successfully" });
  } catch (error) {
    console.error(`Error posting tweet ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Settings endpoints
router.get("/settings", async (req, res) => {
  try {
    const keys = [
      "system_enabled",
      "daily_quota",
      "donation_url",
      "active_hours_start",
      "active_hours_end",
      "time_between_posts",
    ];
    const settings = {};
    for (const key of keys) {
      settings[key] = await getSetting(key);
    }
    res.json({ success: true, settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/settings", async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: "Key and value are required" });
    }
    await updateSetting(key, value);
    res.json({ success: true, message: "Setting updated successfully" });
  } catch (error) {
    console.error("Error updating setting:", error);
    res.status(500).json({ error: error.message });
  }
});

// Actions endpoints
router.post("/actions/sync", async (req, res) => {
  try {
    fetchNewTweets().catch((error) => {
      console.error("Error in background fetch:", error);
    });
    res.json({ success: true, message: "Tweet sync started in background" });
  } catch (error) {
    console.error("Error starting tweet sync:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/actions/test-post", async (req, res) => {
  try {
    processScheduledTweets().catch((error) => {
      console.error("Error in test posting:", error);
    });
    res.json({ success: true, message: "Test posting started in background" });
  } catch (error) {
    console.error("Error starting test posting:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/actions/schedule-batch", async (req, res) => {
  try {
    const count = await scheduleTweetsForPosting(10);
    res.json({
      success: true,
      message: `Scheduled ${count} tweets for posting`,
    });
  } catch (error) {
    console.error("Error scheduling tweets:", error);
    res.status(500).json({ error: error.message });
  }
});

// Logs endpoints
router.get("/logs", async (req, res) => {
  try {
    const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : 50;
    const logs = await getRecentLogs(limit);
    res.json({ success: true, logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/logs/clear", async (req, res) => {
  try {
    await clearLogs();
    res.json({ success: true, message: "Logs cleared successfully" });
  } catch (error) {
    console.error("Error clearing logs:", error);
    res.status(500).json({ error: error.message });
  }
});

// Twitter API test endpoint
router.post("/twitter/test-connection", async (req, res) => {
  try {
    const { apiKey, apiSecret, accessToken, accessSecret } = req.body;
    const result = await testTwitterConnection({
      apiKey,
      apiSecret,
      accessToken,
      accessSecret,
    });
    res.json({
      success: true,
      message: "Twitter API connection successful",
      data: result,
    });
  } catch (error) {
    console.error("Error testing Twitter API connection:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- URL Replacements API ---

// List all URL replacements
router.get("/url-replacements", async (req, res) => {
  try {
    const db = await require("../lib/db.js").getDb();
    const rows = await db.all("SELECT * FROM url_replacements ORDER BY id DESC");
    res.json({ success: true, replacements: rows });
  } catch (error) {
    console.error("Error fetching URL replacements:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add a new URL replacement
router.post("/url-replacements", async (req, res) => {
  try {
    const { original_url, replacement_url } = req.body;
    if (!original_url || !replacement_url) {
      return res.status(400).json({ error: "Both original_url and replacement_url are required." });
    }
    await setReplacementUrl(original_url, replacement_url);
    res.json({ success: true, message: "Replacement added/updated." });
  } catch (error) {
    console.error("Error adding URL replacement:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update an existing URL replacement
router.patch("/url-replacements/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { original_url, replacement_url } = req.body;
    if (!original_url || !replacement_url) {
      return res.status(400).json({ error: "Both original_url and replacement_url are required." });
    }
    const db = await require("../lib/db.js").getDb();
    await db.run("UPDATE url_replacements SET original_url = ?, replacement_url = ? WHERE id = ?", [original_url, replacement_url, id]);
    res.json({ success: true, message: "Replacement updated." });
  } catch (error) {
    console.error("Error updating URL replacement:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a URL replacement
router.delete("/url-replacements/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await require("../lib/db.js").getDb();
    await db.run("DELETE FROM url_replacements WHERE id = ?", [id]);
    res.json({ success: true, message: "Replacement deleted." });
  } catch (error) {
    console.error("Error deleting URL replacement:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

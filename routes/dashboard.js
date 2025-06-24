const express = require("express");
const {
  getAccounts,
  getTweets,
  getRecentLogs,
  getSetting,
  scheduleTweetsForPosting,
} = require("../lib/db.js");

const router = express.Router();

// Dashboard home
router.get("/", async (req, res) => {
  try {
    const accounts = await getAccounts(true);
    const queuedTweets = await getTweets({ posted: false, countOnly: true });
    const postedToday = await getTweets({
      posted: true,
      sinceDate: new Date().toISOString().split("T")[0],
      countOnly: true,
    });
    const dailyQuota = await getSetting("daily_quota");
    const systemEnabled = await getSetting("system_enabled");
    const recentLogs = await getRecentLogs(5);

    res.render("dashboard", {
      title: "Dashboard",
      activePage: "dashboard",
      accountsCount: accounts.length,
      accounts: accounts.slice(0, 5),
      queuedCount: queuedTweets.count || 0,
      postedToday: postedToday.count || 0,
      dailyQuota: Number.parseInt(dailyQuota) || 10,
      systemEnabled: systemEnabled === "1",
      recentLogs: recentLogs || [],
      user: { username: "Admin" },
    });
  } catch (error) {
    console.error("Error rendering dashboard:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Error loading dashboard",
      error: error,
      activePage: "dashboard",
    });
  }
});

// Accounts page
router.get("/accounts", async (req, res) => {
  try {
    const accounts = await getAccounts();
    res.render("accounts", {
      title: "Monitored Accounts",
      activePage: "accounts",
      accounts: accounts || [],
      user: { username: "Admin" },
    });
  } catch (error) {
    console.error("Error rendering accounts page:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Error loading accounts",
      error: error,
      activePage: "accounts",
    });
  }
});

// Tweets page
router.get("/tweets", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    const filter = req.query.filter || "all";

    const options = { limit, offset, orderBy: "created_at", orderDir: "DESC" };
    if (filter === "queued") options.posted = false;
    else if (filter === "posted") options.posted = true;

    const tweets = await getTweets(options);
    const accounts = await getAccounts();
    const totalTweetsResult = await getTweets({ ...options, countOnly: true });
    const totalTweets = totalTweetsResult.count || 0;

    res.render("tweets", {
      title: "Tweet Manager",
      activePage: "tweets",
      tweets,
      accounts,
      page,
      limit,
      filter,
      totalTweets,
      user: { username: "Admin" },
    });
  } catch (error) {
    console.error("Error rendering tweets page:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Error loading tweets",
      error: error,
      activePage: "tweets",
    });
  }
});

// Schedule page
router.get("/schedule", async (req, res) => {
  try {
    const scheduledTweets = await getTweets({
      posted: false,
      orderBy: "scheduled_for",
      orderDir: "ASC",
      limit: 50,
    });

    res.render("schedule", {
      title: "Schedule",
      activePage: "schedule",
      scheduledTweets: scheduledTweets || [],
      user: { username: "Admin" },
    });
  } catch (error) {
    console.error("Error rendering schedule page:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Error loading schedule",
      error: error,
      activePage: "schedule",
    });
  }
});

// Settings page
router.get("/settings", async (req, res) => {
  try {
    const settingKeys = [
      "system_enabled",
      "daily_quota",
      "donation_url",
      "active_hours_start",
      "active_hours_end",
      "time_between_posts",
      "twitter_api_key",
      "twitter_api_secret",
      "twitter_access_token",
      "twitter_access_secret",
      "replace_all_links",
      "preserve_hashtags",
      "preserve_mentions",
    ];

    const settings = {};
    for (const key of settingKeys) {
      settings[key] = await getSetting(key);
    }

    res.render("settings", {
      title: "Settings",
      activePage: "settings",
      settings,
      user: { username: "Admin" },
    });
  } catch (error) {
    console.error("Error rendering settings page:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Error loading settings",
      error: error,
      activePage: "settings",
    });
  }
});

// Logs page
router.get("/logs", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 50;
    const filter = req.query.filter || "all";

    const logs = await getRecentLogs(limit, filter);

    res.render("logs", {
      title: "System Logs",
      activePage: "logs",
      logs: logs || [],
      limit,
      filter,
      page,
      user: { username: "Admin" },
    });
  } catch (error) {
    console.error("Error rendering logs page:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Error loading logs",
      error: error,
      activePage: "logs",
    });
  }
});

// Stats page
router.get("/stats", async (req, res) => {
  try {
    const totalTweets = await getTweets({ countOnly: true });
    const queuedTweets = await getTweets({ posted: false, countOnly: true });
    const postedTweets = await getTweets({ posted: true, countOnly: true });
    const accounts = await getAccounts(true);
    const accountStats = await getAccounts();

    res.render("stats", {
      title: "Statistics",
      activePage: "stats",
      totalTweets: totalTweets.count || 0,
      queuedTweets: queuedTweets.count || 0,
      postedTweets: postedTweets.count || 0,
      activeAccounts: accounts.length,
      accountStats: accountStats || [],
      user: { username: "Admin" },
    });
  } catch (error) {
    console.error("Error rendering stats page:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Error loading statistics",
      error: error,
      activePage: "stats",
    });
  }
});

// URL Replacements Admin Page
router.get("/url-replacements", async (req, res) => {
  try {
    const db = await require("../lib/db.js").getDb();
    const replacements = await db.all("SELECT * FROM url_replacements ORDER BY id DESC");
    res.render("url-replacements", {
      title: "URL Replacements",
      activePage: "url-replacements",
      replacements,
      user: { username: "Admin" },
    });
  } catch (error) {
    console.error("Error rendering URL replacements page:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Error loading URL replacements",
      error: error,
      activePage: "url-replacements",
    });
  }
});

module.exports = router;

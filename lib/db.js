const sqlite3 = require("sqlite3")
const { open } = require("sqlite")

// Singleton pattern for database connection
let db = null

/**
 * Initialize the database
 */
async function initializeDatabase() {
  if (db) return db

  db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  })

  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT,
      description TEXT,
      active BOOLEAN DEFAULT 1,
      last_sync DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS tweets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twitter_id TEXT UNIQUE,
      account_id INTEGER,
      original_text TEXT NOT NULL,
      modified_text TEXT,
      original_url TEXT,
      posted BOOLEAN DEFAULT 0,
      scheduled_for DATETIME,
      posted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    
    CREATE TABLE IF NOT EXISTS url_replacements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_url TEXT UNIQUE,
      replacement_url TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      description TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Insert default settings if they don't exist
  const defaultSettings = [
    { key: "system_enabled", value: "1" },
    { key: "daily_quota", value: "10" },
    { key: "donation_url", value: "https://donate.example.org" },
    { key: "active_hours_start", value: "08:00" },
    { key: "active_hours_end", value: "22:00" },
    { key: "time_between_posts", value: "90" },
  ]

  for (const setting of defaultSettings) {
    await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [setting.key, setting.value])
  }

  return db
}

/**
 * Get database instance
 */
async function getDb() {
  if (!db) {
    await initializeDatabase()
  }
  return db
}

/**
 * Get a setting value
 */
async function getSetting(key) {
  const db = await getDb()
  const result = await db.get("SELECT value FROM settings WHERE key = ?", [key])
  return result ? result.value : null
}

/**
 * Update a setting
 */
async function updateSetting(key, value) {
  const db = await getDb()
  await db.run(
    `INSERT INTO settings (key, value, updated_at) 
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET 
     value = excluded.value, 
     updated_at = excluded.updated_at`,
    [key, value],
  )
}

/**
 * Add a log entry
 */
async function addLog(action, description, status = "info") {
  const db = await getDb()
  await db.run("INSERT INTO logs (action, description, status) VALUES (?, ?, ?)", [action, description, status])
}

/**
 * Get recent logs
 */
async function getRecentLogs(limit = 10, filter = null) {
  const db = await getDb()
  let query = "SELECT * FROM logs"
  const params = []

  if (filter && filter !== "all") {
    query += " WHERE status = ?"
    params.push(filter)
  }

  query += " ORDER BY created_at DESC LIMIT ?"
  params.push(limit)

  return db.all(query, params)
}

/**
 * Clear all logs
 */
async function clearLogs() {
  const db = await getDb()
  await db.run("DELETE FROM logs")
  await addLog("Logs cleared", "All logs have been cleared", "info")
}

/**
 * Get accounts
 */
async function getAccounts(activeOnly = false) {
  const db = await getDb()
  let query = "SELECT a.*, COUNT(t.id) as tweet_count FROM accounts a LEFT JOIN tweets t ON a.id = t.account_id"
  if (activeOnly) {
    query += " WHERE a.active = 1"
  }
  query += " GROUP BY a.id ORDER BY a.username"
  return db.all(query)
}

/**
 * Add account
 */
async function addAccount(username, name, description = "") {
  const db = await getDb()
  await db.run("INSERT INTO accounts (username, name, description) VALUES (?, ?, ?)", [username, name, description])
  await addLog("Account added", `Added Twitter account @${username}`)
}

/**
 * Update account
 */
async function updateAccount(id, data) {
  const db = await getDb()
  const { username, name, description, active } = data

  let query = "UPDATE accounts SET"
  const params = []

  if (username) {
    query += " username = ?,"
    params.push(username)
  }

  if (name) {
    query += " name = ?,"
    params.push(name)
  }

  if (description !== undefined) {
    query += " description = ?,"
    params.push(description)
  }

  if (active !== undefined) {
    query += " active = ?,"
    params.push(active ? 1 : 0)
  }

  // Remove trailing comma
  query = query.slice(0, -1)

  query += " WHERE id = ?"
  params.push(id)

  await db.run(query, params)
  await addLog("Account updated", `Updated Twitter account ID ${id}`)
}

/**
 * Delete account
 */
async function deleteAccount(id) {
  const db = await getDb()

  // Get account username for logging
  const account = await db.get("SELECT username FROM accounts WHERE id = ?", [id])

  // Delete associated tweets first
  await db.run("DELETE FROM tweets WHERE account_id = ?", [id])

  // Delete account
  await db.run("DELETE FROM accounts WHERE id = ?", [id])

  await addLog("Account deleted", `Deleted Twitter account @${account.username}`)
}

/**
 * Get tweets
 */
async function getTweets(options = {}) {
  const {
    posted = null,
    accountId = null,
    limit = 50,
    offset = 0,
    orderBy = "created_at",
    orderDir = "DESC",
    countOnly = false,
    sinceDate = null,
  } = options

  const db = await getDb()
  let query = countOnly
    ? "SELECT COUNT(*) as count FROM tweets t WHERE 1=1"
    : "SELECT t.*, a.username FROM tweets t JOIN accounts a ON t.account_id = a.id WHERE 1=1"

  const params = []

  if (posted !== null) {
    query += " AND t.posted = ?"
    params.push(posted ? 1 : 0)
  }

  if (accountId !== null) {
    query += " AND t.account_id = ?"
    params.push(accountId)
  }

  if (sinceDate) {
    query += " AND DATE(t.created_at) >= DATE(?)"
    params.push(sinceDate)
  }

  if (!countOnly) {
    query += ` ORDER BY t.${orderBy} ${orderDir} LIMIT ? OFFSET ?`
    params.push(limit, offset)
  }

  return countOnly ? db.get(query, params) : db.all(query, params)
}

/**
 * Get tweet by ID
 */
async function getTweetById(id) {
  const db = await getDb()
  return db.get("SELECT t.*, a.username FROM tweets t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?", [id])
}

/**
 * Add tweet
 */
async function addTweet(tweetData) {
  const { twitter_id, account_id, original_text, modified_text, original_url, scheduled_for } = tweetData

  const db = await getDb()
  await db.run(
    `INSERT INTO tweets 
     (twitter_id, account_id, original_text, modified_text, original_url, scheduled_for) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [twitter_id, account_id, original_text, modified_text, original_url, scheduled_for],
  )

  await addLog("Tweet added", `Added new tweet${twitter_id ? ` from Twitter ID ${twitter_id}` : ""}`)
}

/**
 * Update tweet
 */
async function updateTweet(id, data) {
  const db = await getDb()
  const { modified_text, scheduled_for } = data

  let query = "UPDATE tweets SET"
  const params = []

  if (modified_text) {
    query += " modified_text = ?,"
    params.push(modified_text)
  }

  if (scheduled_for !== undefined) {
    query += " scheduled_for = ?,"
    params.push(scheduled_for)
  }

  // Remove trailing comma
  query = query.slice(0, -1)

  query += " WHERE id = ?"
  params.push(id)

  await db.run(query, params)
  await addLog("Tweet updated", `Updated tweet ID ${id}`)
}

/**
 * Delete tweet
 */
async function deleteTweet(id) {
  const db = await getDb()
  await db.run("DELETE FROM tweets WHERE id = ?", [id])
  await addLog("Tweet deleted", `Deleted tweet ID ${id}`)
}

/**
 * Mark tweet as posted
 */
async function markTweetAsPosted(tweetId) {
  const db = await getDb()
  await db.run("UPDATE tweets SET posted = 1, posted_at = CURRENT_TIMESTAMP WHERE id = ?", [tweetId])
  await addLog("Tweet posted", `Posted tweet ID ${tweetId}`, "success")
}

/**
 * Schedule tweets for posting
 */
async function scheduleTweetsForPosting(count = 10) {
  let db;
  try {
    db = await getDb();
    // Get unscheduled tweets
    const tweets = await db.all(
      `SELECT id FROM tweets 
       WHERE posted = 0 AND scheduled_for IS NULL 
       ORDER BY created_at ASC LIMIT ?`,
      [count],
    );
    const now = new Date();
    let scheduledTime = new Date(now);
    // Get time between posts in minutes
    const timeBetweenStr = await getSetting("time_between_posts");
    const timeBetween = Number.parseInt(timeBetweenStr || "90", 10);
    for (let i = 0; i < tweets.length; i++) {
      // Add time between posts
      scheduledTime = new Date(now.getTime() + i * timeBetween * 60 * 1000);
      await db.run("UPDATE tweets SET scheduled_for = ? WHERE id = ?", [scheduledTime.toISOString(), tweets[i].id]);
    }
    await addLog("Tweets scheduled", `Scheduled ${tweets.length} tweets for posting`);
    return tweets.length;
  } catch (error) {
    console.error("Error in scheduleTweetsForPosting:", error);
    if (typeof addLog === 'function') {
      try { await addLog("Error scheduling tweets", error.message || String(error)); } catch (e) {}
    }
    throw error;
  }
}

/**
 * Get a replacement URL for a given original URL
 */
async function getReplacementUrl(originalUrl) {
  try {
    const db = await getDb();
    const row = await db.get(
      "SELECT replacement_url FROM url_replacements WHERE original_url = ?",
      [originalUrl],
    );
    return row ? row.replacement_url : null;
  } catch (error) {
    console.error("Error in getReplacementUrl for", originalUrl, error);
    throw error;
  }
}

/**
 * Set a replacement URL for a given original URL
 */
async function setReplacementUrl(originalUrl, replacementUrl) {
  try {
    const db = await getDb();
    // Upsert replacement
    await db.run(
      `INSERT INTO url_replacements (original_url, replacement_url)
       VALUES (?, ?)
       ON CONFLICT(original_url) DO UPDATE SET replacement_url = excluded.replacement_url`,
      [originalUrl, replacementUrl],
    );
  } catch (error) {
    console.error("Error in setReplacementUrl for", originalUrl, error);
    throw error;
  }
}

module.exports = {
  initializeDatabase,
  getDb,
  getSetting,
  updateSetting,
  addLog,
  getRecentLogs,
  clearLogs,
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
  scheduleTweetsForPosting,
  getReplacementUrl,
  setReplacementUrl,
}

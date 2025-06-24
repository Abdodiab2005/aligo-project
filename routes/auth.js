const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();

// JWT middleware (cookie-based)
function verifyJWT(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = decoded;
    next();
  });
}

// Login route
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const defaultHash = "$2b$10$rMYPbA3w6.n2GG5c1XECy.ufLr/ZcAScJsNx/o1zH7x3UKzL0jRCe"; // Hash for 'password'

    if (username !== adminUsername) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const passwordHash = adminPasswordHash || defaultHash;
    const passwordMatch = await bcrypt.compare(password, passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    // Generate JWT
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: "24h" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: error.message });
  }
});

// JWT-based status route
router.get("/status", verifyJWT, (req, res) => {
  res.json({ authenticated: true, username: req.user.username });
});

// Note: Logout is handled client-side by deleting the JWT. No server logic needed.

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err)
      return res.status(500).json({ error: "Error logging out" })
    }
    res.json({ success: true, message: "Logout successful" })
  })
})

// Check auth status
router.get("/status", (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({
      authenticated: true,
      username: req.session.username,
    })
  }
  res.json({ authenticated: false })
})

// Generate password hash (utility endpoint, should be disabled in production)
router.post("/generate-hash", async (req, res) => {
  try {
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: "Password is required" })
    }

    const saltRounds = 10
    const hash = await bcrypt.hash(password, saltRounds)

    res.json({ success: true, hash })
  } catch (error) {
    console.error("Error generating hash:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

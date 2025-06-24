const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const ejsLayouts = require("express-ejs-layouts");

const { initializeDatabase } = require("./lib/db.js");
const { initializeScheduler, stopScheduler } = require("./lib/scheduler.js");

// Import routes
const apiRoutes = require("./routes/api.js");
const authRoutes = require("./routes/auth.js");
const dashboardRoutes = require("./routes/dashboard.js");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

// View engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Configure express-ejs-layouts AFTER setting view engine
app.use(ejsLayouts);
app.set("layout", "layout");

// Global middleware for template variables
app.use((req, res, next) => {
  // Set default values for all templates
  res.locals.user = null;
  res.locals.activePage = "";
  res.locals.title = "Dashboard";
  next();
});

// JWT Authentication middleware (cookie-based)
function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    if (req.accepts("html")) {
      return res.redirect("/login");
    } else {
      return res.status(401).json({ error: "No token provided" });
    }
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      if (req.accepts("html")) {
        return res.redirect("/login");
      } else {
        return res.status(401).json({ error: "Invalid token" });
      }
    }
    req.user = decoded;
    res.locals.user = { username: decoded.username };
    next();
  });
}

// Routes
app.use("/api", apiRoutes);
app.use("/auth", authRoutes);
app.use("/dashboard", requireAuth, dashboardRoutes);

// Home route
app.get("/", (req, res) => {
  // Check for JWT in Authorization header
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      return res.redirect("/dashboard");
    } catch (e) {}
  }
  res.render("login", {
    title: "Login",
    layout: false, // Don't use layout for login page
  });
});

// Login route
app.get("/login", (req, res) => {
  res.render("login", {
    title: "Login",
    layout: false, // Don't use layout for login page
  });
});

// Catch 404
app.use((req, res) => {
  res.status(404).render("error", {
    title: "Not Found",
    message: "Page not found",
    error: { status: 404 },
    activePage: "",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).render("error", {
    title: "Error",
    message: err.message,
    error: process.env.NODE_ENV === "development" ? err : {},
    activePage: "",
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log("Database initialized");

    // Start scheduler
    await initializeScheduler();

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down gracefully...");
      stopScheduler();
      process.exit(0);
    });
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

startServer();

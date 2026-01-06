require("dotenv").config();
const express = require("express");
const cors = require("cors");

const routes = require("./routes");
const googleAuthRoutes = require("./googleAuth");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-admin-key", "Authorization"],
}));

app.use(express.json());

// Google auth router
app.use("/auth", googleAuthRoutes);

// Existing API routes
app.use("/api", routes);

// Health/root check
app.get("/", (req, res) => res.send("MsInnov backend is running 🎉"));

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`MSInnov backend running on port ${port}`));

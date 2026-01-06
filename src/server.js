require("dotenv").config();
const express = require("express");
const cors = require("cors");

const routes = require("./routes");
const googleAuthRoutes = require("./googleAuth");

const app = express();

// CORS (works for Netlify + local + tools)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-key", "Authorization"],
  })
);

// Parse JSON bodies
app.use(express.json());

// ✅ Health/root checks FIRST (so / doesn't return Not Found)
app.get("/", (req, res) => {
  res.send("MsInnov backend is running 🎉");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Routers
app.use("/auth", googleAuthRoutes);
app.use("/api", routes);

// (Optional) Friendly 404 for everything else
app.use((req, res) => {
  res.status(404).send("Not Found");
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`MSInnov backend running on port ${port}`));

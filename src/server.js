require("dotenv").config();
const express = require("express");
const cors = require("cors");

const routes = require("./routes");
const googleAuthRoutes = require("./googleAuth");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// ✅ mount google auth router
app.use("/auth", googleAuthRoutes);

// existing api
app.use("/api", routes);

app.get("/", (req, res) => res.send("MsInnov backend is running 🎉"));

const port = process.env.PORT || 5002;
app.listen(port, () => console.log(`MSInnov backend running at http://localhost:${port}`));

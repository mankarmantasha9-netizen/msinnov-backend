const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const TOKEN_PATH = path.join(__dirname, "..", "google_tokens.json");

function getOAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env");
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ✅ GET /auth/google
router.get("/google", (req, res) => {
  try {
    const oauth2Client = getOAuthClient();

    const scopes = ["https://www.googleapis.com/auth/calendar.events"];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
    });

    return res.redirect(authUrl);
  } catch (err) {
    console.error("Error generating Google auth URL:", err);
    return res.status(500).send("Error generating Google auth URL");
  }
});

// ✅ GET /auth/google/callback
router.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code");

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    return res.send("✅ Google Calendar connected successfully. You can close this tab.");
  } catch (err) {
    console.error("OAuth error:", err?.response?.data || err);
    return res.status(500).send("Google OAuth failed");
  }
});

module.exports = router;

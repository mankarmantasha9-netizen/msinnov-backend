const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const pool = require("./db"); // ✅ adjust path if needed

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in env");
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

// ✅ One-time setup: table for tokens (run automatically if missing)
async function ensureTokenTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_tokens (
      id INT PRIMARY KEY DEFAULT 1,
      tokens_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ✅ GET /auth/google  -> redirects to Google consent screen
router.get("/google", async (req, res) => {
  try {
    const oauth2Client = getOAuthClient();

    const scopes = [
      "https://www.googleapis.com/auth/calendar.events"
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // forces refresh_token to be returned
      scope: scopes,
    });

    return res.redirect(authUrl);
  } catch (err) {
    console.error("Error generating Google auth URL:", err);
    return res.status(500).send("Error generating Google auth URL");
  }
});

// ✅ GET /auth/google/callback  -> receives code, stores tokens in DB
router.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code");

    await ensureTokenTable();

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    // Save tokens persistently in DB (single-row upsert)
    await pool.query(
      `
      INSERT INTO google_tokens (id, tokens_json, updated_at)
      VALUES (1, $1, NOW())
      ON CONFLICT (id)
      DO UPDATE SET tokens_json = EXCLUDED.tokens_json, updated_at = NOW()
      `,
      [JSON.stringify(tokens)]
    );

    return res.send("✅ Google Calendar connected successfully. You can close this tab.");
  } catch (err) {
    console.error("OAuth error:", err?.response?.data || err);
    return res.status(500).send("Google OAuth failed");
  }
});

// ✅ GET /auth/status -> quick check if tokens exist
router.get("/status", async (req, res) => {
  try {
    await ensureTokenTable();
    const result = await pool.query("SELECT updated_at FROM google_tokens WHERE id = 1");
    if (result.rows.length === 0) {
      return res.json({ ok: true, connected: false });
    }
    return res.json({ ok: true, connected: true, updated_at: result.rows[0].updated_at });
  } catch (err) {
    console.error("Auth status error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;

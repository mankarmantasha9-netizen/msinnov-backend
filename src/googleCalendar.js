const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const TOKEN_PATH = path.join(__dirname, "..", "google_tokens.json");

function getAuthedClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("google_tokens.json not found. Visit /auth/google first.");
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

async function createCalendarEvent({ summary, description, startISO, endISO }) {
  const auth = getAuthedClient();
  const calendar = google.calendar({ version: "v3", auth });

  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  const event = {
    summary,
    description,
    start: { dateTime: startISO },
    end: { dateTime: endISO },
  };

  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });

  return res.data;
}

module.exports = { createCalendarEvent };

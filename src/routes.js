const express = require("express");
const pool = require("./db");
const nodemailer = require("nodemailer");
const { createCalendarEvent } = require("./googleCalendar");

const router = express.Router();

// Admin protection
function adminAuth(req, res, next) {
  const key = req.header("x-admin-key");
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

router.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ------------------------------
// Contact form
// ------------------------------
router.post("/enquiries", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ error: "name, email, message are required" });
    }

    const result = await pool.query(
      `INSERT INTO enquiries (name, email, phone, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), email.trim(), phone?.trim() || null, message.trim()]
    );

    try {
      await transporter.sendMail({
        from: `MSInnov Website <${process.env.SMTP_USER}>`,
        to: process.env.NOTIFY_TO,
        subject: "New enquiry from MSInnov website",
        text:
          `Name: ${name}\n` +
          `Email: ${email}\n` +
          `Phone: ${phone || "N/A"}\n\n` +
          `Message:\n${message}`,
      });
    } catch (emailErr) {
      console.error("Email failed:", emailErr.message);
    }

    res.status(201).json({ ok: true, enquiry: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------------------
// Book an Appointment + Google Calendar Event
// ------------------------------
router.post("/appointments", async (req, res) => {
  try {
    const { name, email, phone, date, time, notes } = req.body;

    if (!name || !email || !date || !time) {
      return res.status(400).json({
        error: "name, email, date and time are required",
      });
    }

    // Duration (minutes) – from env if set, otherwise 30
    const DURATION_MINUTES = Number(process.env.MEETING_DURATION_MINUTES || 30);

    // Combine date + time into a Date object (Sydney offset)
    // Expecting: date = '2025-12-30', time = '14:00'
    const startLocal = new Date(`${date}T${time}:00+11:00`);
    const endLocal = new Date(startLocal.getTime() + DURATION_MINUTES * 60 * 1000);

    const startISO = startLocal.toISOString();
    const endISO = endLocal.toISOString();

    // Check for conflicts in our own DB (basic overlap check)
    const conflictCheck = await pool.query(
      `SELECT id FROM appointments
       WHERE status <> 'cancelled'
         AND tstzrange(start_time, end_time) && tstzrange($1::timestamptz, $2::timestamptz)`,
      [startISO, endISO]
    );

    if (conflictCheck.rows.length > 0) {
      return res.status(409).json({
        error: "This time slot is already booked. Please pick another time.",
      });
    }

    // Save appointment as 'pending'
    const result = await pool.query(
      `INSERT INTO appointments
       (name, email, phone, notes, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [name.trim(), email.trim(), phone?.trim() || null, notes || null, startISO, endISO]
    );

    const appointment = result.rows[0];

    // ------------------------------
    // ✅ Create Google Calendar event
    // ------------------------------
    // IMPORTANT: This requires that you have already done OAuth once and
    // google_tokens.json exists.
    // If tokens are missing, we do NOT fail the booking; we just log the issue.
    let calendarEvent = null;
    try {
      calendarEvent = await createCalendarEvent({
        summary: `MSInnov Appointment — ${name}`,
        description:
          `Appointment request via MSInnov website\n\n` +
          `Name: ${name}\n` +
          `Email: ${email}\n` +
          `Phone: ${phone || "N/A"}\n\n` +
          (notes ? `Notes:\n${notes}\n\n` : "") +
          `Appointment ID: ${appointment.id}\n`,
        startISO,
        endISO,
      });
    } catch (calErr) {
      console.error("Google Calendar event creation failed:", calErr?.message || calErr);
    }

    // ------------------------------
    // Emails: one to CLIENT, one to COMPANY
    // ------------------------------
    try {
      // 1) Email to CLIENT
      const clientText =
        `Hi ${name},\n\n` +
        `Thank you for booking an appointment with MSInnov.\n\n` +
        `Requested time (Australia/Sydney): ${startLocal.toLocaleString("en-AU", {
          timeZone: "Australia/Sydney",
        })} for ${DURATION_MINUTES} minutes.\n\n` +
        `We will review this request and send further details shortly.\n\n` +
        `Details you submitted:\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Phone: ${phone || "N/A"}\n\n` +
        (notes ? `Notes:\n${notes}\n\n` : "") +
        (calendarEvent?.htmlLink ? `Calendar event link:\n${calendarEvent.htmlLink}\n\n` : "") +
        `Regards,\nMSInnov`;

      await transporter.sendMail({
        from: `MSInnov Website <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your appointment request with MSInnov",
        text: clientText,
      });

      // 2) Email to COMPANY (internal notification)
      const ownerText =
        `New appointment request via MSInnov website.\n\n` +
        `Requested time (Australia/Sydney): ${startLocal.toLocaleString("en-AU", {
          timeZone: "Australia/Sydney",
        })} for ${DURATION_MINUTES} minutes.\n\n` +
        `Client details:\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Phone: ${phone || "N/A"}\n\n` +
        (notes ? `Notes:\n${notes}\n\n` : "") +
        `Appointment ID: ${appointment.id}\n` +
        (calendarEvent?.htmlLink ? `Calendar event link:\n${calendarEvent.htmlLink}\n` : "");

      await transporter.sendMail({
        from: `MSInnov Website <${process.env.SMTP_USER}>`,
        to: process.env.NOTIFY_TO,
        subject: `New appointment request from ${name}`,
        text: ownerText,
      });
    } catch (emailErr) {
      console.error("Appointment email failed:", emailErr.message);
    }

    // Include event info in response (helpful for debugging)
    res.status(201).json({ ok: true, appointment, calendarEvent });
  } catch (err) {
    console.error("Error in /appointments:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------------------
// Admin read enquiries
// ------------------------------
router.get("/admin/enquiries", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 200"
    );
    res.json({ ok: true, enquiries: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

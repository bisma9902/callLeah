/**
 * CallLeah / Cal.com booking webhook — Netlify Functions version
 *
 * Deployed automatically by Netlify from this file at:
 *   /.netlify/functions/cal-webhook
 *
 * Cal.com should send BOOKING_CREATED webhooks here.
 * The endpoint verifies X-Cal-Signature-256, then sends an
 * admin notification through Resend.
 *
 * Required environment variables (set in Netlify → Site settings → Environment variables):
 *   CAL_WEBHOOK_SECRET
 *   RESEND_API_KEY
 *   ADMIN_EMAIL
 *   EMAIL_FROM
 */

import crypto from "node:crypto";

const ADMIN_EMAIL_FALLBACK = "aleehakalsoom999@gmail.com";

function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

function pick(payload, ...paths) {
  for (const path of paths) {
    let value = payload;
    for (const key of path.split(".")) {
      value = value?.[key];
    }
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function text(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value ?? "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" }
    });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-cal-signature-256");
    const secret = process.env.CAL_WEBHOOK_SECRET;

    if (!verifySignature(rawBody, signature, secret)) {
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const payload = JSON.parse(rawBody);

    const eventType = text(pick(payload, "triggerEvent", "type", "event"));
    if (eventType && !eventType.toUpperCase().includes("BOOKING_CREATED")) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const attendees = pick(payload, "attendees");
    const attendee = Array.isArray(attendees) ? attendees[0] || {} : {};

    const metadata =
      pick(payload, "metadata") ||
      pick(payload, "booking.metadata") ||
      pick(payload, "data.metadata") ||
      {};

    const name = text(pick(payload, "attendee.name", "booker.name", "booking.attendees.0.name", "data.attendees.0.name")) ||
      text(attendee.name);
    const email = text(pick(payload, "attendee.email", "booker.email", "booking.attendees.0.email", "data.attendees.0.email")) ||
      text(attendee.email);

    const phone = text(pick(payload, "phone", "booking.phone", "data.phone", "attendee.phone")) ||
      text(metadata.callLeahPhone);

    const businessType = text(metadata.callLeahBusinessType);
    const aiNeeds = text(metadata.callLeahAiReceptionistNeeds);
    const biggestProblem = text(metadata.callLeahBiggestCallProblem);

    const startTime = text(pick(payload, "startTime", "booking.startTime", "data.startTime"));
    const timeZone = text(
      pick(payload, "attendee.timeZone", "attendee.timezone", "booking.attendee.timeZone", "data.attendees.0.timeZone")
    );

    const meetingLink = text(
      pick(payload, "videoCallUrl", "booking.videoCallUrl", "data.videoCallUrl", "location")
    );

    const bookingId = text(
      pick(payload, "uid", "booking.uid", "data.uid")
    );

    const subject = "New CallLeah Consultation Booked";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0D1120">
        <div style="background:#0A0E1A;color:#fff;padding:24px;border-radius:14px 14px 0 0">
          <div style="font-size:22px;font-weight:800">Call<span style="color:#6D82FF">Leah</span></div>
          <div style="margin-top:8px;opacity:.8">New consultation booking</div>
        </div>

        <div style="padding:28px;border:1px solid #e6e8ef;border-top:0;border-radius:0 0 14px 14px">
          <h2 style="margin-top:0">New CallLeah Consultation Booked</h2>

          <h3>Customer Details</h3>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</p>
          <p><strong>Business Type:</strong> ${escapeHtml(businessType || "Not provided")}</p>
          <p><strong>AI Receptionist Needs:</strong><br>${escapeHtml(aiNeeds || "Not provided")}</p>
          <p><strong>Biggest Call Problem:</strong><br>${escapeHtml(biggestProblem || "Not provided")}</p>

          <h3>Consultation</h3>
          <p><strong>Start:</strong> ${escapeHtml(startTime || "See Cal.com booking")}</p>
          <p><strong>Time Zone:</strong> ${escapeHtml(timeZone || "See Cal.com booking")}</p>
          <p><strong>Meeting Link:</strong> ${
            meetingLink
              ? `<a href="${escapeHtml(meetingLink)}">${escapeHtml(meetingLink)}</a>`
              : "See the Cal.com booking"
          }</p>
          <p><strong>Booking ID:</strong> ${escapeHtml(bookingId || "Not provided")}</p>
        </div>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [process.env.ADMIN_EMAIL || ADMIN_EMAIL_FALLBACK],
        subject,
        html
      })
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend error:", errorText);
      return new Response(JSON.stringify({ error: "Booking received but admin email failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

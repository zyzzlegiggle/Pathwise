// lib/google.ts
import { google } from "googleapis";
import crypto from "crypto"; // ← remove this + the encrypt/decrypt funcs if you don’t use them

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
  "profile",
];

// ---------- Types ----------
export type GoogleTokens = {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number; // ms since epoch
  scope?: string;
  token_type?: string;
  id_token?: string;
};

// Event input used by upsertEvent
export type CalendarEventInput = {
  title: string;
  description?: string;
  startISO: string;   // ISO 8601 datetime
  endISO: string;     // ISO 8601 datetime
  timezone?: string;  // e.g. "Asia/Singapore"
  location?: string;
  idempotencyKey?: string; // stored in extendedProperties.private
};

// ---------- OAuth helpers ----------
export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );
  return client;
}

export function getAuthUrl(state: string) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
}

export async function getAuthedCalendar(tokens: GoogleTokens) {
  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
  return { calendar, oAuth2Client };
}

// Optional helper: read the user’s primary calendar time zone
export async function getPrimaryCalendarTimezone(tokens: GoogleTokens) {
  const { calendar } = await getAuthedCalendar(tokens);
  const res = await calendar.calendarList.get({ calendarId: "primary" });
  return res.data.timeZone || "UTC";
}

// ---------- Event helpers ----------
export async function upsertEvent(
  tokens: GoogleTokens,
  calendarId: string,
  input: CalendarEventInput,
  existingEventId?: string
) {
  const { calendar } = await getAuthedCalendar(tokens);
  const extendedProps = input.idempotencyKey
    ? { private: { idempotencyKey: input.idempotencyKey } }
    : undefined;

  if (existingEventId) {
    const res = await calendar.events.patch({
      calendarId,
      eventId: existingEventId,
      requestBody: {
        summary: input.title,
        description: input.description,
        start: { dateTime: input.startISO, timeZone: input.timezone },
        end: { dateTime: input.endISO, timeZone: input.timezone },
        location: input.location,
        extendedProperties: extendedProps,
      },
    });
    return res;
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startISO, timeZone: input.timezone },
      end: { dateTime: input.endISO, timeZone: input.timezone },
      location: input.location,
      extendedProperties: extendedProps,
    },
  });
  return res;
}

export async function deleteEvent(tokens: GoogleTokens, calendarId: string, eventId: string) {
  const { calendar } = await getAuthedCalendar(tokens);
  await calendar.events.delete({ calendarId, eventId });
}

// ---------- (Optional) simple at-rest encryption helpers ----------
// If you use Option A (JSON in Prisma), you can DELETE everything below.

const ALG = "aes-256-gcm";
const KEY = crypto.createHash("sha256").update(process.env.ENCRYPTION_SECRET || "fallback").digest();

export function encrypt(json: any) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, KEY, iv);
  const data = Buffer.from(JSON.stringify(json));
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt<T = any>(b64: string | null): T | null {
  try {
    if (!b64) return null;
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALG, KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString()) as T;
  } catch {
    return null; // ensures all code paths return T | null (fixes TS error)
  }
}

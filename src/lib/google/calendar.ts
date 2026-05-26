// Google Calendar v3 REST client. We keep this as a thin fetch wrapper rather
// than pulling in `googleapis` — keeps the bundle small and lets us run on
// the edge if we ever need to.
//
// All entry points take a `userId` so we can resolve a fresh access token via
// `getAccessToken` (which transparently refreshes if needed).

import { getAccessToken } from "./tokens";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarDateTime {
  /** RFC3339 timestamp for timed events. */
  dateTime?: string;
  /** YYYY-MM-DD for all-day events. */
  date?: string;
  timeZone?: string;
}

export interface NormalizedCalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: GoogleCalendarDateTime;
  end: GoogleCalendarDateTime;
  htmlLink: string | null;
  status: string | null;
}

export interface ListUpcomingOptions {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}

export interface CalendarApiError extends Error {
  status: number;
  body: string;
}

function makeError(status: number, body: string, action: string): CalendarApiError {
  const err = new Error(`google calendar ${action} failed: ${status} ${body}`) as CalendarApiError;
  err.status = status;
  err.body = body;
  return err;
}

interface RawEvent {
  id?: string;
  summary?: string;
  description?: string | null;
  location?: string | null;
  start?: GoogleCalendarDateTime;
  end?: GoogleCalendarDateTime;
  htmlLink?: string;
  status?: string;
}

function normalize(raw: RawEvent): NormalizedCalendarEvent {
  return {
    id: raw.id ?? "",
    summary: raw.summary ?? "(no title)",
    description: raw.description ?? null,
    location: raw.location ?? null,
    start: raw.start ?? {},
    end: raw.end ?? {},
    htmlLink: raw.htmlLink ?? null,
    status: raw.status ?? null,
  };
}

/**
 * Issue a Calendar API request with the user's access token. On 401 we
 * re-resolve the token once (getAccessToken auto-refreshes near expiry but
 * the cached token may have been revoked between cron ticks) and retry.
 */
async function callCalendar(
  userId: string,
  path: string,
  init: RequestInit & { searchParams?: Record<string, string | number | undefined> },
  action: string,
): Promise<Response> {
  const search = new URLSearchParams();
  if (init.searchParams) {
    for (const [k, v] of Object.entries(init.searchParams)) {
      if (v !== undefined && v !== null) search.set(k, String(v));
    }
  }
  const qs = search.toString();
  const url = `${CALENDAR_BASE}${path}${qs ? `?${qs}` : ""}`;

  const doFetch = async (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

  let token = await getAccessToken(userId);
  let res = await doFetch(token);
  if (res.status === 401) {
    // Force-refresh by going through getAccessToken again. Our token store
    // refreshes when close to expiry; on a hard 401 there's not much more we
    // can do beyond one retry — if it still fails, surface the error.
    token = await getAccessToken(userId);
    res = await doFetch(token);
  }
  if (!res.ok) {
    const body = await res.text();
    throw makeError(res.status, body, action);
  }
  return res;
}

export async function listUpcomingEvents(
  userId: string,
  opts: ListUpcomingOptions = {},
): Promise<NormalizedCalendarEvent[]> {
  const calendarId = opts.calendarId ?? "primary";
  const timeMin = opts.timeMin ?? new Date().toISOString();
  const maxResults = opts.maxResults ?? 50;

  const items: NormalizedCalendarEvent[] = [];
  let pageToken: string | undefined;
  // Cap page iterations defensively — at maxResults=50 most calendars are
  // done in 1–2 pages within a 30-day window.
  for (let i = 0; i < 10; i++) {
    const res = await callCalendar(
      userId,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "GET",
        searchParams: {
          singleEvents: "true",
          orderBy: "startTime",
          timeMin,
          timeMax: opts.timeMax,
          maxResults,
          pageToken,
        },
      },
      "listEvents",
    );
    const json = (await res.json()) as { items?: RawEvent[]; nextPageToken?: string };
    for (const it of json.items ?? []) items.push(normalize(it));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return items;
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleCalendarDateTime;
  end: GoogleCalendarDateTime;
  calendarId?: string;
}

export interface CreatedEvent {
  id: string;
  htmlLink: string | null;
  event: NormalizedCalendarEvent;
}

export async function createEvent(userId: string, input: CreateEventInput): Promise<CreatedEvent> {
  const calendarId = input.calendarId ?? "primary";
  const { calendarId: _omit, ...body } = input;
  void _omit;
  const res = await callCalendar(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    "createEvent",
  );
  const raw = (await res.json()) as RawEvent;
  const event = normalize(raw);
  return { id: event.id, htmlLink: event.htmlLink, event };
}

export type EventPatch = Partial<{
  summary: string;
  description: string;
  location: string;
  start: GoogleCalendarDateTime;
  end: GoogleCalendarDateTime;
  status: string;
}>;

export async function updateEvent(
  userId: string,
  eventId: string,
  patch: EventPatch,
  calendarId = "primary",
): Promise<NormalizedCalendarEvent> {
  const res = await callCalendar(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
    "updateEvent",
  );
  return normalize((await res.json()) as RawEvent);
}

export async function deleteEvent(
  userId: string,
  eventId: string,
  calendarId = "primary",
): Promise<void> {
  await callCalendar(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
    "deleteEvent",
  );
}

/**
 * Calendar Adapter — CalDAV-basiert (tsdav)
 *
 * Unterstützt Google Calendar, Nextcloud, Radicale und andere CalDAV-Server.
 * Agenten können Termine lesen und erstellen.
 */

import { DAVClient } from 'tsdav';
import type { CalendarAdapter, CalendarCredentials, CalendarEvent, CalendarEventInput } from './types.js';

/**
 * Parse iCal VEVENT data into our CalendarEvent format.
 */
function parseVEvent(ical: string, calendarName?: string): CalendarEvent | null {
  const get = (key: string): string | undefined => {
    // Handle properties that might have parameters (e.g., DTSTART;VALUE=DATE:20260305)
    const regex = new RegExp(`^${key}[;:](.*)$`, 'mi');
    const match = ical.match(regex);
    if (!match) return undefined;
    // If the line has parameters, extract just the value after the last colon
    const line = match[1];
    const colonIdx = line.lastIndexOf(':');
    // If the match was from `;` (has params), value is after colon
    if (match[0].charAt(key.length) === ';' && colonIdx >= 0) {
      return line.substring(colonIdx + 1).trim();
    }
    return line.trim();
  };

  const uid = get('UID');
  const summary = get('SUMMARY');
  if (!uid || !summary) return null;

  const dtstart = get('DTSTART');
  const dtend = get('DTEND');
  if (!dtstart) return null;

  // Detect all-day event (DATE format: 8 chars, DATETIME: 15+ chars with T)
  const allDay = dtstart.length === 8;

  const parseDate = (val: string): string => {
    if (val.length === 8) {
      // YYYYMMDD → ISO date
      return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}T00:00:00`;
    }
    // YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
    const y = val.slice(0, 4);
    const m = val.slice(4, 6);
    const d = val.slice(6, 8);
    const h = val.slice(9, 11);
    const mi = val.slice(11, 13);
    const s = val.slice(13, 15);
    const tz = val.endsWith('Z') ? 'Z' : '';
    return `${y}-${m}-${d}T${h}:${mi}:${s}${tz}`;
  };

  const statusRaw = get('STATUS')?.toLowerCase();
  const status: CalendarEvent['status'] =
    statusRaw === 'tentative' ? 'tentative' :
    statusRaw === 'cancelled' ? 'cancelled' : 'confirmed';

  // Parse attendees
  const attendees: string[] = [];
  const attendeeRegex = /ATTENDEE[^:]*:mailto:([^\r\n]+)/gi;
  let atMatch;
  while ((atMatch = attendeeRegex.exec(ical)) !== null) {
    attendees.push(atMatch[1].trim());
  }

  // Parse organizer
  const organizerMatch = ical.match(/ORGANIZER[^:]*:mailto:([^\r\n]+)/i);
  const organizer = organizerMatch?.[1]?.trim();

  return {
    id: uid,
    title: summary.replace(/\\,/g, ',').replace(/\\n/g, '\n'),
    description: get('DESCRIPTION')?.replace(/\\,/g, ',').replace(/\\n/g, '\n'),
    location: get('LOCATION')?.replace(/\\,/g, ','),
    start: parseDate(dtstart),
    end: dtend ? parseDate(dtend) : parseDate(dtstart),
    allDay,
    organizer,
    attendees: attendees.length > 0 ? attendees : undefined,
    status,
    calendarName,
  };
}

/**
 * Build an iCal VEVENT string from CalendarEventInput.
 */
function buildVEvent(event: CalendarEventInput): string {
  const uid = `basis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@basis-platform`;
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const formatDt = (iso: string, allDay?: boolean): string => {
    if (allDay) {
      return iso.replace(/[-]/g, '').slice(0, 8);
    }
    return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };

  const dtStartParam = event.allDay ? ';VALUE=DATE' : '';
  const dtEndParam = event.allDay ? ';VALUE=DATE' : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BASIS Platform//Calendar//DE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART${dtStartParam}:${formatDt(event.start, event.allDay)}`,
    `DTEND${dtEndParam}:${formatDt(event.end, event.allDay)}`,
    `SUMMARY:${event.title.replace(/,/g, '\\,')}`,
  ];

  if (event.description) lines.push(`DESCRIPTION:${event.description.replace(/\n/g, '\\n').replace(/,/g, '\\,')}`);
  if (event.location) lines.push(`LOCATION:${event.location.replace(/,/g, '\\,')}`);
  if (event.attendees) {
    for (const a of event.attendees) {
      lines.push(`ATTENDEE;RSVP=TRUE:mailto:${a}`);
    }
  }

  lines.push('STATUS:CONFIRMED');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

export class CalDavAdapter implements CalendarAdapter {
  private creds: CalendarCredentials;
  private client: DAVClient | null = null;

  constructor(credentials: CalendarCredentials) {
    this.creds = credentials;
  }

  private async getClient(): Promise<DAVClient> {
    if (this.client) return this.client;

    const authConfig: any = {
      serverUrl: this.creds.serverUrl,
      defaultAccountType: 'caldav' as const,
    };

    if (this.creds.authMethod === 'Oauth') {
      authConfig.credentials = {
        tokenUrl: this.creds.tokenUrl ?? 'https://accounts.google.com/o/oauth2/token',
        username: this.creds.username,
        refreshToken: this.creds.refreshToken,
        clientId: this.creds.clientId,
        clientSecret: this.creds.clientSecret,
      };
      authConfig.authMethod = 'Oauth';
    } else {
      authConfig.credentials = {
        username: this.creds.username,
        password: this.creds.password,
      };
      authConfig.authMethod = 'Basic';
    }

    this.client = new DAVClient(authConfig);
    await this.client.login();
    return this.client;
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = await this.getClient();
      const calendars = await client.fetchCalendars();
      this.client = null; // reset for fresh connections
      return calendars.length > 0;
    } catch (err: any) {
      console.error('[CalDavAdapter] testConnection failed:', err?.message);
      this.client = null;
      return false;
    }
  }

  async listCalendars(): Promise<Array<{ id: string; name: string; color?: string }>> {
    const client = await this.getClient();
    const calendars = await client.fetchCalendars();
    this.client = null;
    return calendars.map((c) => ({
      id: c.url,
      name: (c as any).displayName ?? c.url.split('/').filter(Boolean).pop() ?? 'Kalender',
      color: (c as any).calendarColor,
    }));
  }

  async getEvents(from: string, to: string, calendarId?: string): Promise<CalendarEvent[]> {
    const client = await this.getClient();
    const calendars = await client.fetchCalendars();
    this.client = null;

    const targetCalendars = calendarId
      ? calendars.filter((c) => c.url === calendarId)
      : calendars;

    const events: CalendarEvent[] = [];

    for (const cal of targetCalendars) {
      const calName = (cal as any).displayName ?? 'Kalender';
      try {
        const objects = await client.fetchCalendarObjects({
          calendar: cal,
          timeRange: {
            start: new Date(from).toISOString(),
            end: new Date(to).toISOString(),
          },
        });

        for (const obj of objects) {
          if (obj.data) {
            const parsed = parseVEvent(obj.data, calName);
            if (parsed) events.push(parsed);
          }
        }
      } catch (err: any) {
        console.error(`[CalDavAdapter] Error fetching events from ${calName}:`, err?.message);
      }
    }

    // Sort by start date
    events.sort((a, b) => a.start.localeCompare(b.start));
    return events;
  }

  async getUpcomingEvents(days: number = 7, calendarId?: string): Promise<CalendarEvent[]> {
    const now = new Date();
    const from = now.toISOString();
    const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    return this.getEvents(from, to, calendarId);
  }

  async createEvent(event: CalendarEventInput, calendarId?: string): Promise<{ eventId: string }> {
    const client = await this.getClient();
    const calendars = await client.fetchCalendars();
    this.client = null;

    const targetCal = calendarId
      ? calendars.find((c) => c.url === calendarId)
      : calendars[0]; // default: first calendar

    if (!targetCal) throw new Error('Kein Kalender gefunden');

    const ical = buildVEvent(event);
    const uid = ical.match(/UID:([^\r\n]+)/)?.[1] ?? `unknown-${Date.now()}`;
    const filename = `${uid}.ics`;

    await client.createCalendarObject({
      calendar: targetCal,
      filename,
      iCalString: ical,
    });

    return { eventId: uid };
  }
}

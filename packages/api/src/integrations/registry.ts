/**
 * CRM Adapter Registry
 *
 * Factory function that creates the correct adapter based on provider.
 * Credentials are decrypted here and NEVER leave this module.
 */

import { OdooAdapter } from './odoo.js';
import { HubSpotAdapter } from './hubspot.js';
import { ImapMailAdapter } from './mail-adapter.js';
import { CalDavAdapter } from './calendar-adapter.js';
import { parseCredentials, type EncryptedData } from '../lib/crypto.js';
import type { CRMAdapter, CRMProvider, OdooCredentials, HubSpotCredentials, MailAdapter, MailCredentials, CalendarAdapter, CalendarCredentials } from './types.js';

/**
 * Creates a CRM adapter from encrypted credentials stored in DB.
 * Decrypts credentials in-memory — they are never persisted decrypted.
 */
export function createAdapter(
  provider: CRMProvider,
  encrypted: EncryptedData,
): CRMAdapter {
  switch (provider) {
    case 'odoo': {
      const creds = parseCredentials<OdooCredentials>(encrypted);
      return new OdooAdapter(creds);
    }
    case 'hubspot': {
      const creds = parseCredentials<HubSpotCredentials>(encrypted);
      return new HubSpotAdapter(creds);
    }
    default:
      throw new Error(`CRM-Provider "${provider}" wird noch nicht unterstützt`);
  }
}

/**
 * Creates a Mail adapter from encrypted credentials stored in DB.
 * Used for email integrations (provider='email').
 */
export function createMailAdapter(encrypted: EncryptedData): MailAdapter {
  const creds = parseCredentials<MailCredentials>(encrypted);
  return new ImapMailAdapter(creds);
}

/**
 * Creates a Calendar adapter from encrypted credentials stored in DB.
 * Used for calendar integrations (provider='calendar').
 */
export function createCalendarAdapter(encrypted: EncryptedData): CalendarAdapter {
  const creds = parseCredentials<CalendarCredentials>(encrypted);
  return new CalDavAdapter(creds);
}

/**
 * List of supported providers with display info.
 */
export const SUPPORTED_PROVIDERS: Array<{
  id: CRMProvider;
  name: string;
  fields: Array<{ key: string; label: string; type: 'text' | 'password' | 'url' }>;
}> = [
  {
    id: 'odoo',
    name: 'Odoo',
    fields: [
      { key: 'url', label: 'Odoo URL', type: 'url' },
      { key: 'db', label: 'Datenbank', type: 'text' },
      { key: 'username', label: 'Benutzername', type: 'text' },
      { key: 'apiKey', label: 'API-Schlüssel', type: 'password' },
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    fields: [
      { key: 'accessToken', label: 'Private App Access Token', type: 'password' },
    ],
  },
];

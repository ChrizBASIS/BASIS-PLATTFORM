/**
 * IMAP Mail Adapter
 *
 * Connects to any IMAP server (Gmail, Outlook, custom) to:
 * - Search and read emails
 * - Save drafts to the Drafts folder via IMAP APPEND
 *
 * No SMTP sending — drafts only. User sends from their mail app.
 * Credentials are decrypted in-memory and never persisted.
 */

import { ImapFlow } from 'imapflow';
import type { MailAdapter, MailCredentials, MailMessage, MailDraft } from './types.js';

/**
 * Strip HTML tags and decode basic entities for plain-text extraction.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export class ImapMailAdapter implements MailAdapter {
  private creds: MailCredentials;

  constructor(credentials: MailCredentials) {
    // Ensure imapPort is a number (may come as string from JSON)
    this.creds = {
      ...credentials,
      imapPort: Number(credentials.imapPort) || 993,
    };
  }

  private createClient(): ImapFlow {
    return new ImapFlow({
      host: this.creds.imapHost,
      port: this.creds.imapPort,
      secure: this.creds.useTls !== false, // default true
      auth: {
        user: this.creds.email,
        pass: this.creds.password,
      },
      logger: false as any, // suppress verbose IMAP logs
      greetingTimeout: 10000, // 10s connection timeout
      socketTimeout: 15000,   // 15s socket timeout
    });
  }

  async testConnection(): Promise<boolean> {
    const client = this.createClient();
    try {
      await client.connect();
      await client.logout();
      return true;
    } catch (err: any) {
      console.error('[MailAdapter] Connection test failed:', err?.message);
      return false;
    }
  }

  async searchEmails(query: string, folder = 'INBOX', limit = 20): Promise<MailMessage[]> {
    const client = this.createClient();
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const messages: MailMessage[] = [];

        // IMAP SEARCH with OR on subject/from/to/body
        // ImapFlow uses a structured search object
        const searchCriteria: any = {
          or: [
            { subject: query },
            { from: query },
            { to: query },
            { body: query },
          ],
        };

        let count = 0;
        for await (const msg of client.fetch(searchCriteria, {
          envelope: true,
          bodyStructure: true,
          source: { maxLength: 50000 }, // limit body size
        })) {
          if (count >= limit) break;
          const parsed = this.parseMessage(msg, folder);
          if (parsed) messages.push(parsed);
          count++;
        }

        return messages;
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }

  async getEmail(id: string, folder = 'INBOX'): Promise<MailMessage | null> {
    const client = this.createClient();
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const msg = await client.fetchOne(id, {
          envelope: true,
          bodyStructure: true,
          flags: true,
          source: true, // full source for body parsing
        }, { uid: true });

        if (!msg) return null;
        return this.parseMessage(msg, folder);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }

  async getRecentEmails(limit = 10, folder = 'INBOX'): Promise<MailMessage[]> {
    const client = this.createClient();
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const messages: MailMessage[] = [];
        const status = client.mailbox;
        if (!status || !status.exists || status.exists === 0) return [];

        // Fetch the last N messages by sequence number
        const total = status.exists;
        const startSeq = Math.max(1, total - limit + 1);
        const range = `${startSeq}:${total}`;

        for await (const msg of client.fetch(range, {
          envelope: true,
          bodyStructure: true,
          flags: true,
          source: { maxLength: 50000 },
        })) {
          const parsed = this.parseMessage(msg, folder);
          if (parsed) messages.push(parsed);
        }

        // Return newest first
        return messages.reverse();
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }

  async draftEmail(draft: MailDraft): Promise<{ draftId: string }> {
    const client = this.createClient();
    try {
      await client.connect();

      // Build RFC822 message
      const rfc822 = await this.buildMessage(draft);

      // Find the Drafts folder — Gmail uses [Gmail]/Drafts, others use "Drafts"
      const draftsFolder = await this.findDraftsFolder(client);

      // APPEND to Drafts with \Draft flag
      const result = await client.append(draftsFolder, rfc822, ['\\Draft', '\\Seen']);

      const uid = result && typeof result === 'object' && 'uid' in result ? (result as any).uid : null;
      console.log(`[MailAdapter] Draft saved to ${draftsFolder}, uid: ${uid ?? 'unknown'}`);
      return { draftId: String(uid ?? `draft-${Date.now()}`) };
    } finally {
      await client.logout().catch(() => {});
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private parseMessage(msg: any, folder: string): MailMessage | null {
    try {
      const envelope = msg.envelope;
      if (!envelope) return null;

      const from = envelope.from?.[0]
        ? `${envelope.from[0].name || ''} <${envelope.from[0].address || ''}>`.trim()
        : 'Unbekannt';
      const to = (envelope.to || [])
        .map((a: any) => a.address || '')
        .filter(Boolean)
        .join(', ');

      // Extract body text from source
      let body = '';
      if (msg.source) {
        const raw = msg.source.toString('utf-8');
        // Try to extract plain text part
        const textMatch = raw.match(/Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=--|\r?\n\.\r?\n|$)/i);
        if (textMatch) {
          body = textMatch[1].trim();
        } else {
          // Try HTML part
          const htmlMatch = raw.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=--|\r?\n\.\r?\n|$)/i);
          if (htmlMatch) {
            body = stripHtml(htmlMatch[1]);
          }
        }
        // Handle base64 encoded content
        if (/Content-Transfer-Encoding:\s*base64/i.test(raw) && body) {
          try {
            body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
          } catch { /* keep as-is */ }
        }
      }

      const snippet = body.substring(0, 200).replace(/\s+/g, ' ').trim();
      const flags = msg.flags ? Array.from(msg.flags) : [];
      const hasAttachments = !!(msg.bodyStructure?.childNodes?.length > 1);

      return {
        id: String(msg.uid),
        from,
        to,
        subject: envelope.subject || '(kein Betreff)',
        date: envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString(),
        body: body || '(kein Inhalt)',
        snippet: snippet || '(kein Inhalt)',
        folder,
        read: flags.includes('\\Seen'),
        hasAttachments,
      };
    } catch (err: any) {
      console.error('[MailAdapter] Failed to parse message:', err?.message);
      return null;
    }
  }

  private async buildMessage(draft: MailDraft): Promise<Buffer> {
    const MailComposer = (await import('nodemailer/lib/mail-composer')).default;
    const mail = new MailComposer({
      from: this.creds.email,
      to: draft.to,
      cc: draft.cc || undefined,
      bcc: draft.bcc || undefined,
      subject: draft.subject,
      text: draft.body,
      inReplyTo: draft.replyToMessageId || undefined,
    });

    return new Promise<Buffer>((resolve, reject) => {
      mail.compile().build((err: Error | null, message: Buffer) => {
        if (err) reject(err);
        else resolve(message);
      });
    });
  }

  private async findDraftsFolder(client: ImapFlow): Promise<string> {
    try {
      const mailboxes = await client.list();
      // Look for standard draft folders
      for (const mb of mailboxes) {
        if (mb.specialUse === '\\Drafts') return mb.path;
        if (/^(drafts|entw[uü]rfe|\[gmail\]\/drafts|\[gmail\]\/entw)/i.test(mb.path)) {
          return mb.path;
        }
      }
      // Fallback: try common names
      for (const name of ['[Gmail]/Drafts', '[Gmail]/Entwürfe', 'Drafts', 'INBOX.Drafts']) {
        try {
          await client.mailboxOpen(name);
          await client.mailboxClose();
          return name;
        } catch { /* not found, try next */ }
      }
    } catch (err: any) {
      console.error('[MailAdapter] Failed to find Drafts folder:', err?.message);
    }
    return 'Drafts'; // ultimate fallback
  }
}

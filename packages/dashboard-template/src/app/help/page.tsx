'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData } from '@/hooks/useDashboardData';

const FAQS = [
  {
    q: 'Wie starte ich den Onboarding-Prozess?',
    a: 'Klicke im Dashboard auf „ONBOARDING STARTEN" oder den ⚙-Button in der oberen Leiste. Der Wizard führt dich durch Betriebsprofil, Aufgaben und Agenten-Zuweisung.',
  },
  {
    q: 'Was ist das YAML-Profil?',
    a: 'Das YAML-Profil ist das zentrale Konfigurationsdokument deines Betriebs. Es enthält alle Metadaten, Agenten-Zuweisungen und Aufgaben — die Grundlage für Nico (Build Mode) und alle Agenten-Antworten.',
  },
  {
    q: 'Wie funktioniert der Build Mode?',
    a: 'Im Build Mode (/sandbox) kannst du Projekte erstellen, Sandbox-Sessions starten und mit Nico (KI-Builder) neue Widgets und Automatisierungen beschreiben. Nico liest dein YAML-Profil und schlägt passende Lösungen vor.',
  },
  {
    q: 'Wozu brauche ich eine Sandbox-Session?',
    a: 'Eine Sandbox-Session erstellt einen isolierten Git-Branch für dein Projekt. Du kannst Änderungen testen, ohne das Live-Dashboard zu beeinflussen. Danach kannst du Veröffentlichen (→ Live) oder Verwerfen.',
  },
  {
    q: 'Wie erkläre ich einem Agenten meine Aufgabe?',
    a: 'Klicke auf einen Agenten-Desk oder öffne den Chat im Dashboard. Beschreibe dein Anliegen auf Deutsch — Lena leitet es automatisch an den richtigen Spezialisten weiter.',
  },
  {
    q: 'Was passiert mit meinen Daten (DSGVO)?',
    a: 'Alle Daten werden ausschließlich auf EU-Servern (Hetzner Cloud, Deutschland) gespeichert. Du kannst jederzeit einen vollständigen Datenexport anfordern oder dein Konto löschen (Einstellungen → DSGVO).',
  },
  {
    q: 'Wie erneuere ich mein Token-Limit?',
    a: 'Tokens werden monatlich zurückgesetzt. Bei Überschreitung siehst du eine Warnung im Dashboard und in der Abrechnung. Upgrade auf einen höheren Plan für mehr Kapazität.',
  },
  {
    q: 'Wie füge ich Team-Mitglieder hinzu?',
    a: 'Gehe zu Team (/team) und gib die E-Mail-Adresse ein. Das neue Mitglied erhält eine Einladung und kann sich über Keycloak anmelden. Wähle die passende Rolle (Admin, Manager, Member, Viewer).',
  },
];

const SHORTCUTS = [
  { key: 'Enter',         desc: 'Nachricht senden (im Chat)' },
  { key: 'Shift + Enter', desc: 'Neue Zeile im Chat' },
  { key: '/',             desc: 'Zu Dashboard' },
  { key: 'Esc',           desc: 'Chat / Wizard schließen' },
];

export default function HelpPage() {
  const { tenant } = useDashboardData();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, padding: '40px' }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
        }}>HILFE</p>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: 'var(--text)', marginBottom: 8,
        }}>Hilfe & FAQ</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 40, lineHeight: 1.6 }}>
          Antworten auf häufige Fragen — oder frag einfach Lena im Dashboard-Chat.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

          {/* FAQ */}
          <div>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 12,
            }}>HÄUFIGE FRAGEN</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {FAQS.map((faq, i) => {
                const isOpen = openFaq === i;
                return (
                  <div key={i} style={{ background: 'var(--surface)' }}>
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '16px 20px',
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: isOpen ? 700 : 500, color: 'var(--text)' }}>
                        {faq.q}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
                        color: isOpen ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0,
                        transition: 'transform 0.2s',
                        transform: isOpen ? 'rotate(45deg)' : 'none',
                      }}>+</span>
                    </button>
                    {isOpen && (
                      <div style={{
                        padding: '0 20px 18px',
                        borderTop: '1px solid var(--border)',
                      }}>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 14 }}>
                          {faq.a}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Ask Lena CTA */}
            <div style={{
              background: 'var(--surface)',
              borderLeft: '3px solid var(--accent)',
              padding: '24px',
            }}>
              <div style={{
                width: 36, height: 36, background: 'var(--accent)', color: '#080808',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 900, marginBottom: 14,
              }}>L</div>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
                Frag Lena
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
                Lena kennt dein Betriebsprofil und kann alle Fragen zum Dashboard beantworten.
              </p>
              <a
                href="/"
                style={{
                  display: 'block', textAlign: 'center', padding: '10px',
                  background: 'var(--accent)', color: '#080808',
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  textDecoration: 'none',
                }}
              >ZUM DASHBOARD →</a>
            </div>

            {/* Shortcuts */}
            <div style={{ background: 'var(--surface)', padding: '24px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                color: 'var(--text-muted)', marginBottom: 14,
              }}>TASTENKÜRZEL</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SHORTCUTS.map((s) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <kbd style={{
                      padding: '3px 8px', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', color: 'var(--accent)',
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>{s.key}</kbd>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Support contact */}
            <div style={{ background: 'var(--surface)', padding: '24px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                color: 'var(--text-muted)', marginBottom: 12,
              }}>SUPPORT</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Technischer Support:{' '}
                <a href="mailto:support@basis.app" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
                  support@basis.app
                </a>
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 6 }}>
                Antwortzeit: &lt; 24h (Mo–Fr)
              </p>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

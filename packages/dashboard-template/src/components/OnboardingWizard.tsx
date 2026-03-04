'use client';

import { useState } from 'react';
import { createOnboardingProfile, analyzeOnboarding, type AnalyzeResult } from '@/lib/api-client';
import { AGENT_META } from '@/hooks/useDashboardData';

const INDUSTRIES = [
  'Gastgewerbe / Hotel', 'Restaurant / Bar', 'Handwerk', 'Einzelhandel',
  'Dienstleistung', 'Gesundheit / Wellness', 'Immobilien', 'Landwirtschaft',
  'Bildung', 'Sonstiges',
];

const WORKFLOW_CATEGORIES = [
  { id: 'email', label: 'E-Mails & Korrespondenz', agent: 'Marie' },
  { id: 'termine', label: 'Termine & Kalender', agent: 'Marie' },
  { id: 'dokumente', label: 'Dokumente & Formulare', agent: 'Tom' },
  { id: 'personal', label: 'Personal & Organisation', agent: 'Tom' },
  { id: 'rechnungen', label: 'Rechnungen & Buchhaltung', agent: 'Clara' },
  { id: 'lohnabrechnung', label: 'Lohn & Steuern', agent: 'Clara' },
  { id: 'social-media', label: 'Social Media & Marketing', agent: 'Marco' },
  { id: 'newsletter', label: 'Newsletter & Werbung', agent: 'Marco' },
  { id: 'kundenanfragen', label: 'Kundenanfragen & Support', agent: 'Alex' },
  { id: 'bewertungen', label: 'Bewertungen & Feedback', agent: 'Alex' },
  { id: 'berichte', label: 'Berichte & Dashboards', agent: 'Nico' },
  { id: 'automatisierung', label: 'Sonstige Automatisierung', agent: 'Nico' },
];

interface TaskEntry {
  category: string;
  title: string;
  currentProcess: string;
  painLevel: number;
}

interface OnboardingWizardProps {
  onComplete?: () => void;
  onClose?: () => void;
}

export function OnboardingWizard({ onComplete, onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [currentTask, setCurrentTask] = useState<Partial<TaskEntry>>({});
  const [hovNext, setHovNext] = useState(false);
  const [hovBack, setHovBack] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const addTask = () => {
    if (currentTask.title && currentTask.category) {
      setTasks([...tasks, {
        category: currentTask.category,
        title: currentTask.title,
        currentProcess: currentTask.currentProcess ?? '',
        painLevel: currentTask.painLevel ?? 3,
      }]);
      setCurrentTask({});
    }
  };

  const handleComplete = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createOnboardingProfile({
        industry,
        companySize,
        businessDescription: description,
        workflows: selectedCategories.map((id) => {
          const cat = WORKFLOW_CATEGORIES.find((c) => c.id === id);
          return { name: cat?.label ?? id };
        }),
      });

      const analyzeTasks = tasks.map((t) => ({
        category: t.category,
        title: t.title,
        currentProcess: t.currentProcess || undefined,
        priority: (t.painLevel >= 4 ? 'high' : t.painLevel >= 2 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        automatable: true,
      }));

      const analyzeResult = await analyzeOnboarding(analyzeTasks);
      setResult(analyzeResult);
      setStep(4);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Fehler beim Speichern — bitte Backend prüfen.');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    // Step 0: Branche
    () => (
      <div>
        <p style={labelStyle}>SCHRITT 1 VON 4</p>
        <h2 style={headlineStyle}>In welcher Branche bist du tätig?</h2>
        <p style={subStyle}>Damit unsere Agenten deinen Betrieb verstehen.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, marginTop: 32 }}>
          {INDUSTRIES.map((ind) => (
            <IndustryOption key={ind} label={ind} selected={industry === ind} onClick={() => setIndustry(ind)} />
          ))}
        </div>
        <div style={{ marginTop: 24 }}>
          <p style={{ ...labelDimStyle, marginBottom: 8 }}>BETRIEBSGRÖSSE</p>
          <div style={{ display: 'flex', gap: 2 }}>
            {['1-5', '6-20', '21-50', '50+'].map((s) => (
              <SizeOption key={s} label={s} selected={companySize === s} onClick={() => setCompanySize(s)} />
            ))}
          </div>
        </div>
      </div>
    ),

    // Step 1: Beschreibung
    () => (
      <div>
        <p style={labelStyle}>SCHRITT 2 VON 4</p>
        <h2 style={headlineStyle}>Beschreib deinen Betrieb kurz</h2>
        <p style={subStyle}>Was macht ihr? Was ist euer Tagesgeschäft? Freier Text reicht.</p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="z.B. Familiengeführter Gasthof mit 30 Zimmern und Restaurant, hauptsächlich Touristen aus DACH-Raum..."
          style={{ width: '100%', minHeight: 160, marginTop: 32, padding: '16px 20px', fontSize: 14, lineHeight: 1.7, resize: 'vertical' }}
        />
      </div>
    ),

    // Step 2: Arbeitsbereiche auswählen
    () => (
      <div>
        <p style={labelStyle}>SCHRITT 3 VON 4</p>
        <h2 style={headlineStyle}>Welche Arbeitsbereiche gibt es bei euch?</h2>
        <p style={subStyle}>Wähle alles aus, was in deinem Betrieb anfällt. Wir weisen dann die passenden Agenten zu.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, marginTop: 32 }}>
          {WORKFLOW_CATEGORIES.map((cat) => (
            <CategoryOption
              key={cat.id}
              label={cat.label}
              agent={cat.agent}
              selected={selectedCategories.includes(cat.id)}
              onClick={() => toggleCategory(cat.id)}
            />
          ))}
        </div>
      </div>
    ),

    // Step 3: Konkrete Tasks & Pain Points
    () => (
      <div>
        <p style={labelStyle}>SCHRITT 4 VON 4</p>
        <h2 style={headlineStyle}>Wo gibt es Probleme oder Automatisierungswünsche?</h2>
        <p style={subStyle}>Beschreib konkrete Aufgaben, die du gerne automatisiert hättest. Jede wird einem Agenten zugewiesen.</p>

        {/* Task list */}
        {tasks.length > 0 && (
          <div style={{ marginTop: 24, marginBottom: 24 }}>
            {tasks.map((t, i) => {
              const cat = WORKFLOW_CATEGORIES.find((c) => c.id === t.category);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', marginBottom: 2,
                  background: 'var(--surface)',
                }}>
                  <div style={{
                    width: 24, height: 24, flexShrink: 0,
                    background: 'var(--accent)', color: 'var(--on-accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 800,
                  }}>{cat?.agent?.[0] ?? 'L'}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>→ {cat?.agent ?? 'Lena'} · {cat?.label ?? t.category}</p>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    color: t.painLevel >= 4 ? 'var(--negative)' : t.painLevel >= 2 ? 'var(--warning)' : 'var(--positive)',
                  }}>P{t.painLevel}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Add new task */}
        <div style={{ background: 'var(--surface)', padding: '24px 20px', marginTop: tasks.length > 0 ? 0 : 24 }}>
          <p style={{ ...labelDimStyle, marginBottom: 12 }}>NEUE AUFGABE HINZUFÜGEN</p>
          <select
            value={currentTask.category ?? ''}
            onChange={(e) => setCurrentTask({ ...currentTask, category: e.target.value })}
            style={{ width: '100%', marginBottom: 8, padding: '10px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">Bereich wählen...</option>
            {selectedCategories.map((id) => {
              const cat = WORKFLOW_CATEGORIES.find((c) => c.id === id);
              return <option key={id} value={id}>{cat?.label} → {cat?.agent}</option>;
            })}
          </select>
          <input
            value={currentTask.title ?? ''}
            onChange={(e) => setCurrentTask({ ...currentTask, title: e.target.value })}
            placeholder="Was soll automatisiert werden?"
            style={{ width: '100%', marginBottom: 8 }}
          />
          <input
            value={currentTask.currentProcess ?? ''}
            onChange={(e) => setCurrentTask({ ...currentTask, currentProcess: e.target.value })}
            placeholder="Wie macht ihr das aktuell? (optional)"
            style={{ width: '100%', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ ...labelDimStyle }}>DRINGLICHKEIT</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setCurrentTask({ ...currentTask, painLevel: n })}
                style={{
                  width: 28, height: 28, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 800,
                  background: (currentTask.painLevel ?? 3) >= n ? 'var(--accent)' : 'var(--bg)',
                  color: (currentTask.painLevel ?? 3) >= n ? 'var(--on-accent)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >{n}</button>
            ))}
            <button
              onClick={addTask}
              disabled={!currentTask.title || !currentTask.category}
              style={{
                marginLeft: 'auto', padding: '8px 20px',
                background: currentTask.title && currentTask.category ? 'var(--accent)' : 'var(--surface-2)',
                color: currentTask.title && currentTask.category ? 'var(--on-accent)' : 'var(--text-muted)',
                border: 'none', fontWeight: 800, fontSize: 12,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: currentTask.title && currentTask.category ? 'pointer' : 'default',
              }}
            >HINZUFÜGEN</button>
          </div>
        </div>
      </div>
    ),
  ];

  const canNext = step === 0 ? !!industry : step === 1 ? !!description : step === 2 ? selectedCategories.length > 0 : tasks.length > 0;
  const isLast = step === 3;

  // ─── Step 4: Results ───────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 40px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 28, height: 28, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: 'var(--on-accent)' }}>B</div>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>BASIS ONBOARDING</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: 32, height: 4, background: 'var(--accent)', transition: 'all 0.3s' }} />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '48px 40px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <p style={labelStyle}>FERTIG</p>
          <h2 style={headlineStyle}>Dein Team ist bereit.</h2>
          <p style={subStyle}>{result?.summary.total ?? 0} Aufgaben wurden analysiert und deinen Agenten zugewiesen.</p>

          {/* Agent summary */}
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.entries(result?.summary.byAgent ?? {}).map(([agentName, count]) => {
              const key = agentName.toLowerCase().split(' ')[0];
              const meta = AGENT_META[key] ?? { color: '#888', initial: agentName[0] };
              return (
                <div key={agentName} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 20px', background: 'var(--surface)',
                }}>
                  <div style={{
                    width: 36, height: 36, flexShrink: 0,
                    background: meta.color, color: '#080808',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900,
                  }}>{meta.initial}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{agentName}</p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {count} AUFGABE{count !== 1 ? 'N' : ''} ZUGEWIESEN
                    </p>
                  </div>
                  <div style={{
                    width: 8, height: 8, background: 'var(--positive)',
                    animation: 'pulse 1.5s infinite',
                  }} />
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 24, padding: '16px 20px', background: 'var(--surface)', borderLeft: '3px solid var(--accent)' }}>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65 }}>
              Lena hat alle Agenten gebrieft. Öffne das Dashboard um zu sehen wie sie arbeiten.
            </p>
          </div>
        </div>

        <div style={{ padding: '20px 40px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onComplete?.()}
            style={{
              padding: '14px 36px', background: 'var(--accent)', color: 'var(--on-accent)',
              border: 'none', fontWeight: 900, fontSize: 14,
              letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >ZUM DASHBOARD →</button>
        </div>
      </div>
    );
  }

  // ─── Submitting overlay ────────────────────────────────────────────────────
  if (submitting) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <div style={{ width: 48, height: 48, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: 'var(--on-accent)', animation: 'pulse 1.5s infinite' }}>L</div>
        <div style={{ textAlign: 'center' }}>
          <p style={labelStyle}>LENA ANALYSIERT</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Agenten werden gebrieft…</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Einen Moment — Lena weist Aufgaben zu und aktualisiert das YAML-Profil.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 40px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 28, height: 28, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 900, color: 'var(--on-accent)',
        }}>B</div>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>BASIS ONBOARDING</span>
        {onClose && (
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}>SCHLIESSEN ✕</button>
        )}
        {/* Progress */}
        {!onClose && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                width: i <= step ? 32 : 16, height: 4,
                background: i <= step ? 'var(--accent)' : 'var(--surface)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        )}
        {onClose && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                width: i <= step ? 32 : 16, height: 4,
                background: i <= step ? 'var(--accent)' : 'var(--surface)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '48px 40px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
        {steps[step]()}
        {submitError && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
            {submitError}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '20px 40px', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <button
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          onMouseEnter={() => setHovBack(true)}
          onMouseLeave={() => setHovBack(false)}
          style={{
            padding: '12px 28px', border: '1.5px solid var(--border)',
            background: hovBack && step > 0 ? 'var(--surface)' : 'transparent',
            color: step === 0 ? 'var(--text-muted)' : 'var(--text)',
            fontWeight: 700, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase',
            cursor: step === 0 ? 'default' : 'pointer', transition: 'all 0.15s',
          }}
        >← ZURÜCK</button>
        <button
          onClick={isLast ? handleComplete : () => setStep(step + 1)}
          disabled={!canNext || submitting}
          onMouseEnter={() => setHovNext(true)}
          onMouseLeave={() => setHovNext(false)}
          style={{
            padding: '12px 28px',
            background: canNext ? (hovNext ? 'var(--text)' : 'var(--accent)') : 'var(--surface)',
            color: canNext ? 'var(--on-accent)' : 'var(--text-muted)',
            border: 'none', fontWeight: 800, fontSize: 13,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: canNext && !submitting ? 'pointer' : 'default', transition: 'all 0.15s',
          }}
        >{isLast ? 'AGENTEN BRIEFEN →' : 'WEITER →'}</button>
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function IndustryOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '16px 20px', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: selected ? 'var(--accent)' : hov ? 'var(--surface-2)' : 'var(--surface)',
        color: selected ? 'var(--on-accent)' : 'var(--text)',
        fontSize: 14, fontWeight: selected ? 700 : 500,
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );
}

function SizeOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '12px 16px', textAlign: 'center', border: 'none', cursor: 'pointer',
        background: selected ? 'var(--accent)' : 'var(--surface)',
        color: selected ? 'var(--on-accent)' : 'var(--text)',
        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );
}

function CategoryOption({ label, agent, selected, onClick }: { label: string; agent: string; selected: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '20px', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: selected ? 'var(--accent)' : hov ? 'var(--surface-2)' : 'var(--surface)',
        color: selected ? 'var(--on-accent)' : 'var(--text)',
        transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: selected ? 700 : 500 }}>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: selected ? 'rgba(8,8,8,0.5)' : 'var(--accent)',
      }}>→ {agent}</span>
    </button>
  );
}

// ─── Shared Styles ───────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
  marginBottom: 16,
};

const labelDimStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)',
};

const headlineStyle: React.CSSProperties = {
  fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 900,
  lineHeight: 1, letterSpacing: '-0.025em', color: 'var(--text)',
  marginBottom: 8,
};

const subStyle: React.CSSProperties = {
  fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6,
};

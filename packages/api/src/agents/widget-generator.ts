import OpenAI from 'openai';
import { getEnv } from '../lib/env.js';

const env = getEnv();

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
});

const WIDGET_SYSTEM_PROMPT = `Du bist Nico, der Builder-Agent von BASIS. Du generierst eigenständige HTML/CSS/JS Widgets.

REGELN:
1. Generiere IMMER ein vollständiges, selbstständiges HTML-Dokument.
2. Alles in EINER Datei: HTML + CSS (im <style> Tag) + JavaScript (im <script> Tag).
3. Verwende KEIN Framework (kein React, kein Vue) — nur vanilla HTML/CSS/JS.
4. Design: Modern, clean, dunkles Theme passend zum BASIS Dashboard:
   - Hintergrund: #0a0a0a
   - Text: #F5F0E8
   - Akzentfarbe: #E8FF3A (gelb-grün)
   - Schrift: system-ui, -apple-system, sans-serif
   - Monospace: 'JetBrains Mono', monospace
   - Border: #222
   - Surface: #111
5. Das Widget muss RESPONSIVE sein und sich an die Container-Größe anpassen.
6. Verwende CSS Grid oder Flexbox für Layouts.
7. Interaktive Elemente müssen funktionieren (Buttons, Inputs, Slider, etc.).
8. Keine externen Abhängigkeiten — alles inline.
9. Gib NUR den HTML-Code zurück, keine Erklärungen, kein Markdown.
10. Das HTML muss mit <!DOCTYPE html> beginnen und mit </html> enden.

BEISPIEL-STRUKTUR:
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Widget Name</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #F5F0E8; padding: 24px; }
    /* ... styles ... */
  </style>
</head>
<body>
  <!-- Widget content -->
  <script>
    // Interactive logic
  </script>
</body>
</html>`;

export interface WidgetGenerationResult {
  title: string;
  code: string;
  description: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Generiert ein Widget basierend auf einer Beschreibung.
 * Gibt vollständiges HTML zurück, das in einem iframe gerendert werden kann.
 */
export async function generateWidget(
  description: string,
  existingCode?: string,
): Promise<WidgetGenerationResult> {
  const userPrompt = existingCode
    ? `Bearbeite dieses bestehende Widget basierend auf der Anforderung:\n\nANFORDERUNG: ${description}\n\nBESTEHENDER CODE:\n${existingCode}`
    : `Erstelle ein Widget basierend auf dieser Beschreibung:\n\n${description}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: WIDGET_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    max_tokens: 4000,
  });

  let code = completion.choices[0]?.message?.content ?? '';
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;

  // Clean up: remove markdown code fences if GPT wraps them
  code = code.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

  // Ensure it starts with DOCTYPE
  if (!code.startsWith('<!DOCTYPE') && !code.startsWith('<!doctype')) {
    code = `<!DOCTYPE html>\n${code}`;
  }

  // Extract title from <title> tag
  const titleMatch = code.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch?.[1] ?? 'Neues Widget';

  return {
    title,
    code,
    description,
    inputTokens,
    outputTokens,
  };
}

/**
 * Lässt Nico eine Chat-Antwort zur Widget-Beschreibung generieren,
 * inklusive Rückfragen oder Bestätigungen.
 */
export async function widgetChat(
  description: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<{ reply: string; shouldGenerate: boolean }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `Du bist Nico, der Builder-Agent von BASIS. Der Kunde beschreibt dir ein Widget das du bauen sollst.

DEIN VERHALTEN:
1. Wenn die Beschreibung klar genug ist → antworte mit "Ich baue das jetzt!" und füge am Ende [GENERATE] ein.
2. Wenn du Rückfragen hast → stelle 1-2 kurze Fragen.
3. Sei direkt und freundlich. Keine langen Erklärungen.
4. Beschreibe kurz was du bauen wirst bevor du [GENERATE] sagst.

FORMAT deiner Antwort wenn du generieren willst:
"Ich baue dir [Beschreibung]. [Details was enthalten sein wird]. Einen Moment...

[GENERATE]"`,
    },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: description },
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    max_tokens: 500,
  });

  const reply = completion.choices[0]?.message?.content ?? '';
  const shouldGenerate = reply.includes('[GENERATE]');
  const cleanReply = reply.replace(/\[GENERATE\]/g, '').trim();

  return { reply: cleanReply, shouldGenerate };
}

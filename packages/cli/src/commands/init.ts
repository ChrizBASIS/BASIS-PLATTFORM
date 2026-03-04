import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { config, isLoggedIn } from '../lib/config.js';

const TEMPLATES = [
  { name: '🍽  Gastronomie & Hotellerie', value: 'gastro' },
  { name: '🔧 Handwerk & Bau', value: 'handwerk' },
  { name: '🛍  Handel & Retail', value: 'handel' },
  { name: '💼 Dienstleistung', value: 'dienstleistung' },
  { name: '🚜 Landwirtschaft', value: 'landwirtschaft' },
  { name: '❤️  Gesundheit & Pflege', value: 'gesundheit' },
  { name: '⚙️  Leer (Custom)', value: 'custom' },
];

const AGENTS = [
  { name: '📧 Marie (Sekretariat — E-Mails, Termine)', value: 'sekretariat' },
  { name: '🗂  Tom (Backoffice — Dokumente, Organisation)', value: 'backoffice' },
  { name: '💰 Clara (Finance — Rechnungen, Buchhaltung)', value: 'finance' },
  { name: '📣 Marco (Marketing — Social Media, Texte)', value: 'marketing' },
  { name: '🛟 Alex (Support — Kundenanfragen, Tickets)', value: 'support', checked: true },
  { name: '🔨 Nico (Builder — Sandbox, Widgets bauen)', value: 'builder' },
];

interface InitOptions {
  template?: string;
}

export async function initCommand(options: InitOptions) {
  if (!isLoggedIn()) {
    console.log(chalk.red('Bitte zuerst anmelden: basis-cli login'));
    return;
  }

  console.log();
  console.log(chalk.bold(' ╔═════════════════════════════════════╗'));
  console.log(chalk.bold(' ║  BASIS Dashboard — Setup            ║'));
  console.log(chalk.bold(' ║  Willkommen! Lass uns dein          ║'));
  console.log(chalk.bold(' ║  Dashboard einrichten.              ║'));
  console.log(chalk.bold(' ╚═════════════════════════════════════╝'));
  console.log();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'companyName',
      message: 'Wie heißt dein Unternehmen?',
      validate: (v: string) => (v.length > 0 ? true : 'Bitte einen Namen eingeben'),
    },
    {
      type: 'list',
      name: 'template',
      message: 'In welcher Branche bist du?',
      choices: TEMPLATES,
      default: options.template,
    },
    {
      type: 'checkbox',
      name: 'agents',
      message: 'Welche KI-Agenten aktivieren?',
      choices: AGENTS,
    },
    {
      type: 'input',
      name: 'subdomain',
      message: 'Wähle deine Subdomain (z.B. mein-betrieb):',
      validate: (v: string) => /^[a-z0-9-]{3,40}$/.test(v) || 'Nur Kleinbuchstaben, Zahlen und Bindestriche (3-40 Zeichen)',
      filter: (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    },
  ]);

  const spinner = ora('Projekt wird erstellt...').start();

  try {
    const apiUrl = config.get('apiUrl');
    const token = config.get('accessToken');

    const res = await fetch(`${apiUrl}/api/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: answers.companyName,
        subdomain: answers.subdomain,
        template: answers.template,
        agents: answers.agents,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Projekt konnte nicht erstellt werden');
    }

    const { project } = await res.json();
    config.set('projectId', project.id);

    // Activate selected agents
    if (answers.agents.length > 0) {
      await Promise.all(
        answers.agents.map((agentType: string) =>
          fetch(`${apiUrl}/api/v1/agents/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ agentType, enabled: true }),
          }),
        ),
      );
    }

    spinner.succeed('Projekt erstellt!');
    console.log();
    console.log(`  ${chalk.green('✔')} Template: ${chalk.cyan(answers.template)}`);
    console.log(`  ${chalk.green('✔')} Agenten aktiviert: ${chalk.cyan(answers.agents.join(', ') || 'keine')}`);
    console.log(`  ${chalk.green('✔')} URL: ${chalk.cyan(`${answers.subdomain}.basis.app`)}`);
    console.log();
    console.log(`  → ${chalk.cyan('basis-cli deploy')}  (live schalten)`);
    console.log(`  → ${chalk.cyan('basis-cli status')}  (Deployment-Status prüfen)`);
  } catch (err) {
    spinner.fail('Fehler beim Erstellen');
    console.error(err);
  }
}

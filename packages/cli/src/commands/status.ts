import chalk from 'chalk';
import ora from 'ora';
import { config, isLoggedIn } from '../lib/config.js';

export async function statusCommand() {
  if (!isLoggedIn()) {
    console.log(chalk.red('Bitte zuerst anmelden: basis-cli login'));
    return;
  }

  const projectId = config.get('projectId');
  if (!projectId) {
    console.log(chalk.red('Kein Projekt gefunden. Bitte zuerst: basis-cli init'));
    return;
  }

  const spinner = ora('Status wird abgerufen...').start();

  try {
    const apiUrl = config.get('apiUrl');
    const token = config.get('accessToken');

    const res = await fetch(`${apiUrl}/api/v1/projects/${projectId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error('Status konnte nicht abgerufen werden');

    const data = await res.json();
    spinner.stop();

    console.log();
    console.log(chalk.bold('  BASIS Dashboard — Status'));
    console.log();

    const statusColor = data.status === 'live' ? chalk.green : data.status === 'building' ? chalk.yellow : chalk.gray;
    console.log(`  Status:    ${statusColor(data.status)}`);
    console.log(`  URL:       ${chalk.cyan(`https://${data.subdomain}`)}`);
    console.log();
  } catch (err) {
    spinner.fail('Fehler beim Abrufen des Status');
    console.error(err);
  }
}

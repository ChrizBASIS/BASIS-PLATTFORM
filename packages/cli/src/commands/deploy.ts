import chalk from 'chalk';
import ora from 'ora';
import { config, isLoggedIn } from '../lib/config.js';

export async function deployCommand() {
  if (!isLoggedIn()) {
    console.log(chalk.red('Bitte zuerst anmelden: basis-cli login'));
    return;
  }

  const projectId = config.get('projectId');
  if (!projectId) {
    console.log(chalk.red('Kein Projekt gefunden. Bitte zuerst: basis-cli init'));
    return;
  }

  const spinner = ora('Deployment wird gestartet...').start();

  try {
    const apiUrl = config.get('apiUrl');
    const token = config.get('accessToken');

    const res = await fetch(`${apiUrl}/api/v1/projects/${projectId}/deploy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Deployment fehlgeschlagen');
    }

    const { deployment } = await res.json();
    spinner.succeed(chalk.green('Deployment gestartet!'));
    console.log();
    console.log(`  Deployment-ID: ${chalk.cyan(deployment.id)}`);
    console.log(`  Status: ${chalk.yellow(deployment.status)}`);
    console.log();
    console.log(`  → ${chalk.cyan('basis-cli status')} für Updates`);
  } catch (err) {
    spinner.fail('Deployment fehlgeschlagen');
    console.error(err);
  }
}

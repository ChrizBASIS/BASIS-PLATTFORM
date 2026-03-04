import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import { config } from '../lib/config.js';

export async function loginCommand() {
  const apiUrl = config.get('apiUrl');
  const spinner = ora('Starte Anmeldung...').start();

  try {
    // Step 1: Request device code
    const codeRes = await fetch(`${apiUrl}/api/v1/auth/device/code`, { method: 'POST' });
    if (!codeRes.ok) throw new Error('Konnte Device Flow nicht starten');
    const codeData = await codeRes.json();

    spinner.stop();
    console.log();
    console.log(chalk.bold('  BASIS Dashboard — Anmeldung'));
    console.log();
    console.log(`  Öffne diesen Link im Browser:`);
    console.log(chalk.cyan(`  ${codeData.verification_uri_complete}`));
    console.log();
    console.log(`  Dein Code: ${chalk.bold.yellow(codeData.user_code)}`);
    console.log();

    // Open browser automatically
    await open(codeData.verification_uri_complete);

    // Step 2: Poll for token
    const pollSpinner = ora('Warte auf Bestätigung im Browser...').start();
    const interval = (codeData.interval || 5) * 1000;
    const maxAttempts = Math.ceil(codeData.expires_in / (codeData.interval || 5));

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, interval));

      const tokenRes = await fetch(`${apiUrl}/api/v1/auth/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: codeData.device_code }),
      });

      const tokenData = await tokenRes.json();

      if (tokenRes.ok && tokenData.access_token) {
        config.set('accessToken', tokenData.access_token);
        config.set('refreshToken', tokenData.refresh_token);
        pollSpinner.succeed(chalk.green('Anmeldung erfolgreich!'));
        console.log();
        console.log(`  Nächster Schritt: ${chalk.cyan('basis-cli init')}`);
        return;
      }

      if (tokenData.error === 'expired_token') {
        pollSpinner.fail('Code abgelaufen. Bitte erneut versuchen.');
        return;
      }
      // authorization_pending or slow_down — keep polling
    }

    pollSpinner.fail('Zeitüberschreitung. Bitte erneut versuchen.');
  } catch (err) {
    spinner.fail('Fehler bei der Anmeldung');
    console.error(err);
  }
}

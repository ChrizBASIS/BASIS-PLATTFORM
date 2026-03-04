import chalk from 'chalk';
import { config, getApiUrl } from '../lib/config.js';

export async function logoutCommand() {
  const refreshToken = config.get('refreshToken');

  if (refreshToken) {
    try {
      await fetch(`${getApiUrl()}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Server-side logout failed — continue with local token removal
    }
  }

  config.delete('accessToken');
  config.delete('refreshToken');
  config.delete('projectId');
  console.log();
  console.log(`  ${chalk.green('✔')} Abgemeldet — gespeicherte Tokens gelöscht.`);
  console.log(`  → ${chalk.cyan('basis-cli login')}  zum erneuten Anmelden`);
  console.log();
}

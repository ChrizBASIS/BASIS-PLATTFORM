import chalk from 'chalk';
import { config } from '../lib/config.js';

export function logoutCommand() {
  config.delete('accessToken');
  config.delete('refreshToken');
  config.delete('projectId');
  console.log();
  console.log(`  ${chalk.green('✔')} Abgemeldet — gespeicherte Tokens gelöscht.`);
  console.log(`  → ${chalk.cyan('basis-cli login')}  zum erneuten Anmelden`);
  console.log();
}

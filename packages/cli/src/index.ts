#!/usr/bin/env node
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { initCommand } from './commands/init.js';
import { deployCommand } from './commands/deploy.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('basis-cli')
  .description('BASIS Dashboard Platform — CLI für Projekt-Setup, Auth und Deployment')
  .version('0.1.0');

program
  .command('login')
  .description('Authentifizierung via Browser (Device Flow)')
  .action(loginCommand);

program
  .command('logout')
  .description('Abmelden und gespeicherte Tokens löschen')
  .action(logoutCommand);

program
  .command('init')
  .description('Neues Dashboard-Projekt erstellen')
  .option('-t, --template <template>', 'Branchen-Template wählen')
  .action(initCommand);

program
  .command('deploy')
  .description('Dashboard auf BASIS-Infrastruktur deployen')
  .action(deployCommand);

program
  .command('status')
  .description('Deployment-Status anzeigen')
  .action(statusCommand);

program.parse();

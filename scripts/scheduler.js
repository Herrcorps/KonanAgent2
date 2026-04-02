#!/usr/bin/env node
import cron from 'node-cron';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import config from '../src/config.js';
import { sendEmbed, sendError, sendMessage } from '../src/discord-notify.js';

const ROOT = config.root;

function runScript(scriptName, args = '') {
  const cmd = `node ${resolve(ROOT, 'scripts', scriptName)} ${args}`;
  console.log(`[Scheduler] Running: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 600_000 }); // 10 min timeout
  } catch (err) {
    console.error(`[Scheduler] ${scriptName} failed:`, err.message);
    sendError(`Scheduled job failed: ${scriptName}\n${err.message}`).catch(() => {});
  }
}

console.log('============================================');
console.log('  KonanAgent2 — Scheduler');
console.log(`  Timezone: ${config.timezone}`);
console.log('============================================\n');

// Daily report at 7:00 AM
cron.schedule('0 7 * * *', () => {
  console.log(`\n[${new Date().toISOString()}] Running daily report...`);
  runScript('daily-report.js', '--days 3');
}, { timezone: config.timezone });

// Analytics check at 8:00 AM (connect release IDs)
cron.schedule('0 8 * * *', () => {
  console.log(`\n[${new Date().toISOString()}] Running analytics check...`);
  runScript('check-analytics.js', '--days 3 --connect');
}, { timezone: config.timezone });

// Automated competitor research every Monday at 9 AM
cron.schedule('0 9 * * 1', () => {
  console.log(`\n[${new Date().toISOString()}] Running automated competitor research...`);
  runScript('competitor-research.js', '--auto-search');
}, { timezone: config.timezone });

// Generate new hooks Mon/Wed/Fri at 10 AM
cron.schedule('0 10 * * 1,3,5', () => {
  console.log(`\n[${new Date().toISOString()}] Generating new hooks...`);
  runScript('generate-hooks.js', '--count 10');
}, { timezone: config.timezone });

console.log('Scheduled jobs:');
console.log('  • 7:00 AM daily  — Daily analytics report');
console.log('  • 8:00 AM daily  — Analytics check + connect release IDs');
console.log('  • 9:00 AM Monday — Automated competitor research (web search)');
console.log('  • 10:00 AM M/W/F — Generate new hooks');
console.log('\nScheduler running. Press Ctrl+C to stop.\n');

// Send startup notification
sendEmbed({
  title: 'Scheduler Started',
  description: 'KonanAgent2 scheduler is running. Daily reports, analytics, and hook generation are scheduled.',
  color: 'success',
}).catch(() => {});

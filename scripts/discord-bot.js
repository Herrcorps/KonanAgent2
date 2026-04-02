#!/usr/bin/env node
import { startBot } from '../src/discord-bot.js';

console.log('============================================');
console.log('  KonanAgent2 — Discord Bot');
console.log('============================================\n');

startBot().catch((err) => {
  console.error('Bot failed to start:', err.message);
  process.exit(1);
});

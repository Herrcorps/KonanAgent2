#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { program } from 'commander';
import config from '../src/config.js';
import { generateHookConcepts, loadAppProfile, loadResearch } from '../src/creative-director.js';
import { getTopHooks, getDroppedHooks } from '../src/hooks.js';
import { sendEmbed } from '../src/discord-notify.js';

const STRATEGY_PATH = resolve(config.root, 'tiktok-marketing', 'strategy.json');

program
  .option('--count <n>', 'Number of hooks to generate', '10')
  .option('--category <cat>', 'Hook category (person-conflict, pov, listicle, tutorial, before-after, mistakes)')
  .parse();

const opts = program.opts();

function loadJson(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

async function main() {
  config.validate();

  const count = parseInt(opts.count, 10);
  const appProfile = loadAppProfile();
  const research = loadResearch();
  const strategy = loadJson(STRATEGY_PATH);
  const topHooks = getTopHooks(5);
  const droppedHooks = getDroppedHooks();

  console.log(`[CreativeDirector] Generating ${count} hook concepts...\n`);

  const hooks = await generateHookConcepts({
    count,
    appProfile,
    research,
    topHooks,
    droppedHooks,
    category: opts.category,
  });

  // Update strategy
  strategy.suggestedHooks = hooks;
  strategy.lastGenerated = new Date().toISOString();
  writeFileSync(STRATEGY_PATH, JSON.stringify(strategy, null, 2));

  console.log(`\n${hooks.length} hook concepts generated!\n`);
  hooks.forEach((h, i) => {
    console.log(`${i + 1}. [${h.category || 'general'}] ${h.contentType || ''}`);
    console.log(`   Slide 1: "${h.slide1Text}"`);
    console.log(`   Flow: ${h.slideFlow}`);
    console.log(`   Visual: ${h.visualMood || ''}`);
    console.log(`   Lighting: ${h.lightingMood || ''}`);
    console.log('');
  });

  console.log(`Saved to tiktok-marketing/strategy.json`);

  // Discord notification
  await sendEmbed({
    title: `${hooks.length} New Hook Concepts Generated`,
    description: hooks.slice(0, 5).map((h, i) => `${i + 1}. "${h.slide1Text?.replace(/\\n/g, ' ')}" [${h.category}]`).join('\n'),
    color: 'info',
  });
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});

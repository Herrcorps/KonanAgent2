#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { program } from 'commander';
import OpenAI from 'openai';
import config from '../src/config.js';
import { getTopHooks, getDroppedHooks } from '../src/hooks.js';
import { sendEmbed } from '../src/discord-notify.js';

const STRATEGY_PATH = resolve(config.root, 'tiktok-marketing', 'strategy.json');
const RESEARCH_PATH = resolve(config.root, 'tiktok-marketing', 'competitor-research.json');
const PROFILE_PATH = resolve(config.root, 'tiktok-marketing', 'app-profile.json');

program
  .option('--count <n>', 'Number of hooks to generate', '10')
  .option('--category <cat>', 'Hook category (person-conflict, pov, listicle, tutorial, before-after)')
  .parse();

const opts = program.opts();

function loadJson(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

async function main() {
  config.validate();

  const count = parseInt(opts.count, 10);
  const appProfile = loadJson(PROFILE_PATH);
  const research = loadJson(RESEARCH_PATH);
  const strategy = loadJson(STRATEGY_PATH);
  const topHooks = getTopHooks(5);
  const droppedHooks = getDroppedHooks();

  console.log(`[Hooks] Generating ${count} hook ideas...\n`);

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const prompt = `Generate ${count} TikTok slideshow hook ideas for this app/business:

**App:** ${appProfile.name || 'Unknown'} — ${appProfile.description || ''}
**Audience:** ${appProfile.audience || 'Unknown'}
**Category:** ${appProfile.category || 'general'}
**Problem it solves:** ${appProfile.problem || 'Unknown'}
${opts.category ? `**Focus on this hook style:** ${opts.category}` : ''}

**What's worked (top hooks by views):**
${topHooks.map((h) => `- "${h.text}" — ${h.views} views`).join('\n') || '- No data yet'}

**What to AVOID (dropped hooks):**
${droppedHooks.map((h) => `- "${h}"`).join('\n') || '- No dropped hooks yet'}

**Competitor insights:**
${research.nicheInsights?.topHookPatterns || 'No research yet'}
${research.nicheInsights?.gapOpportunities ? `\nGap opportunities: ${research.nicheInsights.gapOpportunities}` : ''}

RULES:
- Each hook should be the text for SLIDE 1 (the scroll-stopper)
- Write as REACTIONS, not labels ("Wait... this actually works??" not "Product Demo")
- 4-6 words per line, use \\n for line breaks
- Include the slide 1 text AND a brief note on the remaining 5 slides
- Make hooks emotionally engaging — curiosity, surprise, relatability
- Mix formats: person+conflict, POV, listicle, before/after, mistakes, tutorial

Return as a JSON array of objects with:
- "slide1Text": the hook text with \\n breaks
- "slideFlow": brief description of slides 2-6
- "category": hook category (person-conflict, pov, listicle, etc.)
- "suggestedCaption": a storytelling caption (3-5 sentences)`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  let hooks;
  try {
    const parsed = JSON.parse(completion.choices[0].message.content);
    hooks = parsed.hooks || parsed;
    if (!Array.isArray(hooks)) hooks = [hooks];
  } catch {
    console.error('Failed to parse AI response');
    process.exit(1);
  }

  // Update strategy
  strategy.suggestedHooks = hooks;
  strategy.lastGenerated = new Date().toISOString();
  writeFileSync(STRATEGY_PATH, JSON.stringify(strategy, null, 2));

  console.log(`✓ ${hooks.length} hooks generated!\n`);
  hooks.forEach((h, i) => {
    console.log(`${i + 1}. [${h.category || 'general'}]`);
    console.log(`   Slide 1: "${h.slide1Text}"`);
    console.log(`   Flow: ${h.slideFlow}`);
    console.log('');
  });

  console.log(`Saved to tiktok-marketing/strategy.json`);

  // Discord notification
  await sendEmbed({
    title: `${hooks.length} New Hook Ideas Generated`,
    description: hooks.slice(0, 5).map((h, i) => `${i + 1}. "${h.slide1Text?.replace(/\\n/g, ' ')}" [${h.category}]`).join('\n'),
    color: 'info',
  });
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});

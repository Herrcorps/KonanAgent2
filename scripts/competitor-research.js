#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { program } from 'commander';
import OpenAI from 'openai';
import config from '../src/config.js';
import { sendEmbed } from '../src/discord-notify.js';

const RESEARCH_PATH = resolve(config.root, 'tiktok-marketing', 'competitor-research.json');

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

program
  .option('--niche <niche>', 'Niche to research')
  .option('--auto', 'Use AI to analyze based on existing app profile')
  .parse();

const opts = program.opts();

async function main() {
  config.validate();

  console.log('\n=== Competitor Research ===\n');

  // Load app profile for context
  const profilePath = resolve(config.root, 'tiktok-marketing', 'app-profile.json');
  let appProfile = {};
  if (existsSync(profilePath)) {
    appProfile = JSON.parse(readFileSync(profilePath, 'utf-8'));
  }

  const niche = opts.niche || appProfile.category || await ask('What niche are you in? (e.g., home design, fitness, beauty) ');

  console.log(`\nResearching the ${niche} niche on TikTok and Instagram...\n`);

  if (!opts.auto) {
    console.log("I can't automatically scrape TikTok, so I need your help gathering data.");
    console.log("Let's look at 3-5 competitors in your niche together.\n");
  }

  const competitors = [];

  // Collect competitor data (guided manual input)
  const numCompetitors = opts.auto ? 0 : parseInt(await ask('How many competitors do you want to analyze? (3-5 recommended) ') || '3', 10);

  for (let i = 0; i < numCompetitors; i++) {
    console.log(`\n--- Competitor ${i + 1} ---`);
    const name = await ask('Account name/handle: ');
    const followers = await ask('Approximate followers: ');
    const avgViews = await ask('Average views per post: ');
    const bestViews = await ask('Best post views: ');
    const bestHook = await ask('What hook did their best post use? ');
    const format = await ask('What format do they use? (slideshow/video/both) ');
    const frequency = await ask('How often do they post? (daily/2x-day/weekly) ');
    const notes = await ask('Anything else notable? ');

    competitors.push({
      name: name.trim(),
      followers: parseInt(followers) || 0,
      avgViews: parseInt(avgViews) || 0,
      bestVideo: { views: parseInt(bestViews) || 0, hook: bestHook.trim() },
      format: format.trim(),
      postingFrequency: frequency.trim(),
      notes: notes.trim(),
    });
  }

  // Use AI to analyze patterns
  console.log('\n[AI] Analyzing competitor patterns...\n');

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const analysisPrompt = `Analyze these TikTok/Instagram competitors in the "${niche}" niche:

App/Business: ${appProfile.name || 'Unknown'} — ${appProfile.description || ''}
Target audience: ${appProfile.audience || 'Unknown'}

Competitors:
${competitors.map((c) => `- ${c.name}: ${c.followers} followers, ${c.avgViews} avg views, best: ${c.bestVideo.views} views with "${c.bestVideo.hook}", format: ${c.format}, posts ${c.postingFrequency}. Notes: ${c.notes}`).join('\n')}

Provide a JSON analysis with:
1. "trendingSounds" — types of sounds/music trending in this niche
2. "commonFormats" — most used content formats
3. "topHookPatterns" — recurring hook patterns that get high views
4. "gapOpportunities" — what competitors AREN'T doing that could work
5. "avoidPatterns" — what's clearly not working
6. "recommendedHooks" — 5 hook ideas tailored to the app

Return ONLY valid JSON.`;

  let nicheInsights = {};
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: analysisPrompt }],
      response_format: { type: 'json_object' },
    });
    nicheInsights = JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.warn(`AI analysis failed: ${err.message}`);
    nicheInsights = { error: 'AI analysis failed — add insights manually' };
  }

  const research = {
    researchDate: new Date().toISOString().split('T')[0],
    niche,
    competitors,
    nicheInsights,
  };

  writeFileSync(RESEARCH_PATH, JSON.stringify(research, null, 2));
  console.log(`\n✓ Research saved to tiktok-marketing/competitor-research.json`);

  // Display insights
  if (nicheInsights.gapOpportunities) {
    console.log(`\n💡 Gap Opportunities: ${nicheInsights.gapOpportunities}`);
  }
  if (nicheInsights.recommendedHooks) {
    console.log('\n🎣 Recommended Hooks:');
    const hooks = Array.isArray(nicheInsights.recommendedHooks) ? nicheInsights.recommendedHooks : [nicheInsights.recommendedHooks];
    hooks.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
  }

  // Send to Discord
  await sendEmbed({
    title: `Competitor Research — ${niche}`,
    description: `Analyzed ${competitors.length} competitors`,
    color: 'info',
    fields: [
      { name: 'Competitors', value: competitors.map((c) => `${c.name} (${c.followers} followers)`).join('\n') || 'None entered' },
      { name: 'Gap Opportunities', value: String(nicheInsights.gapOpportunities || 'See full report') },
    ],
  });

  rl.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  rl.close();
  process.exit(1);
});

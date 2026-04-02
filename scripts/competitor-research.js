#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { program } from 'commander';
import OpenAI from 'openai';
import config from '../src/config.js';
import { sendEmbed } from '../src/discord-notify.js';
import { researchNiche } from '../src/web-search.js';

const RESEARCH_PATH = resolve(config.root, 'tiktok-marketing', 'competitor-research.json');
const PROFILE_PATH = resolve(config.root, 'tiktok-marketing', 'app-profile.json');

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

program
  .option('--niche <niche>', 'Niche to research')
  .option('--auto-search', 'Use AI web search instead of manual input')
  .option('--auto', 'Use AI to analyze based on existing app profile (manual mode)')
  .parse();

const opts = program.opts();

function loadJson(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

async function runAutoSearch(niche, appProfile) {
  console.log('\n=== Automated Competitor Research (Web Search) ===\n');
  console.log(`Niche: ${niche}`);
  console.log('Using OpenAI web search to find trends and competitors...\n');

  const nicheInsights = await researchNiche({ niche, appProfile });

  const research = {
    researchDate: new Date().toISOString().split('T')[0],
    niche,
    competitors: nicheInsights.topCreators || [],
    nicheInsights,
    source: 'auto-search',
  };

  writeFileSync(RESEARCH_PATH, JSON.stringify(research, null, 2));
  console.log(`\nResearch saved to tiktok-marketing/competitor-research.json`);

  // Display key findings
  if (nicheInsights.keyInsights) {
    console.log(`\nKey Insights: ${nicheInsights.keyInsights}`);
  }
  if (nicheInsights.gapOpportunities) {
    console.log('\nGap Opportunities:');
    const gaps = Array.isArray(nicheInsights.gapOpportunities) ? nicheInsights.gapOpportunities : [nicheInsights.gapOpportunities];
    gaps.forEach((g, i) => console.log(`  ${i + 1}. ${g}`));
  }
  if (nicheInsights.recommendedHooks) {
    console.log('\nRecommended Hooks:');
    const hooks = Array.isArray(nicheInsights.recommendedHooks) ? nicheInsights.recommendedHooks : [nicheInsights.recommendedHooks];
    hooks.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
  }

  // Send to Discord
  await sendEmbed({
    title: `Competitor Research — ${niche}`,
    description: `Automated web search research completed`,
    color: 'info',
    fields: [
      { name: 'Key Insights', value: String(nicheInsights.keyInsights || 'See full report') },
      { name: 'Gap Opportunities', value: (Array.isArray(nicheInsights.gapOpportunities) ? nicheInsights.gapOpportunities.slice(0, 3).join('\n') : String(nicheInsights.gapOpportunities || 'See full report')) },
      { name: 'Top Creators', value: (nicheInsights.topCreators || []).slice(0, 3).map(c => `${c.name} (${c.followers})`).join('\n') || 'See full report' },
    ],
  });

  return research;
}

async function runManualResearch(niche, appProfile) {
  console.log('\n=== Competitor Research (Manual) ===\n');

  if (!opts.auto) {
    console.log("I can't automatically scrape TikTok, so I need your help gathering data.");
    console.log("Let's look at 3-5 competitors in your niche together.\n");
  }

  const competitors = [];
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
      model: config.openai.chatModel,
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
    source: 'manual',
  };

  writeFileSync(RESEARCH_PATH, JSON.stringify(research, null, 2));
  console.log(`\nResearch saved to tiktok-marketing/competitor-research.json`);

  if (nicheInsights.gapOpportunities) {
    console.log(`\nGap Opportunities: ${nicheInsights.gapOpportunities}`);
  }
  if (nicheInsights.recommendedHooks) {
    console.log('\nRecommended Hooks:');
    const hooks = Array.isArray(nicheInsights.recommendedHooks) ? nicheInsights.recommendedHooks : [nicheInsights.recommendedHooks];
    hooks.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
  }

  await sendEmbed({
    title: `Competitor Research — ${niche}`,
    description: `Analyzed ${competitors.length} competitors`,
    color: 'info',
    fields: [
      { name: 'Competitors', value: competitors.map((c) => `${c.name} (${c.followers} followers)`).join('\n') || 'None entered' },
      { name: 'Gap Opportunities', value: String(nicheInsights.gapOpportunities || 'See full report') },
    ],
  });
}

async function main() {
  config.validate();

  const appProfile = loadJson(PROFILE_PATH);
  const niche = opts.niche || appProfile.category || await ask('What niche are you in? (e.g., home design, fitness, beauty) ');

  if (opts.autoSearch) {
    await runAutoSearch(niche, appProfile);
  } else {
    await runManualResearch(niche, appProfile);
  }

  rl.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  rl.close();
  process.exit(1);
});

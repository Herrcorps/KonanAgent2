#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { program } from 'commander';
import config from '../src/config.js';
import { listIntegrations } from '../src/postiz-client.js';
import { sendMessage } from '../src/discord-notify.js';

const DATA_DIR = resolve(config.root, 'tiktok-marketing');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function validateConfig() {
  console.log('\n=== KonanAgent2 Config Validation ===\n');
  let allGood = true;

  // Check env vars
  const checks = [
    ['POSTIZ_API_KEY', config.postiz.apiKey],
    ['OPENAI_API_KEY', config.openai.apiKey],
    ['DISCORD_WEBHOOK_URL', config.discord.webhookUrl],
    ['TIKTOK_INTEGRATION_ID', config.integrations.tiktok],
  ];

  for (const [name, value] of checks) {
    if (value && value !== '' && !value.startsWith('your-')) {
      console.log(`  ✓ ${name} is set`);
    } else {
      console.log(`  ✗ ${name} is MISSING`);
      allGood = false;
    }
  }

  // Optional
  if (config.integrations.instagram) {
    console.log(`  ✓ INSTAGRAM_INTEGRATION_ID is set`);
  } else {
    console.log(`  - INSTAGRAM_INTEGRATION_ID not set (optional)`);
  }

  // Test Postiz connection
  if (config.postiz.apiKey && !config.postiz.apiKey.startsWith('your-')) {
    try {
      const maskedKey = config.postiz.apiKey.slice(0, 6) + '***' + config.postiz.apiKey.slice(-4);
      console.log(`\n  Testing Postiz API...`);
      console.log(`  URL: ${config.postiz.apiUrl}/integrations`);
      console.log(`  Key: ${maskedKey}`);
      const integrations = await listIntegrations();
      console.log(`  ✓ Postiz connected — ${Array.isArray(integrations) ? integrations.length : 0} integration(s) found`);
    } catch (err) {
      console.log(`  ✗ Postiz API failed: ${err.message}`);
      allGood = false;
    }
  }

  // Test Discord webhook
  if (config.discord.webhookUrl && !config.discord.webhookUrl.startsWith('your-')) {
    try {
      console.log('  Testing Discord webhook...');
      await sendMessage('🤖 KonanAgent2 validation test — if you see this, Discord is connected!');
      console.log('  ✓ Discord webhook works');
    } catch (err) {
      console.log(`  ✗ Discord webhook failed: ${err.message}`);
      allGood = false;
    }
  }

  // Check optional features
  console.log('\n  Optional features:');
  if (config.discord.botToken) {
    console.log('  ✓ Discord Bot Token is set (chat bot available)');
  } else {
    console.log('  - Discord Bot Token not set (chat bot disabled — see .env.example)');
  }
  console.log(`  ✓ Chat model: ${config.openai.chatModel}`);
  console.log('  ✓ Web search: available (uses OpenAI Responses API)');

  // Check data files
  console.log('\n  Data files:');
  const dataFiles = ['config.json', 'app-profile.json', 'hook-performance.json', 'competitor-research.json', 'strategy.json'];
  for (const f of dataFiles) {
    const path = resolve(DATA_DIR, f);
    console.log(existsSync(path) ? `  ✓ ${f}` : `  - ${f} (will be created during onboarding)`);
  }

  console.log(allGood ? '\n✓ All checks passed! Ready to go.' : '\n✗ Some checks failed. Fix the issues above and re-run.');
  return allGood;
}

async function runOnboarding() {
  ensureDataDir();

  console.log('\n============================================');
  console.log('  KonanAgent2 — Onboarding');
  console.log('============================================\n');

  console.log("Hey! Let's get your TikTok & Instagram marketing set up.\n");

  // Phase 1: App profile
  const appName = await ask('What\'s your app or business called? ');
  const appDesc = await ask('Nice! What does it do? (one or two sentences) ');
  const audience = await ask('Who\'s your ideal user/customer? ');
  const problem = await ask('What\'s the main problem it solves for them? ');
  const differentiator = await ask('What makes you different from alternatives? ');
  const appUrl = await ask('Got a website or App Store link? (or "none") ');
  const category = await ask('What category fits best? (home/beauty/fitness/productivity/food/other) ');

  const appProfile = {
    name: appName.trim(),
    description: appDesc.trim(),
    audience: audience.trim(),
    problem: problem.trim(),
    differentiator: differentiator.trim(),
    appStoreUrl: appUrl.trim() === 'none' ? '' : appUrl.trim(),
    category: category.trim().toLowerCase(),
  };

  writeFileSync(resolve(DATA_DIR, 'app-profile.json'), JSON.stringify(appProfile, null, 2));
  console.log('\n✓ App profile saved!\n');

  // Phase 2: Image generation preference
  console.log("For slideshows, I'd strongly recommend OpenAI's gpt-image-1 model.");
  console.log('It produces images that genuinely look like someone took them on their phone.\n');

  const imageChoice = await ask('Use OpenAI for image generation? (yes/no) ');
  const useOpenAI = imageChoice.trim().toLowerCase().startsWith('y');

  // Phase 3: Posting preferences
  console.log('\nPosts go to your TikTok inbox as DRAFTS — not published directly.');
  console.log('Before publishing each one, add a trending sound from TikTok\'s sound library.');
  console.log('Music is the single biggest factor in TikTok reach.\n');

  const tz = await ask(`What timezone are you in? (current: ${config.timezone}) `);
  const timezone = tz.trim() || config.timezone;

  const crossPost = await ask('Cross-post to Instagram too? (yes/no) ');
  const useIG = crossPost.trim().toLowerCase().startsWith('y');

  // Build config
  const configData = {
    app: appProfile,
    imageGen: {
      provider: useOpenAI ? 'openai' : 'local',
      model: 'gpt-image-1',
      basePrompt: '',
    },
    postiz: {
      apiKey: '(loaded from .env)',
      integrationIds: {
        tiktok: config.integrations.tiktok,
        instagram: useIG ? config.integrations.instagram : '',
      },
    },
    posting: {
      privacyLevel: 'SELF_ONLY',
      schedule: ['07:30', '16:30', '21:00'],
      crossPost: useIG ? ['instagram'] : [],
      timezone,
    },
    analytics: {
      highViewsThreshold: 1000,
      highEngagementRate: 0.05,
      trendWindowDays: 7,
    },
  };

  writeFileSync(resolve(DATA_DIR, 'config.json'), JSON.stringify(configData, null, 2));

  // Create empty data files
  const emptyHooks = { hooks: [], ctas: [], rules: { doubleDown: [], testing: [], dropped: [] } };
  writeFileSync(resolve(DATA_DIR, 'hook-performance.json'), JSON.stringify(emptyHooks, null, 2));

  const emptyResearch = { researchDate: '', competitors: [], nicheInsights: {} };
  writeFileSync(resolve(DATA_DIR, 'competitor-research.json'), JSON.stringify(emptyResearch, null, 2));

  const emptyStrategy = { hooks: [], schedule: configData.posting.schedule, format: 'slideshow' };
  writeFileSync(resolve(DATA_DIR, 'strategy.json'), JSON.stringify(emptyStrategy, null, 2));

  // Create posts and reports dirs
  mkdirSync(resolve(DATA_DIR, 'posts'), { recursive: true });
  mkdirSync(resolve(DATA_DIR, 'reports'), { recursive: true });

  console.log('\n✓ Config saved to tiktok-marketing/config.json');
  console.log('✓ Data files initialized\n');

  // Notify Discord
  try {
    await sendMessage(`🎉 KonanAgent2 onboarding complete!\n**App:** ${appProfile.name}\n**Category:** ${appProfile.category}\n**Cross-posting:** ${useIG ? 'TikTok + Instagram' : 'TikTok only'}`);
    console.log('✓ Discord notification sent\n');
  } catch {
    console.log('- Discord notification skipped (check webhook URL)\n');
  }

  console.log('============================================');
  console.log('  Onboarding complete! Next steps:');
  console.log('============================================\n');
  console.log('  1. Run competitor research:');
  console.log('     npm run research\n');
  console.log('  2. Generate your first test slideshow:');
  console.log('     npm run generate -- --topic "your topic here"\n');
  console.log('  3. Add text overlays:');
  console.log('     npm run overlay -- --dir tiktok-marketing/posts/<your-post-dir>\n');
  console.log('  4. Post as draft to TikTok:');
  console.log('     npm run post:tiktok -- --dir tiktok-marketing/posts/<your-post-dir>\n');
  console.log('  5. Or run the full pipeline in one command:');
  console.log('     npm run pipeline -- --topic "your topic here"\n');
  console.log('  BONUS: Start the Discord chat bot:');
  console.log('     npm run bot\n');

  rl.close();
}

// CLI
program
  .option('--validate', 'Validate config without running full onboarding')
  .parse();

const opts = program.opts();

if (opts.validate) {
  validateConfig().then((ok) => process.exit(ok ? 0 : 1));
} else {
  runOnboarding().catch((err) => {
    console.error('Onboarding failed:', err.message);
    process.exit(1);
  });
}

import { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import OpenAI from 'openai';
import config from './config.js';

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: config.openai.apiKey });
  return openai;
}

const ROOT = config.root;
const DATA_DIR = resolve(ROOT, 'tiktok-marketing');

// ─── CONVERSATION MEMORY ──────────────────────────────────────────────────────
const conversationHistory = new Map(); // channelId → messages[]
const MAX_HISTORY = 20;

function getHistory(channelId) {
  if (!conversationHistory.has(channelId)) conversationHistory.set(channelId, []);
  return conversationHistory.get(channelId);
}

function addToHistory(channelId, role, content) {
  const history = getHistory(channelId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.shift();
}

// ─── DATA LOADERS ─────────────────────────────────────────────────────────────

function loadJson(filename) {
  const path = resolve(DATA_DIR, filename);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function buildAgentContext() {
  const appProfile = loadJson('app-profile.json');
  const hookPerf = loadJson('hook-performance.json');
  const research = loadJson('competitor-research.json');
  const strategy = loadJson('strategy.json');

  // Load latest report
  const reportsDir = resolve(DATA_DIR, 'reports');
  let latestReport = null;
  if (existsSync(reportsDir)) {
    const reports = readdirSync(reportsDir).filter(f => f.endsWith('.md')).sort().reverse();
    if (reports.length > 0) {
      latestReport = readFileSync(join(reportsDir, reports[0]), 'utf-8').slice(0, 1500);
    }
  }

  const parts = [];
  parts.push('You are KonanAgent2, a TikTok & Instagram content automation assistant.');
  parts.push('You help your user create viral slideshow content, track analytics, and optimize their content strategy.');
  parts.push('Be friendly, concise, and actionable. Use casual language — you\'re chatting in Discord, not writing an essay.');

  if (appProfile?.name) {
    parts.push(`\nAPP/BUSINESS: ${appProfile.name} — ${appProfile.description || ''}`);
    parts.push(`Audience: ${appProfile.audience || 'Unknown'}`);
    parts.push(`Category: ${appProfile.category || 'general'}`);
  }

  if (hookPerf?.hooks?.length > 0) {
    const sorted = [...hookPerf.hooks].sort((a, b) => (b.views || 0) - (a.views || 0));
    const top3 = sorted.slice(0, 3);
    parts.push(`\nTOP HOOKS: ${top3.map(h => `"${h.text}" (${h.views || 0} views)`).join(', ')}`);
  }

  if (hookPerf?.rules) {
    if (hookPerf.rules.doubleDown?.length > 0) parts.push(`DOUBLE DOWN: ${hookPerf.rules.doubleDown.join(', ')}`);
    if (hookPerf.rules.dropped?.length > 0) parts.push(`DROPPED: ${hookPerf.rules.dropped.join(', ')}`);
  }

  if (research?.nicheInsights?.keyInsights) {
    parts.push(`\nRESEARCH INSIGHTS: ${research.nicheInsights.keyInsights}`);
  }

  if (strategy?.suggestedHooks?.length > 0) {
    parts.push(`\nSUGGESTED HOOKS: ${strategy.suggestedHooks.slice(0, 3).map(h => `"${h.slide1Text}"`).join(', ')}`);
  }

  if (latestReport) {
    parts.push(`\nLATEST REPORT:\n${latestReport}`);
  }

  parts.push('\nAVAILABLE COMMANDS (the user can ask you to run these):');
  parts.push('- Generate slideshow: runs the full pipeline (creative director → images → overlays → post)');
  parts.push('- Check analytics: fetches post performance data');
  parts.push('- Generate hooks: creates new hook ideas via the creative director');
  parts.push('- Research: runs automated web search for niche trends');
  parts.push('- Daily report: generates analytics report');
  parts.push('- Status: shows current agent configuration and data summary');

  return parts.join('\n');
}

// ─── COMMAND EXECUTION ────────────────────────────────────────────────────────

function runScript(scriptName, args = '') {
  const cmd = `node ${resolve(ROOT, 'scripts', scriptName)} ${args}`;
  try {
    const output = execSync(cmd, { timeout: 600_000, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return { success: true, output: output.slice(-2000) };
  } catch (err) {
    return { success: false, output: err.stderr?.slice(-1000) || err.message };
  }
}

async function handleCommand(commandName, args, message) {
  const channel = message.channel;

  switch (commandName) {
    case 'generate': {
      const topic = args || 'trending content';
      await channel.send(`Working on it... generating a slideshow about "${topic}". This takes 3-9 minutes.`);
      const result = runScript('full-pipeline.js', `--topic "${topic}" --tiktok`);
      if (result.success) {
        await channel.send(`Slideshow generated! Check your TikTok drafts.\n\`\`\`\n${result.output.slice(-500)}\n\`\`\``);
      } else {
        await channel.send(`Pipeline failed:\n\`\`\`\n${result.output.slice(-500)}\n\`\`\``);
      }
      break;
    }

    case 'analytics': {
      await channel.send('Fetching analytics...');
      const result = runScript('check-analytics.js', '--days 3 --connect');
      await channel.send(`\`\`\`\n${result.output.slice(-1000)}\n\`\`\``);
      break;
    }

    case 'hooks': {
      const count = args || '5';
      await channel.send(`Generating ${count} hook concepts via the Creative Director...`);
      const result = runScript('generate-hooks.js', `--count ${count}`);
      await channel.send(`\`\`\`\n${result.output.slice(-1500)}\n\`\`\``);
      break;
    }

    case 'research': {
      const niche = args || '';
      await channel.send('Running automated web search research... this may take a minute.');
      const result = runScript('competitor-research.js', `--auto-search ${niche ? `--niche "${niche}"` : ''}`);
      await channel.send(`\`\`\`\n${result.output.slice(-1500)}\n\`\`\``);
      break;
    }

    case 'report': {
      await channel.send('Generating daily report...');
      const result = runScript('daily-report.js', '--days 3');
      await channel.send(`\`\`\`\n${result.output.slice(-1500)}\n\`\`\``);
      break;
    }

    case 'status': {
      const appProfile = loadJson('app-profile.json');
      const hookPerf = loadJson('hook-performance.json');
      const research = loadJson('competitor-research.json');
      const strategy = loadJson('strategy.json');

      const embed = new EmbedBuilder()
        .setTitle('KonanAgent2 Status')
        .setColor(0x0099ff)
        .addFields(
          { name: 'App', value: appProfile?.name || 'Not configured', inline: true },
          { name: 'Category', value: appProfile?.category || 'Unknown', inline: true },
          { name: 'Hooks Tracked', value: String(hookPerf?.hooks?.length || 0), inline: true },
          { name: 'Research Date', value: research?.researchDate || 'Never', inline: true },
          { name: 'Suggested Hooks', value: String(strategy?.suggestedHooks?.length || 0), inline: true },
          { name: 'Timezone', value: config.timezone, inline: true },
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      break;
    }

    default:
      await channel.send(`Unknown command: ${commandName}. Try: generate, analytics, hooks, research, report, status`);
  }
}

// ─── CHAT LLM ─────────────────────────────────────────────────────────────────

async function handleChat(message) {
  const channelId = message.channel.id;
  const userMessage = message.content;

  addToHistory(channelId, 'user', userMessage);

  const client = getClient();
  const context = buildAgentContext();
  const history = getHistory(channelId);

  const messages = [
    { role: 'system', content: context },
    ...history,
  ];

  try {
    const completion = await client.chat.completions.create({
      model: config.openai.chatModel,
      messages,
      max_tokens: 1000,
    });

    const reply = completion.choices[0].message.content;
    addToHistory(channelId, 'assistant', reply);

    // Discord has a 2000 char limit
    if (reply.length > 1900) {
      const chunks = reply.match(/.{1,1900}/gs);
      for (const chunk of chunks) await message.reply(chunk);
    } else {
      await message.reply(reply);
    }
  } catch (err) {
    console.error('[Bot] Chat error:', err.message);
    await message.reply(`Sorry, I hit an error: ${err.message}`);
  }
}

// ─── INTENT DETECTION ─────────────────────────────────────────────────────────

function detectCommand(content) {
  const lower = content.toLowerCase().trim();

  // Explicit commands with !prefix
  if (lower.startsWith('!')) {
    const parts = lower.slice(1).split(/\s+/);
    return { command: parts[0], args: parts.slice(1).join(' ') };
  }

  // Natural language intent detection
  if (lower.match(/\b(generate|create|make)\b.*\b(slideshow|slides|post|content)\b/)) {
    const topicMatch = content.match(/(?:about|for|on)\s+"?([^"]+)"?/i) || content.match(/(?:about|for|on)\s+(.+)/i);
    return { command: 'generate', args: topicMatch?.[1]?.trim() || '' };
  }
  if (lower.match(/\b(analytics|stats|numbers|performance|views)\b/)) {
    return { command: 'analytics', args: '' };
  }
  if (lower.match(/\b(hooks?|ideas?)\b.*\b(generate|create|new|suggest)\b/) || lower.match(/\b(generate|create|new|suggest)\b.*\b(hooks?|ideas?)\b/)) {
    return { command: 'hooks', args: '' };
  }
  if (lower.match(/\b(research|trends?|competitors?|niche)\b/)) {
    return { command: 'research', args: '' };
  }
  if (lower.match(/\breport\b/)) {
    return { command: 'report', args: '' };
  }
  if (lower.match(/\bstatus\b/)) {
    return { command: 'status', args: '' };
  }

  return null; // No command detected — treat as conversation
}

// ─── BOT STARTUP ──────────────────────────────────────────────────────────────

export async function startBot() {
  if (!config.discord.botToken) {
    console.error('[Bot] DISCORD_BOT_TOKEN not set in .env — cannot start bot.');
    console.error('[Bot] Get a bot token from https://discord.com/developers/applications');
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', () => {
    console.log(`[Bot] Logged in as ${client.user.tag}`);
    console.log(`[Bot] Listening for messages${config.discord.channelId ? ` in channel ${config.discord.channelId}` : ' (all channels where mentioned)'}...`);
  });

  client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if we should respond to this message
    const inTargetChannel = config.discord.channelId && message.channel.id === config.discord.channelId;
    const isMentioned = message.mentions.has(client.user);
    const isDM = !message.guild;

    if (!inTargetChannel && !isMentioned && !isDM) return;

    // Remove bot mention from content for cleaner processing
    const content = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!content) return;

    console.log(`[Bot] Message from ${message.author.tag}: ${content.slice(0, 100)}`);

    // Check for commands
    const detected = detectCommand(content);
    if (detected) {
      console.log(`[Bot] Detected command: ${detected.command} (args: ${detected.args})`);
      await handleCommand(detected.command, detected.args, message);
    } else {
      // Conversational response
      await handleChat(message);
    }
  });

  await client.login(config.discord.botToken);
  return client;
}

export default { startBot };

import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const REQUIRED_ENV = [
  'POSTIZ_API_KEY',
  'OPENAI_API_KEY',
  'DISCORD_WEBHOOK_URL',
  'TIKTOK_INTEGRATION_ID',
];

function loadJsonFile(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function validate() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    const hints = {
      POSTIZ_API_KEY: 'Get it from https://app.postiz.com → Settings → API',
      OPENAI_API_KEY: 'Get it from https://platform.openai.com/api-keys',
      DISCORD_WEBHOOK_URL: 'Create a webhook in your Discord server → Server Settings → Integrations → Webhooks',
      TIKTOK_INTEGRATION_ID: 'Connect TikTok in Postiz, then find the integration ID in the URL',
    };
    const details = missing.map((k) => `  • ${k} — ${hints[k] || 'Required'}`).join('\n');
    throw new Error(`Missing required environment variables:\n${details}\n\nEdit your .env file: nano .env`);
  }
}

const configPath = resolve(ROOT, 'tiktok-marketing', 'config.json');
const fileConfig = loadJsonFile(configPath);

const config = Object.freeze({
  root: ROOT,
  postiz: {
    apiKey: (process.env.POSTIZ_API_KEY || '').trim(),
    apiUrl: (process.env.POSTIZ_API_URL || 'https://api.postiz.com/public/v1').trim().replace(/\/+$/, ''),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: fileConfig?.imageGen?.model || 'gpt-image-1.5',
    chatModel: fileConfig?.chatModel || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  },
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    channelId: process.env.DISCORD_CHANNEL_ID || '',
  },
  integrations: {
    tiktok: process.env.TIKTOK_INTEGRATION_ID || '',
    instagram: process.env.INSTAGRAM_INTEGRATION_ID || '',
  },
  timezone: process.env.TIMEZONE || 'America/New_York',
  posting: {
    schedule: fileConfig?.posting?.schedule || ['07:30', '16:30', '21:00'],
    privacyLevel: fileConfig?.posting?.privacyLevel || 'SELF_ONLY',
    crossPost: fileConfig?.posting?.crossPost || [],
  },
  analytics: {
    highViewsThreshold: fileConfig?.analytics?.highViewsThreshold || 1000,
    highEngagementRate: fileConfig?.analytics?.highEngagementRate || 0.05,
    trendWindowDays: fileConfig?.analytics?.trendWindowDays || 7,
  },
  app: fileConfig?.app || {},
  imageGen: fileConfig?.imageGen || {},
  fileConfig,
  validate,
});

export default config;

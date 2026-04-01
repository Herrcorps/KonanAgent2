import config from './config.js';

const COLORS = {
  info: 0x0099ff,
  success: 0x00ff00,
  warning: 0xffff00,
  error: 0xff0000,
};

async function send(payload) {
  const url = config.discord.webhookUrl;
  if (!url) {
    console.warn('[Discord] No webhook URL configured — skipping notification');
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[Discord] Webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[Discord] Failed to send: ${err.message}`);
  }
}

export async function sendMessage(text) {
  await send({ content: text });
}

export async function sendEmbed({ title, description, color = 'info', fields = [], footer }) {
  const embed = {
    title,
    description,
    color: COLORS[color] || COLORS.info,
  };
  if (fields.length > 0) embed.fields = fields;
  if (footer) embed.footer = { text: footer };
  embed.timestamp = new Date().toISOString();
  await send({ embeds: [embed] });
}

export async function sendSuccess(message) {
  await sendEmbed({ title: 'Success', description: message, color: 'success' });
}

export async function sendError(message) {
  await sendEmbed({ title: 'Error', description: message, color: 'error' });
}

export async function sendAlert(message) {
  await sendEmbed({ title: 'Alert', description: message, color: 'warning' });
}

export async function sendDailyReport({ summary, topPosts = [], recommendation, hookSuggestions = [] }) {
  const fields = [];

  if (topPosts.length > 0) {
    fields.push({
      name: 'Top Posts',
      value: topPosts
        .map((p, i) => `${i + 1}. **${p.hook || 'Untitled'}** — ${p.views || 0} views, ${p.engagement || '0%'} engagement`)
        .join('\n'),
    });
  }

  if (recommendation) {
    fields.push({ name: 'Recommendation', value: recommendation });
  }

  if (hookSuggestions.length > 0) {
    fields.push({
      name: 'Suggested Hooks for Today',
      value: hookSuggestions.slice(0, 5).map((h) => `• ${h}`).join('\n'),
    });
  }

  await sendEmbed({
    title: 'Daily Analytics Report',
    description: summary,
    color: 'info',
    fields,
    footer: `Report generated at ${new Date().toLocaleString('en-US', { timeZone: config.timezone })}`,
  });
}

export default { sendMessage, sendEmbed, sendSuccess, sendError, sendAlert, sendDailyReport };

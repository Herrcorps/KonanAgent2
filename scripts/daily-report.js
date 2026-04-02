#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { program } from 'commander';
import config from '../src/config.js';
import { listPosts, getPostAnalytics, getPlatformAnalytics } from '../src/postiz-client.js';
import { sendDailyReport, sendError } from '../src/discord-notify.js';
import { generateReport, suggestNextActions } from '../src/analytics.js';
import { applyDecisionRules, getTopHooks } from '../src/hooks.js';

program
  .option('--days <n>', 'Number of days to analyze', '3')
  .parse();

const opts = program.opts();

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function main() {
  config.validate();

  const days = parseInt(opts.days, 10);
  const startDate = daysAgo(days);
  const endDate = new Date().toISOString();

  console.log(`[DailyReport] Generating report for last ${days} days...\n`);

  // Fetch platform-level analytics
  let platformStats;
  try {
    platformStats = await getPlatformAnalytics(config.integrations.tiktok, days);
    console.log('[DailyReport] Platform analytics fetched');
  } catch (err) {
    console.warn(`[DailyReport] Platform analytics failed: ${err.message}`);
    platformStats = {};
  }

  // Fetch posts
  let posts;
  try {
    posts = await listPosts(startDate, endDate);
    if (!Array.isArray(posts)) posts = posts?.posts || [];
  } catch (err) {
    console.error('Failed to fetch posts:', err.message);
    posts = [];
  }

  console.log(`[DailyReport] ${posts.length} posts found\n`);

  // Fetch per-post analytics
  const postsWithAnalytics = [];
  for (const post of posts) {
    const postId = post.id || post.postId;
    try {
      const analytics = await getPostAnalytics(postId);
      postsWithAnalytics.push({
        postId,
        hook: post.content?.split('\n')[0]?.slice(0, 100) || 'Unknown',
        caption: post.content || '',
        views: analytics?.views || 0,
        likes: analytics?.likes || 0,
        comments: analytics?.comments || 0,
        shares: analytics?.shares || 0,
      });
    } catch (err) {
      console.warn(`  Post ${postId}: analytics failed`);
    }
  }

  // Generate report
  const report = generateReport(postsWithAnalytics);
  const actions = suggestNextActions(postsWithAnalytics);

  // Apply hook decision rules
  const rules = applyDecisionRules();
  const topHooks = getTopHooks(3);

  // Generate hook suggestions
  const hookSuggestions = [];
  if (topHooks.length > 0) {
    hookSuggestions.push(`Variations of "${topHooks[0].text}" (your top performer)`);
  }
  if (rules.testing.length > 0) {
    hookSuggestions.push(`Continue testing: ${rules.testing.slice(0, 2).join(', ')}`);
  }
  if (rules.dropped.length > 0) {
    hookSuggestions.push(`Drop these (underperforming): ${rules.dropped.slice(0, 2).join(', ')}`);
  }

  // Save markdown report
  const today = new Date().toISOString().split('T')[0];
  const reportDir = resolve(config.root, 'tiktok-marketing', 'reports');
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });

  const md = `# Daily Report — ${today}

## Summary
${report.summary}

## Top Posts
${report.topPosts.map((p, i) => `${i + 1}. **${p.hook}** — ${p.views} views, ${p.engagement} engagement (${p.diagnosis})`).join('\n')}

## Recommendation
${report.recommendation}

## Actions
${actions.map((a) => `- ${a}`).join('\n')}

## Hook Rules
- **Double down:** ${rules.doubleDown.join(', ') || 'None yet'}
- **Testing:** ${rules.testing.join(', ') || 'None'}
- **Dropped:** ${rules.dropped.join(', ') || 'None'}
`;

  writeFileSync(resolve(reportDir, `${today}.md`), md);
  console.log(`[DailyReport] Report saved to tiktok-marketing/reports/${today}.md`);

  // Send to Discord
  await sendDailyReport({
    summary: report.summary,
    topPosts: report.topPosts,
    recommendation: report.recommendation + '\n\n' + actions.join('\n'),
    hookSuggestions,
  });

  console.log('[DailyReport] Discord notification sent');
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await sendError(`Daily report failed: ${err.message}`);
  process.exit(1);
});

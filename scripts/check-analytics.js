#!/usr/bin/env node
import { program } from 'commander';
import config from '../src/config.js';
import { listPosts, getPostAnalytics, getPostMissing, setReleaseId } from '../src/postiz-client.js';
import { sendEmbed, sendError } from '../src/discord-notify.js';
import { recordPost } from '../src/hooks.js';

program
  .option('--days <n>', 'Number of days to look back', '3')
  .option('--connect', 'Auto-connect TikTok release IDs')
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
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

  console.log(`[Analytics] Fetching posts from last ${days} days...\n`);

  let posts;
  try {
    posts = await listPosts(startDate, endDate);
  } catch (err) {
    console.error('Failed to fetch posts:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(posts)) {
    posts = posts?.posts || [];
  }

  console.log(`Found ${posts.length} posts\n`);

  const results = [];

  for (const post of posts) {
    const postId = post.id || post.postId;
    const publishedAt = new Date(post.publishDate || post.date || post.createdAt).getTime();

    // Skip posts less than 2 hours old (TikTok indexing delay)
    if (publishedAt > twoHoursAgo) {
      console.log(`  [${postId}] Skipping — less than 2 hours old`);
      continue;
    }

    // Try to connect release ID if requested
    if (opts.connect && !post.releaseId) {
      try {
        console.log(`  [${postId}] Fetching missing release IDs...`);
        const missing = await getPostMissing(postId);
        if (missing && Array.isArray(missing) && missing.length > 0) {
          // Sort by ID numerically (highest = newest)
          const sorted = missing.sort((a, b) => {
            const idA = BigInt(a.id || a.releaseId || '0');
            const idB = BigInt(b.id || b.releaseId || '0');
            return idB > idA ? 1 : idB < idA ? -1 : 0;
          });
          const newest = sorted[0];
          const releaseId = newest.id || newest.releaseId;
          console.log(`  [${postId}] Connecting release ID: ${releaseId}`);
          await setReleaseId(postId, releaseId);
        }
      } catch (err) {
        console.warn(`  [${postId}] Could not connect release ID: ${err.message}`);
      }
    }

    // Fetch analytics
    try {
      console.log(`  [${postId}] Fetching analytics...`);
      const analytics = await getPostAnalytics(postId);
      const data = {
        postId,
        caption: post.content?.slice(0, 80) || '',
        views: analytics?.views || 0,
        likes: analytics?.likes || 0,
        comments: analytics?.comments || 0,
        shares: analytics?.shares || 0,
      };
      results.push(data);

      // Update hook tracking
      recordPost({
        postId,
        hook: post.content?.split('\n')[0]?.slice(0, 100) || '',
        views: data.views,
        likes: data.likes,
        comments: data.comments,
        shares: data.shares,
      });

      console.log(`  [${postId}] ${data.views} views, ${data.likes} likes, ${data.comments} comments, ${data.shares} shares`);
    } catch (err) {
      console.warn(`  [${postId}] Analytics failed: ${err.message}`);
    }
  }

  // Summary
  console.log(`\n--- Summary ---`);
  console.log(`Posts analyzed: ${results.length}`);

  const totalViews = results.reduce((s, r) => s + r.views, 0);
  const totalLikes = results.reduce((s, r) => s + r.likes, 0);
  console.log(`Total views: ${totalViews.toLocaleString()}`);
  console.log(`Total likes: ${totalLikes.toLocaleString()}`);

  if (results.length > 0) {
    await sendEmbed({
      title: `Analytics Check — Last ${days} Days`,
      description: `${results.length} posts analyzed`,
      color: 'info',
      fields: [
        { name: 'Total Views', value: totalViews.toLocaleString(), inline: true },
        { name: 'Total Likes', value: totalLikes.toLocaleString(), inline: true },
        { name: 'Posts', value: String(results.length), inline: true },
      ],
    });
  }
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await sendError(`Analytics check failed: ${err.message}`);
  process.exit(1);
});

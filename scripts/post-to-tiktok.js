#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { program } from 'commander';
import config from '../src/config.js';
import { uploadFile, createPost } from '../src/postiz-client.js';
import { sendSuccess, sendError } from '../src/discord-notify.js';
import { recordPost } from '../src/hooks.js';

program
  .requiredOption('--dir <dir>', 'Post directory with slide images')
  .option('--caption <text>', 'Post caption', '')
  .option('--title <text>', 'Post title', '')
  .option('--hook <text>', 'Hook text for tracking', '')
  .option('--cta <text>', 'CTA text for tracking', '')
  .parse();

const opts = program.opts();

async function main() {
  config.validate();

  const slideDir = resolve(opts.dir);

  // Find overlay images first, fall back to regular slides
  let files = readdirSync(slideDir)
    .filter((f) => f.match(/slide-\d+-overlay\.png$/))
    .sort();

  if (files.length === 0) {
    files = readdirSync(slideDir)
      .filter((f) => f.match(/slide-\d+\.png$/) && !f.includes('overlay'))
      .sort();
  }

  if (files.length === 0) {
    console.error('No slide images found in', slideDir);
    process.exit(1);
  }

  console.log(`[TikTok] Uploading ${files.length} slides...\n`);

  // Upload each image to Postiz
  const uploaded = [];
  for (const file of files) {
    const filePath = join(slideDir, file);
    console.log(`  Uploading ${file}...`);
    const result = await uploadFile(filePath);
    uploaded.push(result);
    console.log(`  ✓ ${file} uploaded`);
  }

  console.log(`\n[TikTok] Creating draft post...`);

  // Create the draft post
  const postDate = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min from now
  const payload = {
    type: 'draft',
    date: postDate,
    posts: [
      {
        integration: { id: config.integrations.tiktok },
        value: [
          {
            content: opts.caption,
            image: uploaded.map((u) => ({ id: u.id, path: u.path })),
          },
        ],
        settings: {
          __type: 'tiktok',
          title: opts.title,
          privacy_level: config.posting.privacyLevel,
          duet: false,
          stitch: false,
          comment: true,
          autoAddMusic: 'no',
          brand_content_toggle: false,
          brand_organic_toggle: false,
          content_posting_method: 'UPLOAD',
        },
      },
    ],
  };

  const result = await createPost(payload);
  const postId = result?.id || result?.postId || 'unknown';

  // Save post metadata
  const meta = {
    postId,
    platform: 'tiktok',
    slideDir,
    caption: opts.caption,
    hook: opts.hook,
    cta: opts.cta,
    slideCount: files.length,
    createdAt: new Date().toISOString(),
    published: false,
  };
  writeFileSync(join(slideDir, 'post-meta-tiktok.json'), JSON.stringify(meta, null, 2));

  // Record in hook tracking
  if (opts.hook) {
    recordPost({ postId, hook: opts.hook, cta: opts.cta, date: new Date().toISOString().split('T')[0] });
  }

  console.log(`\n✓ TikTok draft created! Post ID: ${postId}`);
  console.log('\n  NEXT STEPS:');
  console.log('  1. Open TikTok on your phone');
  console.log('  2. Go to your inbox/drafts');
  console.log('  3. Add a TRENDING SOUND (this is critical for reach!)');
  console.log('  4. Publish when ready\n');

  await sendSuccess(
    `📱 TikTok draft posted!\n**Slides:** ${files.length}\n**Caption:** ${opts.caption.slice(0, 100) || '(none)'}` +
    `\n\n⚡ Open TikTok → Inbox → Add trending sound → Publish`
  );
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await sendError(`TikTok post failed: ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { readdirSync, writeFileSync } from 'node:fs';
import { program } from 'commander';
import config from '../src/config.js';
import { uploadFile, createPost } from '../src/postiz-client.js';
import { sendSuccess, sendError } from '../src/discord-notify.js';
import { recordPost } from '../src/hooks.js';

program
  .requiredOption('--dir <dir>', 'Post directory with slide images')
  .option('--caption <text>', 'Post caption', '')
  .option('--hook <text>', 'Hook text for tracking', '')
  .option('--cta <text>', 'CTA text for tracking', '')
  .parse();

const opts = program.opts();

async function main() {
  config.validate();

  if (!config.integrations.instagram) {
    console.error('Error: INSTAGRAM_INTEGRATION_ID not set in .env');
    process.exit(1);
  }

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

  console.log(`[Instagram] Uploading ${files.length} slides...\n`);

  const uploaded = [];
  for (const file of files) {
    const filePath = join(slideDir, file);
    console.log(`  Uploading ${file}...`);
    const result = await uploadFile(filePath);
    uploaded.push(result);
    console.log(`  ✓ ${file} uploaded`);
  }

  console.log(`\n[Instagram] Creating carousel post...`);

  const postDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const payload = {
    type: 'draft',
    date: postDate,
    posts: [
      {
        integration: { id: config.integrations.instagram },
        value: [
          {
            content: opts.caption,
            image: uploaded.map((u) => ({ id: u.id, path: u.path })),
          },
        ],
        settings: {
          __type: 'instagram',
          post_type: 'post',
          is_trial_reel: false,
          collaborators: [],
        },
      },
    ],
  };

  const result = await createPost(payload);
  const postId = result?.id || result?.postId || 'unknown';

  const meta = {
    postId,
    platform: 'instagram',
    slideDir,
    caption: opts.caption,
    hook: opts.hook,
    cta: opts.cta,
    slideCount: files.length,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(slideDir, 'post-meta-instagram.json'), JSON.stringify(meta, null, 2));

  if (opts.hook) {
    recordPost({ postId, hook: opts.hook, cta: opts.cta, date: new Date().toISOString().split('T')[0] });
  }

  console.log(`\n✓ Instagram carousel posted! Post ID: ${postId}`);

  await sendSuccess(
    `📸 Instagram carousel posted!\n**Slides:** ${files.length}\n**Caption:** ${opts.caption.slice(0, 100) || '(none)'}`
  );
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await sendError(`Instagram post failed: ${err.message}`);
  process.exit(1);
});

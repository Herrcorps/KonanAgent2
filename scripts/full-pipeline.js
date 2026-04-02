#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { program } from 'commander';
import config from '../src/config.js';
import { generateSlideshow } from '../src/image-generator.js';
import { addOverlaysToSlides } from '../src/overlay.js';
import { uploadFile, createPost } from '../src/postiz-client.js';
import { sendSuccess, sendError, sendEmbed } from '../src/discord-notify.js';
import { recordPost } from '../src/hooks.js';

program
  .requiredOption('--topic <topic>', 'Topic for the slideshow')
  .option('--hook <text>', 'Hook text for slide 1')
  .option('--caption <text>', 'Post caption')
  .option('--cta <text>', 'CTA text (for tracking)')
  .option('--texts <file>', 'JSON file with overlay texts for all 6 slides')
  .option('--tiktok', 'Post to TikTok', true)
  .option('--no-tiktok', 'Skip TikTok')
  .option('--instagram', 'Post to Instagram')
  .parse();

const opts = program.opts();

async function main() {
  config.validate();

  const now = new Date();
  const timestamp = now.toISOString().replace(/[T:]/g, '-').slice(0, 16);
  const outputDir = resolve(config.root, 'tiktok-marketing', 'posts', timestamp);
  mkdirSync(outputDir, { recursive: true });

  console.log('============================================');
  console.log('  KonanAgent2 — Full Pipeline');
  console.log('============================================\n');

  // Step 1: Generate slides
  console.log('STEP 1: Generating slideshow images...\n');

  const baseStyle = config.imageGen.basePrompt || 'iPhone photo, realistic lighting, natural colors, taken on iPhone 15 Pro. No text, no watermarks, no logos. Portrait orientation.';
  const prompts = [];
  for (let i = 1; i <= 6; i++) {
    if (i === 1) {
      prompts.push(`${opts.topic} — eye-catching opening shot. ${baseStyle}`);
    } else if (i === 6) {
      prompts.push(`${opts.topic} — final reveal, satisfying conclusion. ${baseStyle}`);
    } else {
      prompts.push(`${opts.topic} — variation ${i}, different angle or detail. ${baseStyle}`);
    }
  }

  const slides = await generateSlideshow({ prompts, outputDir, basePrompt: '' });
  console.log(`\n✓ ${slides.length} slides generated\n`);

  // Step 2: Add overlays (if texts provided)
  let finalSlides = slides;
  if (opts.texts) {
    console.log('STEP 2: Adding text overlays...\n');
    const texts = JSON.parse(readFileSync(resolve(opts.texts), 'utf-8'));
    finalSlides = await addOverlaysToSlides(outputDir, texts);
    console.log(`\n✓ Overlays added\n`);
  } else if (opts.hook) {
    console.log('STEP 2: Skipping overlays (no --texts file provided)');
    console.log('  Tip: Create a JSON file with 6 overlay texts and pass with --texts\n');
  }

  // Step 3: Post to platforms
  const postIds = {};

  if (opts.tiktok && config.integrations.tiktok) {
    console.log('STEP 3a: Posting to TikTok as draft...\n');
    try {
      const uploaded = [];
      for (const slide of finalSlides) {
        const result = await uploadFile(slide);
        uploaded.push(result);
      }

      const payload = {
        type: 'draft',
        date: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        posts: [{
          integration: { id: config.integrations.tiktok },
          value: [{ content: opts.caption || '', image: uploaded.map((u) => ({ id: u.id, path: u.path })) }],
          settings: {
            __type: 'tiktok',
            title: opts.hook || '',
            privacy_level: config.posting.privacyLevel,
            duet: false, stitch: false, comment: true,
            autoAddMusic: 'no',
            brand_content_toggle: false, brand_organic_toggle: false,
            content_posting_method: 'UPLOAD',
          },
        }],
      };

      const result = await createPost(payload);
      postIds.tiktok = result?.id || result?.postId || 'unknown';
      console.log(`  ✓ TikTok draft created (ID: ${postIds.tiktok})\n`);
    } catch (err) {
      console.error(`  ✗ TikTok post failed: ${err.message}\n`);
    }
  }

  if (opts.instagram && config.integrations.instagram) {
    console.log('STEP 3b: Posting to Instagram...\n');
    try {
      const uploaded = [];
      for (const slide of finalSlides) {
        const result = await uploadFile(slide);
        uploaded.push(result);
      }

      const payload = {
        type: 'draft',
        date: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        posts: [{
          integration: { id: config.integrations.instagram },
          value: [{ content: opts.caption || '', image: uploaded.map((u) => ({ id: u.id, path: u.path })) }],
          settings: { __type: 'instagram', post_type: 'post', is_trial_reel: false, collaborators: [] },
        }],
      };

      const result = await createPost(payload);
      postIds.instagram = result?.id || result?.postId || 'unknown';
      console.log(`  ✓ Instagram carousel posted (ID: ${postIds.instagram})\n`);
    } catch (err) {
      console.error(`  ✗ Instagram post failed: ${err.message}\n`);
    }
  }

  // Save meta
  const meta = {
    topic: opts.topic,
    hook: opts.hook || '',
    cta: opts.cta || '',
    caption: opts.caption || '',
    slideCount: finalSlides.length,
    postIds,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(outputDir, 'pipeline-meta.json'), JSON.stringify(meta, null, 2));

  // Track hooks
  for (const [platform, postId] of Object.entries(postIds)) {
    recordPost({ postId, hook: opts.hook || opts.topic, cta: opts.cta, date: new Date().toISOString().split('T')[0] });
  }

  // Summary
  console.log('============================================');
  console.log('  Pipeline Complete!');
  console.log('============================================\n');
  console.log(`  Output: ${outputDir}`);
  for (const [platform, id] of Object.entries(postIds)) {
    console.log(`  ${platform}: ${id}`);
  }
  console.log('\n  NEXT: Open TikTok → Inbox → Add trending sound → Publish\n');

  await sendSuccess(
    `Pipeline complete!\n**Topic:** ${opts.topic}\n**Slides:** ${finalSlides.length}` +
    Object.entries(postIds).map(([p, id]) => `\n**${p}:** ${id}`).join('') +
    `\n\n⚡ Open TikTok → Add trending sound → Publish`
  );
}

main().catch(async (err) => {
  console.error('Pipeline failed:', err.message);
  await sendError(`Pipeline failed: ${err.message}`);
  process.exit(1);
});

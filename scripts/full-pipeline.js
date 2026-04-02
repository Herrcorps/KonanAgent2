#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { program } from 'commander';
import config from '../src/config.js';
import { generateSlideshowConcept, loadAppProfile, loadResearch } from '../src/creative-director.js';
import { generateSlideshow } from '../src/image-generator.js';
import { addOverlaysToSlides } from '../src/overlay.js';
import { uploadFile, createPost } from '../src/postiz-client.js';
import { sendSuccess, sendError } from '../src/discord-notify.js';
import { recordPost } from '../src/hooks.js';

program
  .requiredOption('--topic <topic>', 'Topic for the slideshow')
  .option('--hook <text>', 'Override hook text for slide 1')
  .option('--caption <text>', 'Override post caption')
  .option('--cta <text>', 'Override CTA text (for tracking)')
  .option('--content-type <type>', 'Content type (relationships, self-improvement, ai-productivity, dream-life)')
  .option('--texts <file>', 'Override: JSON file with overlay texts for all 6 slides')
  .option('--no-creative-director', 'Use basic prompt generation')
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

  // Step 1: Generate concept via Creative Director (or basic mode)
  let concept = null;
  let prompts;
  let overlayTexts = null;

  if (opts.creativeDirector !== false) {
    console.log('STEP 1: Creative Director — generating slideshow concept...\n');
    const appProfile = loadAppProfile();
    const research = loadResearch();

    concept = await generateSlideshowConcept({
      topic: opts.topic,
      contentType: opts.contentType,
      appProfile,
      research,
    });

    console.log(`  Angle: ${concept.angle}`);
    console.log(`  Hook: "${concept.hook}"`);
    console.log(`  Lighting: ${concept.lightingMood}`);
    console.log(`  Content type: ${concept.contentType}\n`);

    // Save concept
    writeFileSync(join(outputDir, 'concept.json'), JSON.stringify(concept, null, 2));

    prompts = concept.slides.map(s => s.imagePrompt);
    overlayTexts = concept.slides.map(s => s.text);
  } else {
    console.log('STEP 1: Generating basic slideshow prompts...\n');
    const baseStyle = config.imageGen.basePrompt || 'iPhone photo, realistic lighting, natural colors, taken on iPhone 15 Pro. No text, no watermarks, no logos. Portrait orientation.';
    prompts = [];
    for (let i = 1; i <= 6; i++) {
      if (i === 1) prompts.push(`${opts.topic} — eye-catching opening shot. ${baseStyle}`);
      else if (i === 6) prompts.push(`${opts.topic} — final reveal, satisfying conclusion. ${baseStyle}`);
      else prompts.push(`${opts.topic} — variation ${i}, different angle or detail. ${baseStyle}`);
    }
  }

  // Step 2: Generate images
  console.log('STEP 2: Generating slideshow images...\n');
  const slides = await generateSlideshow({ prompts, outputDir, basePrompt: '' });
  console.log(`\n${slides.length} slides generated\n`);

  // Step 3: Add overlays
  let finalSlides = slides;
  if (opts.texts) {
    console.log('STEP 3: Adding text overlays from file...\n');
    const texts = JSON.parse(readFileSync(resolve(opts.texts), 'utf-8'));
    finalSlides = await addOverlaysToSlides(outputDir, texts);
    console.log(`\nOverlays added\n`);
  } else if (overlayTexts) {
    console.log('STEP 3: Adding creative director text overlays...\n');
    finalSlides = await addOverlaysToSlides(outputDir, overlayTexts);
    console.log(`\nOverlays added\n`);
  } else {
    console.log('STEP 3: Skipping overlays (no text provided)\n');
  }

  // Step 4: Post to platforms
  const postIds = {};
  const caption = opts.caption || concept?.caption || '';
  const hook = opts.hook || concept?.hook || opts.topic;
  const cta = opts.cta || concept?.cta || '';

  if (opts.tiktok && config.integrations.tiktok) {
    console.log('STEP 4a: Posting to TikTok as draft...\n');
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
          value: [{ content: caption, image: uploaded.map((u) => ({ id: u.id, path: u.path })) }],
          settings: {
            __type: 'tiktok',
            title: hook,
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
      console.log(`  TikTok draft created (ID: ${postIds.tiktok})\n`);
    } catch (err) {
      console.error(`  TikTok post failed: ${err.message}\n`);
    }
  }

  if (opts.instagram && config.integrations.instagram) {
    console.log('STEP 4b: Posting to Instagram...\n');
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
          value: [{ content: caption, image: uploaded.map((u) => ({ id: u.id, path: u.path })) }],
          settings: { __type: 'instagram', post_type: 'post', is_trial_reel: false, collaborators: [] },
        }],
      };

      const result = await createPost(payload);
      postIds.instagram = result?.id || result?.postId || 'unknown';
      console.log(`  Instagram carousel posted (ID: ${postIds.instagram})\n`);
    } catch (err) {
      console.error(`  Instagram post failed: ${err.message}\n`);
    }
  }

  // Save meta
  const meta = {
    topic: opts.topic,
    hook,
    cta,
    caption,
    slideCount: finalSlides.length,
    postIds,
    concept: concept ? { angle: concept.angle, lightingMood: concept.lightingMood, contentType: concept.contentType } : null,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(outputDir, 'pipeline-meta.json'), JSON.stringify(meta, null, 2));

  // Track hooks
  for (const [platform, postId] of Object.entries(postIds)) {
    recordPost({ postId, hook, cta, date: new Date().toISOString().split('T')[0] });
  }

  // Summary
  console.log('============================================');
  console.log('  Pipeline Complete!');
  console.log('============================================\n');
  console.log(`  Output: ${outputDir}`);
  if (concept) {
    console.log(`  Angle: ${concept.angle}`);
    console.log(`  Hook: "${hook}"`);
  }
  for (const [platform, id] of Object.entries(postIds)) {
    console.log(`  ${platform}: ${id}`);
  }
  console.log('\n  NEXT: Open TikTok → Inbox → Add trending sound → Publish\n');

  await sendSuccess(
    `Pipeline complete!\n**Topic:** ${opts.topic}\n**Angle:** ${concept?.angle || 'basic'}\n**Slides:** ${finalSlides.length}` +
    Object.entries(postIds).map(([p, id]) => `\n**${p}:** ${id}`).join('') +
    `\n\n⚡ Open TikTok → Add trending sound → Publish`
  );
}

main().catch(async (err) => {
  console.error('Pipeline failed:', err.message);
  await sendError(`Pipeline failed: ${err.message}`);
  process.exit(1);
});

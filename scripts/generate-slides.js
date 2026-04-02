#!/usr/bin/env node
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { program } from 'commander';
import config from '../src/config.js';
import { generateSlideshow } from '../src/image-generator.js';
import { generateSlideshowConcept, loadAppProfile, loadResearch } from '../src/creative-director.js';
import { addOverlaysToSlides } from '../src/overlay.js';

program
  .option('--topic <topic>', 'Topic for the slideshow')
  .option('--prompts <file>', 'JSON file with per-slide prompts')
  .option('--output <dir>', 'Output directory')
  .option('--count <n>', 'Number of slides', '6')
  .option('--content-type <type>', 'Content type (relationships, self-improvement, ai-productivity, dream-life)')
  .option('--no-creative-director', 'Use basic prompt generation instead of creative director')
  .option('--no-overlay', 'Skip automatic overlay from creative director')
  .parse();

const opts = program.opts();

async function main() {
  config.validate();

  const count = parseInt(opts.count, 10);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[T:]/g, '-').slice(0, 16);
  const outputDir = opts.output || resolve(config.root, 'tiktok-marketing', 'posts', timestamp);

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  let prompts;
  let concept = null;

  if (opts.prompts) {
    // Load prompts from JSON file
    const raw = readFileSync(resolve(opts.prompts), 'utf-8');
    prompts = JSON.parse(raw);
  } else if (opts.topic && opts.creativeDirector !== false) {
    // Use the Creative Director
    console.log('[CreativeDirector] Generating slideshow concept...\n');
    const appProfile = loadAppProfile();
    const research = loadResearch();

    concept = await generateSlideshowConcept({
      topic: opts.topic,
      contentType: opts.contentType,
      appProfile,
      research,
    });

    console.log(`[CreativeDirector] Angle: ${concept.angle}`);
    console.log(`[CreativeDirector] Hook: "${concept.hook}"`);
    console.log(`[CreativeDirector] Lighting: ${concept.lightingMood}`);
    console.log(`[CreativeDirector] Content type: ${concept.contentType}\n`);

    // Save concept for reference
    writeFileSync(resolve(outputDir, 'concept.json'), JSON.stringify(concept, null, 2));
    console.log(`[CreativeDirector] Concept saved to concept.json\n`);

    // Extract image prompts from concept
    prompts = concept.slides.map(s => s.imagePrompt);
  } else if (opts.topic) {
    // Basic mode (--no-creative-director)
    const baseStyle = config.imageGen.basePrompt || 'iPhone photo, realistic lighting, natural colors, taken on iPhone 15 Pro. No text, no watermarks, no logos. Portrait orientation.';
    prompts = [];
    for (let i = 1; i <= count; i++) {
      if (i === 1) {
        prompts.push(`${opts.topic} — establishing shot, eye-catching opening image. ${baseStyle}`);
      } else if (i === count) {
        prompts.push(`${opts.topic} — final reveal, satisfying conclusion. ${baseStyle}`);
      } else {
        prompts.push(`${opts.topic} — variation ${i}, different angle or detail. ${baseStyle}`);
      }
    }
  } else {
    console.error('Error: provide --topic or --prompts');
    process.exit(1);
  }

  const basePrompt = config.imageGen.basePrompt || '';

  console.log(`Generating ${prompts.length} slides...`);
  console.log(`Output: ${outputDir}\n`);

  const results = await generateSlideshow({ prompts, outputDir, basePrompt: opts.prompts ? basePrompt : '' });

  // Auto-apply overlays if creative director generated text
  if (concept && opts.overlay !== false) {
    const overlayTexts = concept.slides.map(s => s.text);
    console.log(`\n[Overlay] Applying creative director text overlays...`);
    await addOverlaysToSlides(outputDir, overlayTexts);
    console.log(`[Overlay] Done!\n`);
  }

  console.log(`\nDone! ${results.length} slides saved to:\n  ${outputDir}`);
  if (concept) {
    console.log(`\n  Hook: "${concept.hook}"`);
    console.log(`  Caption: ${concept.caption?.slice(0, 100)}...`);
    console.log(`  CTA: "${concept.cta}"`);
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});

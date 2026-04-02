#!/usr/bin/env node
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { program } from 'commander';
import config from '../src/config.js';
import { generateSlideshow } from '../src/image-generator.js';

program
  .option('--topic <topic>', 'Topic for the slideshow')
  .option('--prompts <file>', 'JSON file with per-slide prompts')
  .option('--output <dir>', 'Output directory')
  .option('--count <n>', 'Number of slides', '6')
  .parse();

const opts = program.opts();

async function main() {
  config.validate();

  const count = parseInt(opts.count, 10);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[T:]/g, '-').slice(0, 16);
  const outputDir = opts.output || resolve(config.root, 'tiktok-marketing', 'posts', timestamp);

  let prompts;

  if (opts.prompts) {
    // Load prompts from JSON file
    const raw = readFileSync(resolve(opts.prompts), 'utf-8');
    prompts = JSON.parse(raw);
  } else if (opts.topic) {
    // Generate default prompts from topic
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

  const results = await generateSlideshow({ prompts, outputDir, basePrompt });
  console.log(`\nDone! ${results.length} slides saved to:\n  ${outputDir}`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});

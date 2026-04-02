#!/usr/bin/env node
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { program } from 'commander';
import config from '../src/config.js';
import { addOverlaysToSlides } from '../src/overlay.js';

program
  .requiredOption('--dir <dir>', 'Post directory containing slide-N.png files')
  .option('--texts <json>', 'JSON file with overlay texts (array of strings)')
  .option('--inline <json>', 'Inline JSON array of overlay texts')
  .parse();

const opts = program.opts();

async function main() {
  const slideDir = resolve(opts.dir);

  let texts;
  if (opts.texts) {
    const raw = readFileSync(resolve(opts.texts), 'utf-8');
    texts = JSON.parse(raw);
  } else if (opts.inline) {
    texts = JSON.parse(opts.inline);
  } else {
    console.error('Error: provide --texts <file.json> or --inline \'["text1","text2",...]\'');
    process.exit(1);
  }

  if (!Array.isArray(texts)) {
    console.error('Error: texts must be a JSON array of strings');
    process.exit(1);
  }

  console.log(`Adding overlays to ${texts.length} slides in ${slideDir}\n`);

  const results = await addOverlaysToSlides(slideDir, texts);
  console.log(`\nDone! Overlay files:`);
  for (const r of results) {
    console.log(`  ${r}`);
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});

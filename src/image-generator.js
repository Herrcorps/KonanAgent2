import OpenAI from 'openai';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import config from './config.js';
import { sendSuccess, sendError } from './discord-notify.js';

let openai;
function getClient() {
  if (!openai) {
    openai = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return openai;
}

export async function generateSlide(prompt, outputPath) {
  const client = getClient();
  const res = await client.images.generate({
    model: config.openai.model,
    prompt,
    size: '1024x1536',
    output_format: 'png',
  });

  const b64 = res.data[0].b64_json;
  const buffer = Buffer.from(b64, 'base64');
  writeFileSync(outputPath, buffer);
  return outputPath;
}

export async function generateSlideshow({ prompts, outputDir, basePrompt }) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const count = prompts.length;
  const results = [];
  const startTime = Date.now();

  console.log(`[ImageGen] Generating ${count} slides to ${outputDir}`);
  console.log(`[ImageGen] Model: ${config.openai.model}`);
  console.log(`[ImageGen] This will take 3-9 minutes...\n`);

  for (let i = 0; i < count; i++) {
    const slidePath = join(outputDir, `slide-${i + 1}.png`);

    // Resume support — skip existing slides
    if (existsSync(slidePath)) {
      console.log(`[ImageGen] Slide ${i + 1}/${count} already exists, skipping`);
      results.push(slidePath);
      continue;
    }

    const fullPrompt = basePrompt
      ? `${basePrompt}\n\n${prompts[i]}`
      : prompts[i];

    console.log(`[ImageGen] Generating slide ${i + 1}/${count}...`);
    const slideStart = Date.now();

    try {
      await generateSlide(fullPrompt, slidePath);
      const elapsed = ((Date.now() - slideStart) / 1000).toFixed(1);
      console.log(`[ImageGen] Slide ${i + 1}/${count} done (${elapsed}s)`);
      results.push(slidePath);
    } catch (err) {
      console.error(`[ImageGen] Slide ${i + 1} failed: ${err.message}`);
      await sendError(`Slide ${i + 1} generation failed: ${err.message}`);
      throw err;
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const minutes = Math.floor(totalElapsed / 60);
  const seconds = totalElapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  console.log(`\n[ImageGen] All ${count} slides generated in ${timeStr}`);
  await sendSuccess(`${count} slides generated in ${timeStr}\nOutput: ${outputDir}`);

  return results;
}

export default { generateSlide, generateSlideshow };

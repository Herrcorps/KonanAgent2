import { createCanvas, loadImage } from 'canvas';
import { writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export async function addOverlay(imagePath, text, outputPath) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Dynamic font sizing based on word count
  const wordCount = text.split(/\s+/).length;
  let fontSizePercent;
  if (wordCount <= 5) fontSizePercent = 0.075;       // Short: ~75px on 1024w
  else if (wordCount <= 12) fontSizePercent = 0.065;  // Medium: ~66px
  else fontSizePercent = 0.050;                       // Long: ~51px

  const fontSize = Math.round(img.width * fontSizePercent);
  const outlineWidth = Math.round(fontSize * 0.15);
  const maxWidth = img.width * 0.75;
  const lineHeight = fontSize * 1.3;

  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Word wrap with manual \n support
  const lines = [];
  const manualLines = text.split('\n');
  for (const ml of manualLines) {
    const words = ml.trim().split(/\s+/);
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  // Position: centered at ~28% from top
  const totalHeight = lines.length * lineHeight;
  const startY = (img.height * 0.28) - (totalHeight / 2);
  const x = img.width / 2;

  // Draw each line
  for (let i = 0; i < lines.length; i++) {
    const y = startY + (i * lineHeight);

    // Black outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(lines[i], x, y);

    // White fill
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(lines[i], x, y);
  }

  const out = outputPath || imagePath.replace(/\.png$/, '-overlay.png');
  writeFileSync(out, canvas.toBuffer('image/png'));
  return out;
}

export async function addOverlaysToSlides(slideDir, overlayTexts) {
  const results = [];
  for (let i = 0; i < overlayTexts.length; i++) {
    const slidePath = join(slideDir, `slide-${i + 1}.png`);
    const outPath = join(slideDir, `slide-${i + 1}-overlay.png`);
    console.log(`[Overlay] Processing slide ${i + 1}/${overlayTexts.length}...`);
    const result = await addOverlay(slidePath, overlayTexts[i], outPath);
    results.push(result);
  }
  console.log(`[Overlay] All ${overlayTexts.length} slides processed`);
  return results;
}

export default { addOverlay, addOverlaysToSlides };

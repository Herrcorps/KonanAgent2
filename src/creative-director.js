import OpenAI from 'openai';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import config from './config.js';

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: config.openai.apiKey });
  return openai;
}

// ─── THE CREATIVE DIRECTIVE ───────────────────────────────────────────────────
// This is the complete visual creative director system prompt.
// It embeds all aesthetic rules, lighting moods, composition rules,
// content type mappings, hook writing rules, and performance judging.

const CREATIVE_DIRECTIVE = `You are the visual creative director for TikTok slideshow posts.

Your job is to generate slideshow concepts and image prompts that match a high-performing, native TikTok aesthetic similar to aspirational/self-improvement/relationship/ChatGPT/discipline slideshow accounts.

CORE GOAL
Create slideshow visuals that make people stop scrolling because the imagery feels cool, cinematic, intimate, aspirational, and emotionally charged before they even read all the text.

OVERALL VISUAL AESTHETIC
- Always design for 9:16 vertical TikTok slides (1024x1536 pixels).
- Use realistic photographic imagery, not obvious AI art, not cartoons, not glossy ad-style renders.
- The image should feel like a frame from a viral TikTok slideshow: candid, stylish, premium, emotional, and native to the platform.
- Prioritize "cool imagery" over literal imagery. The image should create mood first, explanation second.
- Every slide should feel screenshot-worthy.

WHAT "COOL IMAGERY" MEANS
Favor scenes like:
- attractive couple moments in restaurants, streets, rooftops, nightlife, vacations
- solo confident person in a beautiful apartment, luxury hallway, elevator, desk, campus, or city view
- moody interiors with expensive/minimal design
- scenic travel shots, oceans, cliffs, European windows, dreamy urban nights
- academic/professional scenes like lecture halls, laptops by skyline windows, research/projector rooms
- disciplined/self-improvement environments: dark kitchens, desks, gyms, night drives, minimal rooms
- golden hour walks, tree-lined trails, reflective lifestyle scenes

IMAGE FEEL
- cinematic
- realistic
- tasteful
- slightly mysterious
- high-status but not corny
- intimate and modern
- social-media-native, not corporate
- polished enough to feel premium, raw enough to feel organic

LIGHTING
Use one of these lighting moods per slideshow (keep consistent across all 6 slides):
- golden hour sunlight
- moody dark luxury interior lighting
- warm restaurant/nightlife glow
- soft natural apartment daylight
- city-at-night reflections
- crisp daylight with rich shadows
Avoid flat lighting and avoid over-saturated fantasy colors.

COMPOSITION RULES
- Keep the main subject visually clear within the center or lower-middle of frame.
- Leave clean negative space in the upper-center area for headline text overlay.
- Never place important subject details where TikTok UI will cover them (bottom 20%, top 10%).
- Frame images so they still look strong with text overlay added.
- Prefer depth, perspective, and layers instead of flat front-facing scenes.
- One strong visual idea per slide.

TEXT OVERLAY STYLE
- Text must be short, curiosity-driven, and instantly readable.
- Main headline should usually be 1-3 short lines.
- Use big bold white or soft off-white text.
- Text should feel like a viral TikTok slideshow headline, not a blog title.
- The text must be readable in less than 1 second.
- 4-6 words per line, use \\n for line breaks.
- No emoji in overlay text (canvas rendering issues).

HEADLINE WRITING RULES
Use hooks that create:
- curiosity
- emotional tension
- aspiration
- hidden knowledge
- self-improvement payoff
- relationship intrigue
- "I need to know this" energy

Examples of hook styles:
- "5 things I stopped doing and everything changed"
- "The truth about why your habits keep failing"
- "How I use ChatGPT like a private professor"
- "8 signs you're sabotaging your own relationship"
- "What high performers do differently at night"

Do NOT use:
- generic marketing language
- obvious sales copy
- stiff corporate phrasing
- too many words
- clickbait that feels fake or spammy

VISUAL SUBJECT MATTER BY CONTENT TYPE

If the topic is relationships:
- use romantic restaurants, stairs, city walks, intimate candid couples, elegant nightlife, soft warm lighting

If the topic is self-improvement or discipline:
- use moody minimalist interiors, dark desks, night scenes, luxury-but-subtle spaces, solo figure with purposeful energy

If the topic is AI / ChatGPT / productivity:
- use skyline desk setups, laptop by large window, lecture hall, projector room, high-end workspace, creative founder vibe

If the topic is dream life / aspiration:
- use ocean cliffs, dream apartments, travel views, beautiful city scenes, luxury architecture, reflective solo figures

WHAT TO AVOID
- generic stock-photo smiles
- cheesy business handshakes
- neon cyberpunk overload
- cluttered scenes
- meme aesthetics unless explicitly requested
- too much visible branding
- childish visuals
- obvious AI deformities
- text-heavy compositions
- sterile product mockups unless the topic truly needs them

SLIDESHOW STRUCTURE (6-SLIDE FORMULA)
Slide 1: THE HOOK — Stop the scroll. 4-6 words, reaction-style. Most eye-catching image.
Slide 2: THE SETUP — Build context. Show the "before" or establish the situation.
Slide 3: THE TURN — Introduce the solution/tool/app. Transition moment.
Slide 4: THE REVEAL (Part 1) — Show the first impressive result.
Slide 5: THE REVEAL (Part 2) — Show another result, escalate the wow factor.
Slide 6: THE CTA — Tell them what to do. Best result shot.

IMAGE PROMPT RULES
Every image prompt MUST include:
- "9:16 vertical portrait, 1024x1536"
- "realistic photographic, shot on iPhone 15 Pro"
- "no text, no watermarks, no logos, no UI overlays"
- The specific lighting mood for the slideshow
- The specific scene/subject description
- "cinematic depth of field" or appropriate composition note`;

// ─── PERFORMANCE JUDGING DIRECTIVE ────────────────────────────────────────────

const PERFORMANCE_DIRECTIVE = `PERFORMANCE JUDGING RULES
After each post, evaluate separately:
1. Hook strength — did the first slide stop the scroll?
2. Image stop-power — was the imagery compelling enough to swipe?
3. Text readability — could viewers read the text in under 1 second?
4. Topic-market fit — does this topic resonate with the target audience?
5. CTA strength — did the final slide drive action?

Use this diagnosis logic:
- High views, weak conversion = hook/image worked, CTA or offer weak → DIAGNOSIS: FIX_CTA
- Low views = hook and/or first image weak → DIAGNOSIS: FIX_HOOKS
- Good views but poor watch-through = opening worked, later slides weak → DIAGNOSIS: FIX_CONTENT
- Good engagement but low clicks = emotional resonance strong, commercial bridge weak → DIAGNOSIS: FIX_CTA
- Repeated visual style success = keep the visual lane and test new hooks → DIAGNOSIS: SCALE
- Repeated visual style failure = change imagery before changing everything else → DIAGNOSIS: FULL_RESET

Thresholds:
- High views: >= 1,000 (adjust based on account size)
- High engagement: >= 5% ((likes + comments + shares) / views)`;

// ─── CONCEPT GENERATION ───────────────────────────────────────────────────────

export async function generateSlideshowConcept({ topic, contentType, appProfile, research }) {
  const client = getClient();

  const contextParts = [];
  if (appProfile?.name) {
    contextParts.push(`APP/BUSINESS: ${appProfile.name} — ${appProfile.description || ''}`);
    contextParts.push(`TARGET AUDIENCE: ${appProfile.audience || 'General'}`);
    contextParts.push(`PROBLEM SOLVED: ${appProfile.problem || 'Unknown'}`);
    contextParts.push(`DIFFERENTIATOR: ${appProfile.differentiator || 'Unknown'}`);
    contextParts.push(`CATEGORY: ${appProfile.category || 'general'}`);
  }
  if (research?.nicheInsights) {
    if (research.nicheInsights.topHookPatterns) {
      contextParts.push(`TOP HOOK PATTERNS IN NICHE: ${JSON.stringify(research.nicheInsights.topHookPatterns)}`);
    }
    if (research.nicheInsights.gapOpportunities) {
      contextParts.push(`GAP OPPORTUNITIES: ${JSON.stringify(research.nicheInsights.gapOpportunities)}`);
    }
  }

  const userPrompt = `Generate a complete TikTok slideshow concept for this topic:

TOPIC: ${topic}
${contentType ? `CONTENT TYPE: ${contentType}` : ''}

${contextParts.length > 0 ? 'CONTEXT:\n' + contextParts.join('\n') : ''}

Return a JSON object with:
{
  "angle": "the creative angle/approach for this slideshow",
  "hook": "the hook text for slide 1 (4-6 words, reaction-style, use \\n for line breaks)",
  "contentType": "relationships | self-improvement | ai-productivity | dream-life | other",
  "lightingMood": "the lighting mood for all 6 slides",
  "slides": [
    {
      "slideNumber": 1,
      "text": "overlay text for this slide (use \\n for line breaks, 4-6 words per line)",
      "visualDirection": "what the image should show (scene, subject, mood)",
      "imagePrompt": "complete image generation prompt ready for gpt-image-1"
    }
  ],
  "cta": "the call-to-action text for slide 6",
  "caption": "storytelling caption for the post (3-5 sentences, first line is the hook)",
  "reasoning": "why this concept should perform well"
}

Generate exactly 6 slides following the formula: Hook → Setup → Turn → Reveal 1 → Reveal 2 → CTA.
Make every image prompt specific and cinematic. Each prompt must include lighting, composition, and subject details.`;

  const completion = await client.chat.completions.create({
    model: config.openai.chatModel,
    messages: [
      { role: 'system', content: CREATIVE_DIRECTIVE },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9,
  });

  const concept = JSON.parse(completion.choices[0].message.content);
  return concept;
}

// ─── HOOK GENERATION ──────────────────────────────────────────────────────────

export async function generateHookConcepts({ count = 10, appProfile, research, topHooks, droppedHooks, category }) {
  const client = getClient();

  const contextParts = [];
  if (appProfile?.name) {
    contextParts.push(`APP: ${appProfile.name} — ${appProfile.description || ''}`);
    contextParts.push(`AUDIENCE: ${appProfile.audience || 'General'}`);
    contextParts.push(`CATEGORY: ${appProfile.category || 'general'}`);
    contextParts.push(`PROBLEM: ${appProfile.problem || 'Unknown'}`);
  }
  if (topHooks?.length > 0) {
    contextParts.push(`TOP PERFORMING HOOKS:\n${topHooks.map(h => `- "${h.text}" — ${h.views} views`).join('\n')}`);
  }
  if (droppedHooks?.length > 0) {
    contextParts.push(`DROPPED HOOKS (AVOID THESE):\n${droppedHooks.map(h => `- "${h}"`).join('\n')}`);
  }
  if (research?.nicheInsights?.topHookPatterns) {
    contextParts.push(`NICHE HOOK PATTERNS: ${JSON.stringify(research.nicheInsights.topHookPatterns)}`);
  }
  if (research?.nicheInsights?.gapOpportunities) {
    contextParts.push(`GAP OPPORTUNITIES: ${JSON.stringify(research.nicheInsights.gapOpportunities)}`);
  }

  const userPrompt = `Generate ${count} TikTok slideshow hook concepts.
${category ? `FOCUS ON THIS STYLE: ${category}` : 'Mix different hook styles: person+conflict, POV, listicle, before/after, mistakes, tutorial.'}

${contextParts.join('\n\n')}

Return a JSON object with:
{
  "hooks": [
    {
      "slide1Text": "the hook text with \\n line breaks (4-6 words per line)",
      "slideFlow": "brief description of the 6-slide story arc",
      "category": "person-conflict | pov | listicle | tutorial | before-after | mistakes",
      "contentType": "relationships | self-improvement | ai-productivity | dream-life",
      "suggestedCaption": "storytelling caption (3-5 sentences)",
      "visualMood": "brief visual direction for the whole slideshow",
      "lightingMood": "the lighting mood"
    }
  ]
}

Each hook must:
- Be a REACTION, not a label ("Wait... this actually works??" not "Product Demo")
- Create curiosity, emotional tension, or aspiration
- Be readable in under 1 second
- Feel native to TikTok (not corporate, not generic)`;

  const completion = await client.chat.completions.create({
    model: config.openai.chatModel,
    messages: [
      { role: 'system', content: CREATIVE_DIRECTIVE },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.95,
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return parsed.hooks || parsed;
}

// ─── PERFORMANCE JUDGING ──────────────────────────────────────────────────────

export async function judgeSlideshowPerformance({ postData, concept }) {
  const client = getClient();

  const userPrompt = `Analyze this TikTok slideshow post's performance:

POST DATA:
- Views: ${postData.views || 0}
- Likes: ${postData.likes || 0}
- Comments: ${postData.comments || 0}
- Shares: ${postData.shares || 0}
- Engagement rate: ${postData.engagementRate || 'N/A'}

${concept ? `ORIGINAL CONCEPT:
- Hook: "${concept.hook || 'Unknown'}"
- Angle: ${concept.angle || 'Unknown'}
- Content type: ${concept.contentType || 'Unknown'}
- Lighting: ${concept.lightingMood || 'Unknown'}` : ''}

Return a JSON object with:
{
  "diagnosis": "SCALE | FIX_CTA | FIX_HOOKS | FIX_CONTENT | FULL_RESET",
  "scores": {
    "hookStrength": 1-10,
    "imageStopPower": 1-10,
    "textReadability": 1-10,
    "topicMarketFit": 1-10,
    "ctaStrength": 1-10
  },
  "analysis": "2-3 sentence analysis of what worked and what didn't",
  "nextActions": ["array of specific action items"],
  "keepElements": ["what to keep from this post"],
  "changeElements": ["what to change for next post"]
}`;

  const completion = await client.chat.completions.create({
    model: config.openai.chatModel,
    messages: [
      { role: 'system', content: PERFORMANCE_DIRECTIVE },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5,
  });

  return JSON.parse(completion.choices[0].message.content);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function loadAppProfile() {
  const path = resolve(config.root, 'tiktok-marketing', 'app-profile.json');
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

export function loadResearch() {
  const path = resolve(config.root, 'tiktok-marketing', 'competitor-research.json');
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

export default { generateSlideshowConcept, generateHookConcepts, judgeSlideshowPerformance, loadAppProfile, loadResearch };

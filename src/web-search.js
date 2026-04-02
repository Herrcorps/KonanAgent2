import OpenAI from 'openai';
import config from './config.js';

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: config.openai.apiKey });
  return openai;
}

// ─── RAW WEB SEARCH ───────────────────────────────────────────────────────────
// Uses OpenAI Responses API with web_search_preview tool.
// No extra API key needed — uses same OPENAI_API_KEY.

export async function webSearch({ query, instructions }) {
  const client = getClient();

  const response = await client.responses.create({
    model: config.openai.chatModel,
    tools: [{ type: 'web_search_preview' }],
    input: instructions
      ? [
          { role: 'system', content: instructions },
          { role: 'user', content: query },
        ]
      : query,
  });

  // Extract text output from the response
  const textOutput = response.output.find(item => item.type === 'message');
  const text = textOutput?.content?.map(c => c.text).join('\n') || '';

  return { text, raw: response };
}

// ─── TREND SEARCH ─────────────────────────────────────────────────────────────

export async function searchTrends({ niche, platform = 'TikTok' }) {
  const queries = [
    `${platform} trending content ${niche} 2026 what's going viral`,
    `best performing ${platform} slideshow ${niche} hooks and formats`,
    `${platform} ${niche} niche trending sounds and music`,
  ];

  const results = [];
  for (const query of queries) {
    console.log(`  [WebSearch] Searching: "${query.slice(0, 60)}..."`);
    const result = await webSearch({
      query,
      instructions: `You are a social media research assistant. Search the web and return a structured analysis of what you find. Focus on specific, actionable insights about trending content, hooks, formats, and sounds. Be detailed and cite specific examples where possible.`,
    });
    results.push({ query, analysis: result.text });
  }

  return results;
}

// ─── COMPETITOR SEARCH ────────────────────────────────────────────────────────

export async function searchCompetitors({ niche, platform = 'TikTok', count = 5 }) {
  console.log(`  [WebSearch] Searching for top ${niche} creators on ${platform}...`);

  const result = await webSearch({
    query: `Top ${count} ${platform} creators and accounts in the ${niche} niche 2026. Who are the biggest accounts? What content format do they use? What hooks get the most views? How often do they post?`,
    instructions: `You are a social media competitive analyst. Search the web and return a detailed analysis of the top creators in this niche. For each creator, provide: account name, approximate follower count, content style, posting frequency, and their best-performing content patterns. Return factual, specific information.`,
  });

  return result.text;
}

// ─── FULL NICHE RESEARCH ──────────────────────────────────────────────────────
// Orchestrator: runs multiple searches, then synthesizes into structured format.

export async function researchNiche({ niche, appProfile }) {
  console.log(`\n[WebSearch] Researching the "${niche}" niche...\n`);

  // Run searches
  const trends = await searchTrends({ niche });
  const competitors = await searchCompetitors({ niche });

  // Synthesize all research into structured format
  console.log(`\n  [WebSearch] Synthesizing research...\n`);
  const client = getClient();

  const synthesisPrompt = `Based on the following web research about the "${niche}" niche on TikTok and Instagram, create a structured analysis.

APP CONTEXT:
${appProfile?.name ? `- App: ${appProfile.name} — ${appProfile.description || ''}` : 'No app profile yet'}
${appProfile?.audience ? `- Target audience: ${appProfile.audience}` : ''}

TREND RESEARCH:
${trends.map(t => `Query: ${t.query}\nFindings: ${t.analysis}`).join('\n\n')}

COMPETITOR RESEARCH:
${competitors}

Return a JSON object with:
{
  "trendingSounds": ["array of trending sound/music types in this niche"],
  "commonFormats": ["array of most used content formats"],
  "topHookPatterns": ["array of recurring hook patterns that get high views"],
  "gapOpportunities": ["array of what competitors aren't doing that could work"],
  "avoidPatterns": ["array of what's clearly not working"],
  "recommendedHooks": ["5 hook ideas tailored to the app/business"],
  "topCreators": [
    {
      "name": "account name",
      "followers": "approximate count",
      "style": "content style description",
      "bestHook": "their best performing hook"
    }
  ],
  "keyInsights": "2-3 sentence summary of the most important findings"
}`;

  const completion = await client.chat.completions.create({
    model: config.openai.chatModel,
    messages: [{ role: 'user', content: synthesisPrompt }],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(completion.choices[0].message.content);
}

export default { webSearch, searchTrends, searchCompetitors, researchNiche };

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import config from './config.js';

const HOOKS_PATH = resolve(config.root, 'tiktok-marketing', 'hook-performance.json');

function ensureDir() {
  const dir = dirname(HOOKS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  if (!existsSync(HOOKS_PATH)) return { hooks: [], ctas: [], rules: { doubleDown: [], testing: [], dropped: [] } };
  try { return JSON.parse(readFileSync(HOOKS_PATH, 'utf-8')); } catch { return { hooks: [], ctas: [], rules: { doubleDown: [], testing: [], dropped: [] } }; }
}

function save(data) {
  ensureDir();
  writeFileSync(HOOKS_PATH, JSON.stringify(data, null, 2));
}

export function recordPost({ postId, hook, cta, date, views = 0, likes = 0, comments = 0, shares = 0 }) {
  const data = load();
  const existing = data.hooks.find((h) => h.postId === postId);
  if (existing) {
    Object.assign(existing, { views, likes, comments, shares, lastChecked: new Date().toISOString().split('T')[0] });
  } else {
    data.hooks.push({ postId, text: hook, cta: cta || '', date: date || new Date().toISOString().split('T')[0], views, likes, comments, shares, lastChecked: new Date().toISOString().split('T')[0] });
  }
  if (cta) {
    const ctaEntry = data.ctas.find((c) => c.text === cta);
    if (ctaEntry) { ctaEntry.timesUsed += 1; ctaEntry.totalViews += views; }
    else data.ctas.push({ text: cta, timesUsed: 1, totalViews: views });
  }
  save(data);
  return data;
}

export function getTopHooks(n = 5) {
  const data = load();
  return data.hooks.filter((h) => h.views > 0).sort((a, b) => b.views - a.views).slice(0, n);
}

export function getDroppedHooks() {
  return load().rules.dropped || [];
}

export function applyDecisionRules() {
  const data = load();
  const doubleDown = [], testing = [], dropped = [];
  const hooksByText = {};
  for (const h of data.hooks) {
    const key = h.text || '';
    if (!hooksByText[key]) hooksByText[key] = [];
    hooksByText[key].push(h);
  }
  for (const [text, entries] of Object.entries(hooksByText)) {
    const maxViews = Math.max(...entries.map((e) => e.views || 0));
    const lowCount = entries.filter((e) => (e.views || 0) < 1000).length;
    if (maxViews >= 50000) doubleDown.push(text);
    else if (maxViews >= 1000) testing.push(text);
    else if (lowCount >= 2) dropped.push(text);
    else testing.push(text);
  }
  data.rules = { doubleDown, testing, dropped };
  save(data);
  return data.rules;
}

export function getAll() { return load(); }

export default { recordPost, getTopHooks, getDroppedHooks, applyDecisionRules, getAll };

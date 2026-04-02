import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import config from './config.js';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const requestTimestamps = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const now = Date.now();
  // Remove timestamps older than 1 hour
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_LIMIT) {
    const waitUntil = requestTimestamps[0] + RATE_WINDOW_MS;
    const waitMs = waitUntil - now + 1000; // +1s buffer
    console.log(`[Postiz] Rate limit reached (${RATE_LIMIT}/hr). Waiting ${Math.ceil(waitMs / 1000)}s...`);
    await sleep(waitMs);
    return waitForRateLimit(); // Re-check after waiting
  }
  requestTimestamps.push(Date.now());
}

async function request(method, path, body, isFormData = false) {
  await waitForRateLimit();

  const url = `${config.postiz.apiUrl}${path}`;
  const headers = {
    Authorization: `Bearer ${config.postiz.apiKey}`,
  };
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const opts = { method, headers };
  if (body) {
    opts.body = isFormData ? body : JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  if (res.status === 429) {
    console.warn('[Postiz] 429 rate limited — waiting 120s before retry...');
    await sleep(120_000);
    return request(method, path, body, isFormData);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Postiz ${method} ${path} failed (${res.status}): ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

// --- Public API ---

export async function listIntegrations() {
  return request('GET', '/integrations');
}

export async function uploadFile(filePath) {
  const fileBuffer = readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  const form = new FormData();
  form.append('file', blob, basename(filePath));
  return request('POST', '/upload', form, true);
}

export async function createPost(payload) {
  return request('POST', '/posts', payload);
}

export async function listPosts(startDate, endDate) {
  let path = '/posts';
  const params = [];
  if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
  if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
  if (params.length > 0) path += `?${params.join('&')}`;
  return request('GET', path);
}

export async function deletePost(id) {
  return request('DELETE', `/posts/${id}`);
}

export async function getPostAnalytics(postId) {
  return request('GET', `/analytics/post/${postId}`);
}

export async function getPlatformAnalytics(integrationId, days = 7) {
  return request('GET', `/analytics/${integrationId}?days=${days}`);
}

export async function getPostMissing(postId) {
  return request('GET', `/posts/${postId}/missing`);
}

export async function setReleaseId(postId, releaseId) {
  return request('PUT', `/posts/${postId}/release-id`, { releaseId });
}

export default {
  listIntegrations,
  uploadFile,
  createPost,
  listPosts,
  deletePost,
  getPostAnalytics,
  getPlatformAnalytics,
  getPostMissing,
  setReleaseId,
};

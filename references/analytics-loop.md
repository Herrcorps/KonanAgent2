# Analytics Feedback Loop

## Overview
The daily feedback loop is what makes KonanAgent2 self-improving. It pulls data, diagnoses what's working, and suggests what to do next.

## Data Sources

### Postiz Analytics API
- **Platform analytics:** `GET /analytics/{integrationId}?days=N`
  - Returns: followers, total views, engagement over time
- **Post analytics:** `GET /analytics/post/{postId}`
  - Returns: views, likes, comments, shares for a specific post
- **Rate limit:** 30 requests/hour

### TikTok Release ID Connection
Posts created via Postiz need to be connected to TikTok video IDs for per-post analytics.

1. `GET /posts/{id}/missing` — lists all TikTok videos not yet connected
2. `PUT /posts/{id}/release-id` — connects a post to a TikTok video ID
3. **Wait 2+ hours** after publishing before connecting (TikTok indexing delay)
4. **Cannot be overwritten** — once connected, it's permanent

### Matching Logic
- TikTok video IDs are sequential integers (higher = newer)
- Sort both Postiz posts and TikTok IDs chronologically
- Match oldest post → lowest unconnected ID

---

## Diagnostic Framework

| Views | Engagement | Diagnosis | Action |
|-------|-----------|-----------|--------|
| High  | High      | SCALE     | Make 3 variations immediately. Test posting times. |
| High  | Low       | FIX_CTA   | Hook works, content/CTA doesn't. Test new CTAs on slide 6. |
| Low   | High      | FIX_HOOKS | Content is great, not enough reach. Test new hook styles. |
| Low   | Low       | FULL_RESET| Nothing working. New format, audience, hook categories. |

### Thresholds (configurable)
- **High views:** >= 1,000 (adjust based on account size)
- **High engagement:** >= 5% ((likes + comments + shares) / views)

---

## Decision Rules for Hooks

| Views | Action |
|-------|--------|
| 50K+  | DOUBLE DOWN — make 3 variations immediately |
| 10K-50K | Good — keep in rotation |
| 1K-10K | Try 1 more variation |
| <1K twice | DROP — try something radically different |

---

## CTA Rotation
When views are good but engagement is low, cycle through:
1. "Download [App] — link in bio"
2. "[App] is free to try — link in bio"
3. "I used [App] for this — link in bio"
4. "Search [App] on the App Store"
5. No explicit CTA (just app name visible)

Track which CTAs convert best per hook category.

---

## Daily Report Schedule

| Time | Job | Script |
|------|-----|--------|
| 7:00 AM | Daily analytics report | `daily-report.js --days 3` |
| 8:00 AM | Connect release IDs + fetch analytics | `check-analytics.js --days 3 --connect` |
| 9:00 AM Mon | Competitor research reminder | Discord notification |
| 10:00 AM M/W/F | Generate new hooks | `generate-hooks.js --count 10` |

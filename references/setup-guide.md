# KonanAgent2 — Setup Guide (Non-Technical)

This guide walks you through setting up KonanAgent2 step by step. No coding experience needed.

---

## Step 1: Connect to Your Server

Your server (droplet) is already running. You need to connect to it.

**On Mac:**
Open Terminal (search "Terminal" in Spotlight) and type:
```
ssh root@YOUR_DROPLET_IP
```

**On Windows:**
Download and open PuTTY, enter your droplet IP, and click Connect.

You'll be asked for a password — use the one from DigitalOcean.

---

## Step 2: Run the Setup Script

Once connected, run:
```
cd KonanAgent2
bash setup.sh
```

This installs everything automatically. Wait for it to finish (2-3 minutes).

---

## Step 3: Get Your API Keys

You need 3 accounts. Here's how to get each key:

### 3a. Postiz (for posting to TikTok + Instagram)
1. Go to https://postiz.com and create an account
2. Click **Integrations** → **Add TikTok** → authorize your TikTok account
3. (Optional) Add Instagram the same way
4. Go to **Settings** → **API** → copy your API key
5. Note the **Integration IDs** — you'll see them in the URL when you click each integration

### 3b. OpenAI (for generating images)
1. Go to https://platform.openai.com/api-keys
2. Click **Create new secret key**
3. Copy the key (starts with `sk-`)
4. Add payment: https://platform.openai.com/settings/organization/billing
   - Image generation costs ~$0.04-0.08 per image
   - A 6-slide post costs ~$0.25-0.50

### 3c. Discord Webhook (for notifications)
1. Open Discord on your computer
2. Go to your server → **Server Settings** → **Integrations** → **Webhooks**
3. Click **New Webhook**
4. Name it "KonanAgent2"
5. Choose which channel it posts to
6. Click **Copy Webhook URL**

---

## Step 4: Fill in Your .env File

On your server, run:
```
nano .env
```

Replace each `your-...` placeholder with your actual keys:
```
POSTIZ_API_KEY=paste-your-postiz-key-here
OPENAI_API_KEY=sk-paste-your-openai-key-here
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/paste-your-webhook-url
TIKTOK_INTEGRATION_ID=paste-your-tiktok-integration-id
INSTAGRAM_INTEGRATION_ID=paste-your-ig-integration-id
TIMEZONE=America/New_York
```

Save: Press `Ctrl+O`, then `Enter`, then `Ctrl+X` to exit.

---

## Step 5: Run Onboarding

```
npm run onboard
```

This walks you through:
- Describing your app/business
- Choosing image generation settings
- Testing all connections

To just check if everything is configured correctly:
```
npm run onboard -- --validate
```

---

## Step 6: Create Your First Slideshow

### Generate images:
```
npm run generate -- --topic "your topic here"
```
This takes 3-9 minutes (generating 6 AI images).

### Add text overlays:
Create a file called `texts.json` with your slide text:
```json
[
  "I showed my landlord\nwhat AI thinks our\nkitchen should look like",
  "She said you can't\nchange anything\nchallenge accepted",
  "So I downloaded\nthis app and\ntook one photo",
  "Wait... is this\nactually the same\nkitchen??",
  "Okay I'm literally\nobsessed with\nthis one",
  "App name showed me\nwhat's possible\nlink in bio"
]
```

Then run:
```
npm run overlay -- --dir tiktok-marketing/posts/YOUR-POST-DIR --texts texts.json
```

### Post to TikTok as draft:
```
npm run post:tiktok -- --dir tiktok-marketing/posts/YOUR-POST-DIR --caption "Your caption here"
```

### Or run the full pipeline in one command:
```
npm run pipeline -- --topic "your topic" --caption "your caption" --texts texts.json
```

---

## Step 7: Publish on TikTok

1. Open TikTok on your phone
2. Go to your inbox/drafts
3. **Add a trending sound** (this is CRITICAL for reach)
4. Publish!

---

## Step 8: Start the Scheduler

To run daily reports and analytics automatically:
```
npm run schedule
```

This runs in the background and:
- Sends you a daily analytics report at 7:00 AM
- Connects TikTok analytics at 8:00 AM
- Reminds you to check competitors on Mondays
- Generates new hook ideas Mon/Wed/Fri

To keep it running after you disconnect:
```
nohup npm run schedule > scheduler.log 2>&1 &
```

---

## Common Commands

| What | Command |
|------|---------|
| Generate slides | `npm run generate -- --topic "topic"` |
| Add text overlays | `npm run overlay -- --dir <dir> --texts texts.json` |
| Post to TikTok | `npm run post:tiktok -- --dir <dir> --caption "caption"` |
| Post to Instagram | `npm run post:ig -- --dir <dir> --caption "caption"` |
| Full pipeline | `npm run pipeline -- --topic "topic" --caption "caption"` |
| Check analytics | `npm run analytics -- --days 3 --connect` |
| Daily report | `npm run report -- --days 3` |
| Research competitors | `npm run research` |
| Generate hooks | `npm run hooks -- --count 10` |
| Validate config | `npm run onboard -- --validate` |
| Start scheduler | `npm run schedule` |

---

## Troubleshooting

**"Missing required environment variables"**
→ Run `nano .env` and make sure all keys are filled in. No quotes needed.

**"Postiz API failed"**
→ Check your Postiz API key. Go to https://app.postiz.com → Settings → API.

**"spawnSync ETIMEDOUT"**
→ Image generation takes 3-9 minutes. This is normal. Try again.

**"No slide images found"**
→ Make sure you're pointing --dir to the right folder inside tiktok-marketing/posts/

**Discord not working**
→ Check your webhook URL. Test it: `curl -X POST YOUR_WEBHOOK_URL -H "Content-Type: application/json" -d '{"content":"test"}'`

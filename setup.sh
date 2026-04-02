#!/usr/bin/env bash
set -euo pipefail

echo "============================================"
echo "  KonanAgent2 — Droplet Setup"
echo "============================================"
echo ""

# 1. Install system dependencies for node-canvas
echo "→ Installing system libraries for node-canvas..."
sudo apt-get update -qq
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev pkg-config

# 2. Check Node.js version
echo ""
echo "→ Checking Node.js..."
if ! command -v node &> /dev/null; then
  echo "  Node.js not found. Installing Node 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  Node.js version too old ($(node -v)). Installing Node 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "  Node.js $(node -v) ✓"
  fi
fi

# 3. Install npm dependencies
echo ""
echo "→ Installing npm dependencies..."
npm install

# 4. Create data directories
echo ""
echo "→ Creating data directories..."
mkdir -p tiktok-marketing/posts
mkdir -p tiktok-marketing/reports

# 5. Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
  echo "→ Creating .env from .env.example..."
  cp .env.example .env
  echo "  ⚠ You need to edit .env and fill in your API keys!"
else
  echo "→ .env already exists, skipping."
fi

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit your .env file with your API keys:"
echo "     nano .env"
echo ""
echo "  2. You'll need these accounts:"
echo "     • Postiz  → https://postiz.com (connect TikTok + Instagram)"
echo "     • OpenAI  → https://platform.openai.com (for image generation)"
echo "     • Discord → Create a webhook in your server"
echo ""
echo "  3. Run the onboarding wizard:"
echo "     npm run onboard"
echo ""

# Space Tracker — Deployment Instructions

## Prerequisites
- Node.js 18+ installed (check: node --version)
- Vercel CLI installed (check: vercel --version)
- An Anthropic API key from console.anthropic.com
- A Vercel account (free tier is fine — vercel.com)

If you don't have the Vercel CLI:
  npm install -g vercel

---

## Step 1 — Navigate to Your Project

Open Terminal and run:

  cd "/Users/jared/Downloads/Claude Projects/space-tracker"

Confirm you're in the right place:

  ls

You should see: src/ api/ package.json vite.config.ts index.html

---

## Step 2 — Install Dependencies (if not already done)

  npm install

This installs everything in package.json including yahoo-finance2,
zustand, react-router-dom, and all other dependencies. Takes 1-2 minutes.

---

## Step 3 — Copy CLAUDE.md Into Your Project

You downloaded CLAUDE.md from this conversation. Move it into your
project root (same folder as package.json):

  cp ~/Downloads/CLAUDE.md "/Users/jared/Downloads/Claude Projects/space-tracker/CLAUDE.md"

Or just drag it there in Finder.

---

## Step 4 — Test Locally First (Optional but Recommended)

  npm run dev

This starts the dev server at http://localhost:5173
Open that in your browser and confirm the PriceTable is rendering.
Ctrl+C to stop it when done.

---

## Step 5 — Deploy to Vercel

From inside your project folder:

  vercel

First time running this, Vercel will ask you a series of questions.
Answer them like this:

  Set up and deploy? → Y
  Which scope? → your personal account (your name or email)
  Link to existing project? → N (it's new)
  What's your project name? → space-tracker (or press Enter for default)
  In which directory is your code? → ./ (press Enter)
  Want to modify settings? → N

Vercel will build and deploy. It takes about 60 seconds.
At the end it gives you a URL like: https://space-tracker-abc123.vercel.app
That's your live site.

---

## Step 6 — Add Your Anthropic API Key

This is the most important step — without it the "Run Analysis"
button won't work.

1. Go to vercel.com and log in
2. Click your project (space-tracker)
3. Click Settings in the top nav
4. Click Environment Variables in the left sidebar
5. Click Add New
6. Name:  ANTHROPIC_API_KEY
   Value: your key from console.anthropic.com (starts with sk-ant-)
   Environment: check Production, Preview, AND Development
7. Click Save

Then redeploy so the key takes effect:

  vercel --prod

---

## Step 7 — Your Live URL

After step 6 you'll have a permanent production URL:
  https://space-tracker-[your-name].vercel.app

Vercel also gives you a custom domain option if you want something
cleaner — you can set that in the Domains section of your project settings.

---

## Future Deploys

Every time you make changes and want to push them live:

  cd "/Users/jared/Downloads/Claude Projects/space-tracker"
  vercel --prod

That's it. One command redeploys.

---

## Recommended: Put the Project on GitHub

Right now the code only lives on your local machine. If something
happens to your laptop, it's gone. Takes 5 minutes to back it up:

1. Go to github.com → New Repository → name it space-tracker → Private
2. In your terminal:

  cd "/Users/jared/Downloads/Claude Projects/space-tracker"
  git init
  git add .
  git commit -m "initial commit"
  git remote add origin https://github.com/YOUR_USERNAME/space-tracker.git
  git push -u origin main

3. In Vercel dashboard → your project → Settings → Git
   Connect to your GitHub repo.

After that, every git push automatically triggers a Vercel redeploy.
That's the professional workflow — edit in VS Code, push to GitHub,
Vercel deploys automatically.

---

## Environment Variables Reference

Required:
  ANTHROPIC_API_KEY     sk-ant-...   (from console.anthropic.com)

Not required (Yahoo Finance uses no API key):
  yahoo-finance2 npm package handles prices with no credentials

For Stage 2 (not needed yet):
  SUPABASE_URL          from your Supabase project settings
  SUPABASE_ANON_KEY     from your Supabase project settings

---

## Troubleshooting

"command not found: vercel"
  → Run: npm install -g vercel

"Error: Cannot find module yahoo-finance2"
  → Run: npm install (from inside the project folder)

Prices not loading on the live site
  → Check Vercel Function logs: vercel.com → project → Functions tab
  → Yahoo Finance occasionally rate-limits — wait a minute and retry

Analysis button does nothing / returns error
  → Confirm ANTHROPIC_API_KEY is set in Vercel Environment Variables
  → Confirm you redeployed after adding the key (vercel --prod)

"Too many requests" error on analysis
  → The rate limiter (10 calls/IP/hour) is working correctly
  → Wait an hour or temporarily raise the limit in api/analyze.ts

Build fails on deploy
  → Run npm run build locally first to catch TypeScript errors
  → Fix any errors it shows, then redeploy

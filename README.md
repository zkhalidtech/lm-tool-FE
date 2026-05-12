# LM Tool — LVRG Lead Magnet Engine

Internal tool for building AI-generated prospect websites and automated outreach.

## What it does

1. Paste a domain (e.g. `barkamon.com`)
2. Engine gathers intel via Firecrawl
3. Claude generates a custom 2-page website for that prospect
4. Site deploys to GitHub Pages automatically
5. Outreach email drafted and pushed to Instantly campaign

---

## Local Setup

### Requirements

- Node.js >= 20.9
- Python >= 3.10
- A Google account with access to the LVRG Google Workspace

### 1. Clone the repo

```bash
git clone https://github.com/joshclifford/lm-tool
cd lm-tool
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install Python engine dependencies

```bash
cd engine
pip install -r requirements.txt
cd ..
```

### 4. Set up environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://fwcdiqfsjtwtlmekjqir.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # get from Josh
ANTHROPIC_API_KEY=                   # get from Josh (rotate first)
INSTANTLY_API_KEY=                   # get from Josh (rotate first)
GITHUB_TOKEN=                        # your own GitHub PAT with repo scope
ENGINE_PATH=./engine
```

> **Note:** Never commit `.env.local` — it's gitignored.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign in with your LVRG Google account.

---

## Engine

The Python engine lives in `/engine`. You can also run it standalone from the command line:

```bash
cd engine

# Single domain
python run_engine.py barkamon.com

# Batch (one domain per line in a .txt file)
python run_engine.py --file prospects.txt
```

Output is saved to:
- `engine/output/sites/{domain}/index.html` — generated site
- `engine/output/emails/{domain}.json` — outreach email
- `engine/output/intel/{domain}.json` — raw prospect intel

---

## Project Structure

```
lm-tool/
├── app/                  # Next.js app (pages, API routes)
│   ├── auth/             # Login + OAuth callback
│   ├── dashboard/        # Main app pages
│   │   ├── engine/       # Run the pipeline UI
│   │   ├── leads/        # Lead management (V1.1)
│   │   ├── campaigns/    # Campaign tracking (V1.2)
│   │   └── settings/     # Brand settings (coming soon)
│   └── api/engine/       # API route — streams engine output
├── components/           # Shared UI components
├── engine/               # Python pipeline
│   ├── run_engine.py     # Main runner
│   ├── intel.py          # Firecrawl prospect research
│   ├── generator.py      # Claude site + email generator
│   ├── deploy.py         # GitHub Pages deployer
│   └── instantly.py      # Instantly campaign integration
├── lib/supabase/         # Supabase client (browser + server)
└── middleware.ts         # Auth protection
```

---

## Deployment

The app auto-deploys to Railway on every push to `main`.

Live URL: [lm-tool-production.up.railway.app](https://lm-tool-production.up.railway.app)

---

## Questions?

Ask Josh or open an issue in the repo.

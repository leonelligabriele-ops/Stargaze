# Stargaze

Discover films through the cosmos. Stargaze turns a semantic search over ~43.5k TMDB
films into an interactive **constellation graph** — search a title, director, actor or
theme and explore the neighbourhood of related films.

- **Backend** — FastAPI + `sentence-transformers` (BGE embeddings) + NumPy. Semantic /
  fuzzy / director / person search, diversity-aware retrieval, constellation graph
  construction, faceted filters, and live TMDB lookups (providers, trailers).
- **Frontend** — Vite + React + `react-force-graph-2d`. Search, constellation explorer,
  film pages, and a fully client-side (localStorage) profile: watchlist, watched +
  ratings, custom constellations, blocked films, follows, notifications.

```
stargaze/
  backend/    FastAPI app + offline data-build scripts
  frontend/   Vite + React SPA
```

## Run locally

**Backend** (Python 3.12+):

```bash
cd stargaze/backend
python -m venv .venv && . .venv/Scripts/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Needs the data files in backend/data/ (see "Data" below) and a TMDB token.
echo "TMDB_API_KEY=<your-tmdb-v4-token>" > .env.local
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Frontend**:

```bash
cd stargaze/frontend
npm install
npm run dev     # http://localhost:5173 — Vite proxies /api → localhost:8000
```

## Data

The backend loads two files at startup from `backend/data/`:

- `embeddings.npy` (~64 MB) — BGE embeddings for every film
- `index.json` (~62 MB) — film metadata

These are **gitignored** (too large for git). Two ways to get them:

1. **Build them** (one-time, offline; needs a TMDB token and ~50 min):
   ```bash
   cd stargaze/backend
   python build_dataset.py       # fetch ~43.5k films → data/movies.parquet
   python build_embeddings.py    # encode → data/embeddings.npy + data/index.json
   ```
2. **Download** from a GitHub Release (used in production — see below).

## Deploy — Render (API) + Netlify (frontend)

Config lives at the repo root: [`render.yaml`](render.yaml) and
[`netlify.toml`](netlify.toml).

### 1. Publish the data
Create a GitHub Release (e.g. `data-v1`) and upload `embeddings.npy` + `index.json` as
assets. Copy their asset download URLs.

### 2. Backend → Render
- New + → **Blueprint**, point at this repo (`render.yaml` is picked up).
- Set env vars in the dashboard:
  - `TMDB_API_KEY` — your TMDB v4 token
  - `EMBEDDINGS_URL` / `INDEX_URL` — the Release asset URLs from step 1
  - `CORS_ORIGINS` — your Netlify URL, e.g. `https://your-site.netlify.app`
- On first boot the backend downloads the data (`ensure_data()` in `constellation.py`),
  loads the model, and logs `Stargaze ready.` Uses a **2 GB (`standard`) instance** —
  the free 512 MB tier OOMs.

### 3. Frontend → Netlify
- Import the repo; `netlify.toml` sets `base = stargaze/frontend`, build `npm run build`,
  publish `dist`.
- Edit the `/api/*` redirect target in `netlify.toml` to your Render URL. The frontend
  calls a relative `/api`, which Netlify proxies server-side to Render (no CORS).

### Config notes
- Frontend API base: `frontend/src/lib/api.js` → `import.meta.env.VITE_API_BASE || '/api'`.
  Leave unset to use the Netlify proxy, or set `VITE_API_BASE` to call Render directly
  (then `CORS_ORIGINS` must include the Netlify origin).
- Re-embedding the dataset later? Upload the new files to a new Release and update
  `EMBEDDINGS_URL` / `INDEX_URL`.

## Accounts (optional — Supabase)

Accounts let visitors **sign up / log in (email + password)** and have their saved
films, ratings and constellations stored in the cloud and synced across devices. It's
**optional**: with no Supabase env vars the app runs guest-only (localStorage), exactly
as before. The FastAPI backend is not involved — auth + storage are handled by Supabase
directly from the browser.

**Setup:**
1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste [`supabase_schema.sql`](supabase_schema.sql) → **Run** (creates
   the `user_state` table + row-level-security policies).
3. **Authentication → Providers → Email** is on by default. For quick testing you can turn
   off "Confirm email" (Authentication → Providers → Email) so sign-up logs in instantly.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
5. Set two env vars wherever the frontend builds/runs:
   - local dev → `stargaze/frontend/.env.local`:
     ```
     VITE_SUPABASE_URL=https://<project>.supabase.co
     VITE_SUPABASE_ANON_KEY=<anon public key>
     ```
   - Netlify → **Site settings → Environment variables** → add the same two → redeploy.

When set, a **Sign in** button appears in the top bars. The anon key is safe to expose in
the frontend — row-level security is what protects the data. How it works: on login the
app pulls the user's cloud copy (or seeds it from their current guest data on a brand-new
account), then pushes every change up (debounced). Last write wins across devices.

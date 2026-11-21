# Production: Vercel frontend, Render API, Neon database

## Render

Use `render.yaml`, or create a Python web service at the repository root:

- Build: `pip install -r requirements.txt`
- Start: `python backend/run.py`
- Health: `/api/health` (confirm JSON says `database: connected`)
- Python: `3.12.10`; no paid plan or persistent disk is required.

Set these in Render → Environment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Rotated Neon pooled connection string; keep secret |
| `ENVIRONMENT` | `production` |
| `ALLOW_TEST_AUTH` | `false` (production rejects mock tokens regardless) |
| `FIREBASE_PROJECT_ID` | Your exact Firebase project ID |
| `ADMIN_EMAILS` | Existing real administrator allowlist, comma-separated |
| `CORS_ORIGINS` | `https://civic-resolve-lt44aca7u-civic-resolve.vercel.app` |
| `USE_DATA_URL_STORAGE` | `1`; validated images are stored in Neon with their issues |
| `GEMINI_API_KEY` | Optional server-only key; without it heuristic triage remains available |

PostgreSQL URLs are normalized to `postgresql+psycopg2://` to match the
installed `psycopg2-binary` dependency. Never put the database URL in Vercel
frontend variables.

## Vercel

Either set **Root Directory** to `frontend` (build `npm run build`, output
`dist`) or deploy from the repository root using the checked-in `vercel.json`.
Both configurations deploy only `frontend/dist`; FastAPI remains on Render.
Use Node 24.x for the installed Firebase SDK.

The repository's `frontend/.env.production` sets:

- `VITE_API_URL=https://civicresolve-api-66sx.onrender.com`

Set the following in Vercel → Settings → Environment Variables:
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
  and `VITE_FIREBASE_APP_ID`: your existing Firebase web configuration.
- Preserve other existing Firebase web configuration variables.

Redeploy the frontend whenever its build variables change. Add the exact Vercel
production hostname to Firebase Authentication → Settings → Authorized domains.
Enable the existing Google/phone providers in Firebase as appropriate.

The supplied Vercel deployment currently returns `Login – Vercel` to an
unauthenticated request. Disable Vercel Deployment Protection for production or
assign a public production alias before treating that URL as the Firebase/CORS
origin.

## Validation before release

```sh
cd backend
../.figma/make/venv/bin/python -m pytest -q
cd ../frontend
npm run build
```

The automated suite uses an isolated SQLite database, not live Neon records.
Production must additionally pass:

1. `/api/health`: JSON `database: connected`, `database_type: PostgreSQL (Neon)`.
2. Submit a real authenticated issue, then retrieve it from `/api/issues/my`.
3. Upload an image, restart the API, and retrieve the same issue/image again.
4. Verify allowed-origin CORS preflight and rejection of unrelated origins.
5. Confirm mock/wrong-project tokens fail and only verified allowlisted emails
   can use admin endpoints and the live Gemini diagnostic.

No deployment should proceed until those checks and the local suite/build pass.

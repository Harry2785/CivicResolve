# CivicResolve

**AI-Powered Civic Issue Reporting and Resolution Platform**

*Building Better Communities, One Resolution at a Time.*

CivicResolve is an intelligent civic engagement platform designed to streamline citizen issue reporting (potholes, street lighting, waste disposal, water leaks, public safety hazards) and empower municipal operations teams with automated AI triage, categorization, severity scoring, department analytics, and geographic hotspot intelligence.

---

## 🏛️ Architecture & Tech Stack

- **Frontend**: React 19, Vite, Lucide Icons, Leaflet & Recharts (Deployed on Vercel Edge)
- **Backend**: Python 3.9+, FastAPI deployed as a **Vercel Python Serverless Function** (`api/index.py`)
- **Database**: **Neon PostgreSQL** (via SQLAlchemy ORM with serverless connection pooling)
- **AI Engine**: Google Gemini API (`gemini-2.5-flash` via official `google-genai` SDK) with heuristic fallback
- **Authentication**: Firebase Authentication (Google Sign-In & Citizen Phone OTP) with server-side token validation
- **Deployment**: **100% Vercel Serverless**. Render is no longer required.

---

## 📁 Project Structure

```text
CivicResolve/
├── api/
│   └── index.py                     # Vercel Serverless entrypoint (exports ASGI app)
├── vercel.json                      # Root Vercel deployment routing & build config
├── requirements.txt                 # Root Python dependencies for Vercel builder
├── package.json                     # Root orchestrator for Vite frontend build
├── migrate_sqlite_to_postgres.py    # CLI tool to migrate SQLite data to Neon PostgreSQL
├── .env.example                     # Unified environment template
├── .gitignore                       # Clean Git exclusions
├── README.md                        # Documentation and deployment guide
├── backend/
│   ├── api/
│   │   └── index.py                 # Standalone backend Vercel entrypoint
│   ├── app/
│   │   ├── main.py                  # FastAPI application, CORS & router registrations
│   │   ├── database.py              # SQLAlchemy engine (Neon PostgreSQL / SQLite)
│   │   ├── database_seed.py         # Idempotent demo dataset seeder
│   │   ├── core/
│   │   │   ├── config.py            # Environment configuration & DB URL normalizer
│   │   │   ├── auth.py              # Firebase token verifier & admin authorization
│   │   │   └── constants.py         # Municipal categories, priorities, departments
│   │   ├── models/
│   │   │   └── issue.py             # Issue ORM model (PostgreSQL & SQLite compatible)
│   │   ├── routers/
│   │   │   ├── health.py            # Health diagnostics endpoint (GET /api/health)
│   │   │   ├── issues.py            # Issue creation, upload, tracking, feeds
│   │   │   ├── admin.py             # Admin complaint management & re-analysis
│   │   │   └── analytics.py         # Department metrics & geographic hotspots
│   │   └── services/
│   │       ├── ai_service.py        # Gemini 2.5 Flash client & heuristic fallback
│   │       ├── image_service.py     # Image validation & persistent storage adapter
│   │       └── duplicate_service.py # Geospatial & semantic duplicate detector
│   ├── requirements.txt             # Backend dependencies (includes psycopg2-binary)
│   ├── migrate_sqlite_to_postgres.py# Backend copy of migration tool
│   └── tests/                       # Complete pytest suite (28 core + 5 migration tests)
└── frontend/
    ├── package.json                 # React 19 dependencies & Vite scripts
    ├── vite.config.js               # Dev server configuration with /api proxy
    └── src/
        ├── config/
        │   └── api.js               # Centralized API resolver (VITE_API_URL support)
        ├── context/
        │   └── AuthContext.jsx      # Firebase auth provider & role management
        └── components/
            ├── CitizenHome.jsx      # Landing portal & municipal pulse
            ├── ReportIssue.jsx      # Grievance submission with AI triage
            ├── TrackComplaint.jsx   # Citizen complaint tracking & personal history
            ├── IssuesFeed.jsx       # Public civic transparency feed
            ├── AdminPortal.jsx      # Municipal official operations dashboard
            ├── DepartmentAnalytics.jsx# Performance analytics by department
            ├── HotspotIntelligence.jsx# GIS cluster map & predictive hotspot radar
            └── SystemDiagnostics.jsx# Infrastructure portal & real-time health monitor
```

---

## 🐘 Neon PostgreSQL Setup

CivicResolve uses **Neon Serverless PostgreSQL** for persistent, scalable cloud storage.

### 1. Create a Neon Project
1. Go to the [Neon Console](https://console.neon.tech/) and create a free account.
2. Click **Create Project** &rarr; Name it `civicresolve` (e.g. region `US East (Ohio)` or closest to your users).
3. Under **Dashboard &rarr; Connection Details**:
   - Select **Pooled connection** (recommended for serverless functions).
   - Copy the PostgreSQL connection string. It looks like:
     ```text
     postgresql://user:password@ep-cool-fog-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```

### 2. Auto-Initialization
When deployed or started with `DATABASE_URL` set, CivicResolve automatically runs `Base.metadata.create_all()` and idempotent schema checks on startup. Tables, indexes, and constraints are initialized safely without any manual SQL scripts required.

### 3. Migrate Existing SQLite Data to Neon
If you have complaints in your local `civicresolve.db`, migrate them safely into Neon without data loss:

```powershell
# From project root:
.\backend\venv\Scripts\python.exe migrate_sqlite_to_postgres.py --target-url "postgresql://user:password@ep-cool-fog-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

The script will:
- Connect to SQLite and read existing records.
- Create all tables and indexes in Neon.
- Transfer each complaint, preventing duplicates.
- Synchronize PostgreSQL's auto-increment primary key sequence (`issues_id_seq`).

---

## ⚡ Vercel Deployment Instructions

CivicResolve is architected to deploy entirely to Vercel as a unified application.

### Step 1: Push Code to GitHub
Ensure all code (including `api/index.py`, `vercel.json`, and `requirements.txt`) is committed and pushed to your GitHub repository.

### Step 2: Import into Vercel
1. Log in to [Vercel](https://vercel.com/) and click **Add New &rarr; Project**.
2. Select your `CivicResolve` repository.
3. Leave **Root Directory** as `.` (repository root).
4. Vercel automatically detects the build configuration from `vercel.json`:
   - `api/index.py` &rarr; Built as a Python Serverless Function (`@vercel/python`).
   - `frontend/package.json` &rarr; Built as a Static Single Page App (`dist/`).

### Step 3: Configure Environment Variables in Vercel
In **Project Settings &rarr; Environment Variables**, configure the following:

#### Backend Variables:
| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://user:pass@ep-xyz-pooler.neon.tech/neondb?sslmode=require` | Neon PostgreSQL pooled connection string |
| `GEMINI_API_KEY` | `AIzaSy...` | Google AI Studio API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model selection |
| `ENVIRONMENT` | `production` | Deployment environment flag |
| `ADMIN_EMAILS` | `official1@example.gov.in,admin@civicresolve.gov.in` | Approved municipal admin emails |
| `BLOB_READ_WRITE_TOKEN` | *(Optional)* | Vercel Blob token for image storage (auto-added if Vercel Blob store is attached) |

#### Frontend Variables:
| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | *(Leave empty for unified deployment)* | In unified deployment, `/api` is same-origin. If deploying frontend separately, set to backend domain |
| `VITE_FIREBASE_API_KEY` | `AIzaSy...` | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `civicresolve-4f39e.firebaseapp.com` | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | `civicresolve-4f39e` | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `civicresolve-4f39e.appspot.com` | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `1234567890` | Firebase Sender ID |
| `VITE_FIREBASE_APP_ID` | `1:1234567890:web:abcdef` | Firebase App ID |

### Step 4: Authorize Domain in Firebase
In the [Firebase Console](https://console.firebase.google.com/):
1. Go to **Authentication &rarr; Settings &rarr; Authorized domains**.
2. Add your Vercel deployment domain (e.g. `civicresolve.vercel.app` and `*.vercel.app`).

### Step 5: Click Deploy
Click **Deploy**. Vercel will install dependencies, build the frontend, package the serverless API, and deploy your application.

---

## 💻 Local Development Setup

To run CivicResolve locally:

### 1. Backend:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```
Backend runs at `http://127.0.0.1:8000` with Swagger docs at `http://127.0.0.1:8000/docs`.

### 2. Frontend:
```powershell
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173` and automatically proxies `/api` calls to `http://127.0.0.1:8000`.

---

## 🩺 System Diagnostics & Health Verification

The platform includes a real-time Developer & Infrastructure Portal (`/#/diagnostics`) accessible from the top navigation bar.

It queries `GET /api/health` to report:
- **API Status**: HTTP 200 reachable.
- **Runtime**: Displays `Vercel Serverless` or `ASGI Server`.
- **Database Connectivity**: Connected/Disconnected status with database dialect (`PostgreSQL (Neon)` or `SQLite`).
- **Gemini AI Status**: Configured API key status and model name.
- **Verify Live Gemini Ping**: Interactive button that sends a real generation request to Google Gemini to verify live response without guesswork.

---

## 🔒 Security & Privacy

1. **Zero Client-Side Secret Exposure**: Gemini API keys, Firebase service credentials, and database passwords reside strictly on the serverless backend.
2. **Citizen Ownership & Privacy**: Citizens can only view and track complaints associated with their verified Firebase UID. Unauthenticated users cannot view private complaints.
3. **CORS Hardening**: Strict origin matching ensures only authorized Vercel deployments and localhost can make authenticated requests. Wildcard `*` with credentials is disallowed.
4. **Serverless Connection Safety**: SQLAlchemy uses `NullPool` in serverless environments to prevent connection leaks against Neon's connection pooler.

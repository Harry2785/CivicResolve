# CivicResolve

**AI-Powered Civic Issue Reporting and Resolution Platform**

*Building Better Communities, One Resolution at a Time.*

CivicResolve is an intelligent civic engagement platform designed to streamline citizen issue reporting (potholes, street lighting, waste disposal, water leaks, public safety hazards) and empower municipal operations teams with automated AI triage, categorization, severity scoring, department analytics, and geographic hotspot intelligence.

---

## 🏛️ Architecture & Tech Stack

- **Frontend**: React 19, Vite, Lucide Icons
- **Backend**: Python 3.9+, FastAPI, Uvicorn, Pydantic v2
- **Database**: SQLite (via SQLAlchemy ORM)
- **AI Engine**: Google Gemini API (`google-genai` SDK) handled strictly on the backend
- **Proxy Communication**: Vite dev server proxies `/api` directly to `http://127.0.0.1:8000`

---

## 📁 Project Structure

```text
CivicResolve/
├── .env.example              # Template for root environment variables
├── .gitignore                # Comprehensive exclusions (node_modules, venvs, dbs, secrets)
├── README.md                 # Project documentation and setup guide
├── backend/
│   ├── .env.example          # Backend-specific environment template
│   ├── requirements.txt      # Python dependencies
│   ├── run.py                # Server execution script
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI entrypoint, CORS & route configuration
│   │   ├── database.py       # SQLite connection engine & session provider
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── config.py     # Application settings & environment loader
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── health.py     # System health check endpoint (GET /api/health)
│   └── tests/
│       ├── __init__.py
│       └── test_health.py    # Health endpoint verification tests
└── frontend/
    ├── package.json          # Node dependencies and scripts
    ├── vite.config.js        # Vite build & reverse proxy configuration
    ├── index.html            # HTML entrypoint
    ├── public/               # Static assets
    └── src/
        ├── App.jsx           # Main interface & live health status dashboard
        ├── App.css           # Styling
        ├── index.css         # Global reset & CSS variables
        └── main.jsx          # React DOM root mounting
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.9 or higher

---

### 2. Backend Setup

From the repository root:

```powershell
# Navigate to backend directory
cd backend

# Create virtual environment (if not already created)
python -m venv venv

# Activate virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Windows Command Prompt:
.\venv\Scripts\activate.bat
# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
Copy-Item .env.example .env
# Edit .env and insert your GEMINI_API_KEY if available

# Start the FastAPI backend server
python run.py
```

The backend server will start at:
- **API URL**: `http://127.0.0.1:8000`
- **Interactive OpenAPI Docs**: `http://127.0.0.1:8000/docs`
- **Health Check Endpoint**: `http://127.0.0.1:8000/api/health`

---

### 3. Frontend Setup

In a new terminal window, from the repository root:

```powershell
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Configure Firebase Authentication (Optional but Recommended)
# Copy the example environment file:
Copy-Item .env.example .env.local
# Edit .env.local and insert your Firebase Web App configuration:
# VITE_FIREBASE_API_KEY=AIzaSy...
# VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
# VITE_FIREBASE_PROJECT_ID=your_project
# VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
# VITE_FIREBASE_MESSAGING_SENDER_ID=...
# VITE_FIREBASE_APP_ID=...

# Start Vite development server
npm run dev
```

The frontend development server will launch at:
- **Application URL**: `http://localhost:5173`

The frontend automatically proxies requests to `/api/*` to the FastAPI backend at `http://127.0.0.1:8000`.

---

## 🔐 Firebase Authentication Setup

CivicResolve supports multi-channel authentication for citizens and municipal administrators:
- **Google Sign-In**: 1-click verified Google account authentication with popup.
- **Mobile Phone (OTP)**: SMS verification code delivery via Firebase Authentication with automated reCAPTCHA verification.

### Setup Instructions:
1. Go to [Firebase Console](https://console.firebase.google.com/) &rarr; Select your project.
2. In **Authentication** &rarr; **Sign-in method**:
   - Enable **Google**: Choose support email and click Save.
   - Enable **Phone**: Enable SMS verification and click Save.
   - *(Optional for testing without SMS charges)*: Under **Phone numbers for testing**, register a number (e.g., `+91 9999999999`) and test OTP (`123456`).
3. In **Authentication** &rarr; **Settings** &rarr; **Authorized domains**:
   - Ensure `localhost` and `127.0.0.1` are listed.
4. Copy `frontend/.env.example` to `frontend/.env.local` and paste your web app credentials.
5. Restart the frontend dev server (`npm run dev`).

> **Security Note**: `VITE_FIREBASE_*` variables are client identifiers required by the Firebase Web SDK. Never store Firebase Admin Service Account private keys in frontend files or version control.

---

## 🩺 Health Check Verification

The backend exposes a health endpoint to verify server and database connectivity:

```http
GET /api/health
```

**Sample Response (`200 OK`):**
```json
{
  "status": "healthy",
  "service": "CivicResolve API",
  "version": "1.0.0",
  "environment": "development",
  "database": "connected",
  "gemini_configured": false,
  "timestamp": "2026-11-21T04:18:35.686467+00:00"
}
```

To run the automated backend test:
```powershell
cd backend
.\venv\Scripts\python.exe -c "from tests.test_health import test_api_health_endpoint, test_root_endpoint; test_api_health_endpoint(); test_root_endpoint(); print('Verified!')"
```

---

## 🔒 Security & Best Practices

1. **Zero Secret Exposure**: The Gemini API key is strictly stored in backend `.env` and accessed server-side. It is never bundled into frontend assets or exposed over client headers.
2. **Repository Cleanliness**: Databases (`*.db`), virtual environments (`venv/`), dependencies (`node_modules/`), and uploaded media (`uploads/`) are excluded via `.gitignore` to keep the repository lightweight (< 10 MB).
3. **CORS Protected**: Explicit CORS origins configured for local development (`http://localhost:5173`).

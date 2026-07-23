# RepoGPT 🧠

> **Understand any GitHub repository in minutes with AI.**

RepoGPT is an AI-powered repository understanding platform. Submit any public GitHub URL and get:

- 📊 **Intelligent Repository Summary** — project purpose, tech stack, folder structure, modules, and dependencies
- 💬 **AI Chat Interface** — ask natural language questions about the codebase, get answers with file citations
- 🏗️ **Architecture Diagrams** — auto-generated Mermaid diagrams of the system architecture
- 📝 **Documentation Generator** — AI-written API docs and developer onboarding guides
- 🔍 **RAG-powered Search** — answers grounded in actual code, not hallucinations
- 🕸️ **Knowledge Graph** — entity relationships visualized via Neo4j

Built with **Next.js 15**, **FastAPI**, **Gemini AI**, **Qdrant**, **PostgreSQL**, and **Neo4j**.

---

## 🚀 Deployment

### Live Deployment

| Service | URL |
|---------|-----|
| Frontend | [https://repogpt-nine.vercel.app](https://repogpt-nine.vercel.app) |
| Backend API | [https://repogpt-backend-shf2.onrender.com](https://repogpt-backend-shf2.onrender.com) |
| API Docs | [https://repogpt-backend-shf2.onrender.com/docs](https://repogpt-backend-shf2.onrender.com/docs) |
| Health Check | [https://repogpt-backend-shf2.onrender.com/health](https://repogpt-backend-shf2.onrender.com/health) |

Production wiring:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://repogpt-backend-shf2.onrender.com` |
| `CORS_ORIGINS` | `https://repogpt-nine.vercel.app` |

### Deploy on Render (Backend) + Vercel (Frontend)

#### Step 1 — External Services (Free)

Sign up and get credentials for:

| Service | Free Tier | Get Credentials |
|---------|-----------|----------------|
| **Qdrant Cloud** | 1 GB cluster | [cloud.qdrant.io](https://cloud.qdrant.io) → Create cluster → API Keys |
| **Neo4j Aura** | 200k nodes | [console.neo4j.io](https://console.neo4j.io) → Create free instance |
| **Gemini AI** | 15 RPM free | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **GitHub PAT** | Free | [github.com/settings/tokens](https://github.com/settings/tokens) — scopes: `repo`, `read:org` |

#### Step 2 — Deploy Backend on Render

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New** → **Blueprint** → Connect this GitHub repository
3. Render will auto-detect `render.yaml` and create:
   - A **Web Service** (`repogpt-backend`) running the FastAPI app
   - A **PostgreSQL database** (`repogpt-db`)
4. Set these **Environment Variables** in the Render dashboard:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | Your Gemini API key |
| `GITHUB_TOKEN` | Your GitHub PAT |
| `QDRANT_URL` | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Qdrant Cloud API key |
| `NEO4J_URI` | `neo4j+s://xxxx.databases.neo4j.io` |
| `NEO4J_PASSWORD` | Neo4j Aura password |
| `CORS_ORIGINS` | `https://repogpt-nine.vercel.app` |

5. Click **Deploy** — Render will build the Docker image and run DB migrations automatically.
6. Copy your backend URL: `https://repogpt-backend-shf2.onrender.com`

#### Step 3 — Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com/new)
2. Import this GitHub repository
3. Set **Root Directory** to `frontend`
4. Set this **Environment Variable**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://repogpt-backend-shf2.onrender.com` |

5. Click **Deploy** — Vercel auto-detects Next.js and builds it.
6. Copy your frontend URL and update `CORS_ORIGINS` in Render. The current production frontend is `https://repogpt-nine.vercel.app`.

---

## 🏠 Local Development (Docker)

### Prerequisites
- Docker & Docker Compose
- Gemini API key (free at [aistudio.google.com](https://aistudio.google.com/app/apikey))

### Quick Start

```bash
git clone https://github.com/vamshichethan/RepoGPT.git
cd RepoGPT

# Configure environment
cp .env.example backend/.env
# Edit backend/.env and set OPENAI_API_KEY to your Gemini key

# Start all services
docker compose up --build

# Open the app
open http://localhost:3000
```

---

## 💻 Local Development (Without Docker)

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Copy and configure env
cp ../.env.example .env
# Edit .env — set OPENAI_API_KEY, DATABASE_URL for local Postgres

# Start local infrastructure
docker run -d -p 6333:6333 qdrant/qdrant
docker run -d -p 5432:5432 -e POSTGRES_USER=repogpt -e POSTGRES_PASSWORD=repogpt -e POSTGRES_DB=repogpt postgres:16-alpine
docker run -d -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=none neo4j:5-community

# Run migrations and start server
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
# Open http://localhost:3000
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, TailwindCSS, Shadcn UI |
| Backend | FastAPI, Python 3.12, Uvicorn |
| Database | PostgreSQL 16 (SQLAlchemy async + Alembic) |
| Vector DB | Qdrant (local or Qdrant Cloud) |
| Graph DB | Neo4j (local or Neo4j Aura) |
| AI / LLM | Gemini 3.5 Flash, gemini-embedding-001 |
| RAG | LangChain + custom chunking |
| Git | GitPython |
| Infra | Docker Compose / Render / Vercel |

---

## ✨ Features

### Repository Ingestion
- Validates and clones any public GitHub URL
- Recursively scans files (skips binaries, node_modules, .git, etc.)
- Detects languages, frameworks, databases automatically
- Real-time progress tracking with percentage

### AI Summary
- Project purpose and business objective
- Full tech stack breakdown
- Folder structure visualization
- Major module descriptions with key files
- Key dependencies with purposes

### Architecture Visualization
- Auto-generated Mermaid flowchart diagrams
- Service dependency mapping
- Tech stack breakdown per layer

### Repository Chat (RAG)
- Ask questions in plain English about any codebase
- Streaming responses via Server-Sent Events (SSE)
- Answers cite specific file paths and relevance scores
- Persistent chat sessions with history
- Grounded in actual code — no hallucinations

### Documentation Generator
- AI-written API specification docs
- Developer onboarding guide with setup steps
- Troubleshooting FAQ

### Knowledge Graph
- Extracts entities (Files, Classes, Functions, APIs, Tables)
- Maps relationships between code entities
- Neo4j-powered graph visualization

---

## 📡 API Reference

### Repositories
- `POST /api/repositories` — Submit a GitHub URL for ingestion
- `GET /api/repositories` — List all repositories
- `GET /api/repositories/{id}` — Get repository details
- `GET /api/repositories/{id}/status` — Get ingestion progress
- `GET /api/repositories/{id}/summary` — Get AI summary
- `GET /api/repositories/{id}/architecture` — Get architecture diagram
- `DELETE /api/repositories/{id}` — Delete repository

### Chat
- `POST /api/repositories/{id}/sessions` — Create chat session
- `GET /api/repositories/{id}/sessions` — List sessions
- `GET /api/sessions/{id}/messages` — Get messages
- `POST /api/sessions/{id}/messages` — Send message (SSE stream)

### AI Features
- `GET /api/repositories/{id}/docs` — Generate documentation
- `GET /api/repositories/{id}/interview` — Generate interview questions
- `GET /api/repositories/{id}/graph` — Get knowledge graph
- `GET /api/repositories/{id}/graph/search` — Search the graph

### Health
- `GET /health` — Liveness check

Full interactive API docs: `/docs` (Swagger UI)

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Gemini API key | ✅ Yes |
| `OPENAI_BASE_URL` | Gemini OpenAI-compat endpoint | ✅ Yes |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | ✅ Yes |
| `EMBEDDING_DIM` | `768` | ✅ Yes |
| `CHAT_MODEL` | `gemini-3.5-flash` | ✅ Yes |
| `GITHUB_TOKEN` | GitHub PAT for private repos | Optional |
| `DATABASE_URL` | PostgreSQL async URL | ✅ Yes |
| `QDRANT_URL` | Qdrant server URL | ✅ Yes |
| `QDRANT_API_KEY` | Qdrant Cloud API key | Cloud only |
| `NEO4J_URI` | Neo4j bolt/aura URI | ✅ Yes |
| `NEO4J_USERNAME` | Neo4j username | Optional |
| `NEO4J_PASSWORD` | Neo4j password | Cloud only |
| `CORS_ORIGINS` | Comma-separated allowed origins | ✅ Prod |
| `ENVIRONMENT` | `development` or `production` | Optional |

### Frontend (`frontend/.env.local`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | ✅ Yes |

---

## 📄 License

MIT

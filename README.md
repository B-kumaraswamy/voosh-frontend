
---

# Frontend `README.md`
```markdown
# Voosh — Frontend

## Prerequisites
- Node.js 20+
- Backend running (local `http://localhost:4000` or remote URL)

## Files of interest
- `vite.config.js` — dev server + proxy
- `src/*` — React app
- `.env` — Vite env for API base

---

## Local development
1. Install deps:
```bash
cd frontend
npm install


VITE_API_BASE_URL=http://localhost:4000 

npm run dev
# open http://localhost:5173


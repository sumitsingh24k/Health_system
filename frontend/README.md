# JanSetu Frontend

Next.js dashboard and role-based UI for JanSetu.

**Full-stack map (Next.js vs Python, Mongo collections, every API):** see [`../SYSTEM_ARCHITECTURE.md`](../SYSTEM_ARCHITECTURE.md).

## Environment

Set these values in `.env`:

- `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`
- `NEXTAUTH_URL=http://localhost:3000`
- `NEXTAUTH_SECRET=<secret>`
- `MONGO_URI=<mongo uri>` (still used by auth/session paths)

## Local Run

1. Start backend first:
   - `cd ../backend`
   - `uvicorn app.main:app --reload --port 8000`
2. Start frontend:
   - `cd ../frontend`
   - `npm install`
   - `npm run dev`

Frontend runs on `http://localhost:3000`.

## Backend API Integration

Frontend now calls backend APIs directly:

- `GET /health`
- `GET /api/v1/cases?location=XXXXXX&limit=...`
- `POST /api/v1/cases/asha/text`
- `POST /api/v1/cases/medical-shop/text`
- `POST /api/v1/predictions/outbreak`

### Response handling

For `/api/v1` routes, frontend expects:

```json
{
  "success": true,
  "message": "ok",
  "data": {}
}
```

For error responses, frontend handles:

- `400` request errors
- `422` validation errors
- `503` backend/LLM unavailable

## UX and Theme

- Global color tokens are defined in `globals.css`.
- Shared UI buttons use shadcn-style `components/ui/button.tsx` (`@/components/ui/button`).
- Core pages (`/`, `/login`, `/workspace`, registration flows) use the unified color and button system.

## Notes

- Backend `v1` currently does not expose admin/user management routes (create ASHA, approval queues, worker registry). The UI keeps those flows non-primary while preserving core reporting and prediction workflows.

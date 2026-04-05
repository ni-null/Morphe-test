# Web Console Architecture (Low Coupling)

## Goal
Add a web control panel as an **optional side tool** without changing the core CLI patch flow.

## Components
- `web/`: Vite + React frontend (shadcn-style UI components)
- `web-api/`: Thin API layer that launches existing CLI (`main.js`) as a child process
- Core pipeline remains unchanged in `main.js`, `scripts/*`, `utils/*`

## Coupling Strategy
- Web layer does **not** import internal patch/download modules.
- Web layer only calls the CLI contract (`node main.js ...flags...`).
- Runtime visibility is read from generated artifacts:
  - `output/task-*/task-info.json`
  - `output/task-*/task.log`

## API Endpoints
- `GET /api/health`
- `GET /api/config?path=config.toml`
- `PUT /api/config`
- `GET /api/tasks?limit=50`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `GET /api/tasks/:id/log?tail=300`

## Dev Commands
From project root:
- `node ./main.js --web` : start web-api + web-ui via CLI entry
- `npm run web:api` : start API server (`127.0.0.1:8787`)
- `npm run web:ui` : start Vite dev server (`127.0.0.1:5173`)
- `npm run web:dev` : start both together
- `npm run web:build` : build React frontend

## Future Extension
- Add auth/token for remote deployment (if ever exposed beyond localhost).
- Add SSE/WebSocket if real-time streaming is needed beyond polling.
- Add production static hosting from API for single-port deployment.

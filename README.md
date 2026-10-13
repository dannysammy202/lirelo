The requested file reference is not currently visible. Use files.search or files.list to rediscover the file, then retry with a returned ref_id or file_id.
### Hosted document API routing

Vercel serves the application as static HTML/JS with independently deployed Python functions in `api/`. Do not add a root-level `server.py`, `app.py`, or other auto-detected Python web entrypoint: an earlier local server intercepted `/api/inspect` and caused imports to fail with `Unknown local API endpoint`. The dedicated `/api/inspect` route must return 401 when unauthenticated and document metadata when given a valid Supabase token and an owned book path.

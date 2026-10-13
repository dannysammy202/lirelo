# Lirelo deployment readiness

The current full-function Lirelo app uses a local Python HTTP server, SQLite, and files under `data/books`. The approved frontend also keeps reader annotations in browser localStorage.

Vercel's serverless functions do not provide durable writable filesystem storage. Deploying `server.py` as-is would make imported books, metadata, and annotations unavailable across requests/devices. The app also lacks authentication and user-specific access controls. Do not publish its API on the open internet.

## Source repository

Use a new private GitHub repository. Never commit `data/`, a local SQLite database, any uploaded PDFs/EPUBs, tokens or `.env`. The `.gitignore` in this folder excludes these.

## To reach a working hosted release

1. Select persistent storage for PDF/EPUB files (e.g. private object storage).
2. Select a persistent database to replace SQLite.
3. Add authentication and authorisation so each reader accesses only their own documents.
4. Migrate the local Python server endpoints to stateless functions, or host the existing server on a platform with a persistent volume. EPUB reflow and PDF rendering need extra care with execution limits and file size.
5. Move reader annotations and progress to durable user-scoped records if multi-device syncing is required.
6. Add production environment variables, deploy, and test PDF/EPUB import/render/search/delete on the hosted site.

The app can continue running locally during this migration using `start-lirelo.cmd`.

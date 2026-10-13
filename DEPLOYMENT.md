# Lirelo cloud deployment status

GitHub: https://github.com/dannysammy202/lirelo
Vercel: https://lirelo-sooty.vercel.app
Supabase project: Struct (`phkejehwadwzxvtjmesq`), shared with Struct's existing app.

## Deployed infrastructure

- Supabase Auth with email/password sign-in, subject to the project's email confirmation policy.
- Private `lirelo-private` bucket (50 MB file limit), owner-scoped storage policies.
- `public.lirelo_books`, `public.lirelo_reading_state`, `public.lirelo_profiles`, each protected by per-user RLS policies.
- Git-connected Vercel Python document API (`/api/inspect`, `/api/meta`, `/api/page`, `/api/reflow`, `/api/search`).
- Client-side upload, library, progress, annotations and preference synchronisation.

## Manual configuration / verification

Configure **Supabase Struct > Authentication > URL Configuration** Site URL and Redirect URLs for `https://lirelo-sooty.vercel.app` before new-account confirmation testing.

Run the real-user upload, reading and cross-device checks listed in README.md. They have not yet been verified using a real registered account.

## Security notes

Never commit a service-role key. The client intentionally uses a publishable key; JWT verification and RLS enforce access. PDF/EPUB raw uploads use Supabase Storage instead of Vercel's request body, and serverless rendering requests validate the authenticated user's book ownership.

The other, general-purpose Supabase project has three non-Lirelo tables with RLS disabled and was intentionally **not used**. No existing application tables were changed.
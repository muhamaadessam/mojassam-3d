# Supabase + Vercel setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. In Vercel Project Settings → Environment Variables, add the same public variables for Production, Preview, and Development.
5. Enable email/password in Supabase Authentication → Providers.
6. Push to `main`; Vercel deploys the API routes and pages automatically.

The public key can be used in the browser. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; it is intentionally not used by the customer-facing pages. RLS limits each customer to their own orders and model files.

The current order endpoint stores ready-design order metadata. Uploading customer STL/OBJ/3MF files to the private `models` bucket and sending G-code to the local printer bridge are the next integration step.

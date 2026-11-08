# Etba3 Bas (اطبع بس) — Namecheap

The app was renamed from Mojassam 3D. Server paths, the domain, cookie names, and the database file still use the old `mojassam` name on purpose, so existing sessions and deploys keep working.

Production: https://mojassam3d.muhammadessam.me

Run Node.js 24 in cPanel, production mode. Build with `npm ci && npm run build`.
Deploy `.next/standalone`, `.next/static`, and `public` in an app directory outside the document root.
Use `server.cjs` as the Passenger startup file. Set `APP_ORIGIN=https://mojassam3d.muhammadessam.me` and `DATA_DIRECTORY=/home/konobbue/mojassam-data`.
Set `ADMIN_EMAILS` to the shop owner's email (comma-separated for several). That account signs up normally on the site, then opens `/admin` to manage orders, gram prices, machine-hour rate, colors, and ready designs. Without it nobody can open the dashboard.
`APP_ORIGIN` is required in production: without it every sign-in, profile change, and order is rejected (403) and the log says so.
Login rate limits use the last `X-Forwarded-For` entry that the host's proxy adds, so the app must only be reachable through that proxy.
Customer model files and photos are stored in `DATA_DIRECTORY/uploads/orders/<order id>/`, and product photos in `DATA_DIRECTORY/uploads/designs/`. Orders accept uploads up to about 100MB, so the host's request-size limit (Apache `LimitRequestBody`) must allow that.
Back up the entire data directory using SQLite's backup API or while the app is stopped; never overwrite it during deployment.
Accounts, password hashes, sessions, profiles, and orders live in SQLite on Namecheap. No Supabase connection is used. Sessions require HTTPS. Google OAuth and email verification/recovery need separate configuration; the current sign-in uses email and password.
Existing Supabase accounts/orders have not been migrated. Old remote data has not been deleted.

Before deploying: `npm run lint && npm run typecheck && npm run build`, then start it with a throwaway `DATA_DIRECTORY` and `APP_ORIGIN=http://localhost:3188` on port 3188 and run `npm run test:auth`.

## Automatic deployment

`.github/workflows/namecheap.yml` runs on pushes to `main`, pull requests targeting `main`, and manual Actions runs. It uses Node.js 24, installs the lockfile, lints, builds, and tests authentication and orders against an isolated database. Only `main` is deployed.

Repository secrets:
- `NAMECHEAP_SSH_KEY`: dedicated deployment private key, authorized with `restrict` and a forced `/home/konobbue/mojassam-ci/receive-namecheap.sh` command. It accepts a commit SHA and release archive, not general SSH commands.
- `NAMECHEAP_KNOWN_HOSTS`: verified SSH host keys for `[server144.web-hosting.com]:21098`.

Install `scripts/receive-namecheap.sh` and `scripts/deploy-namecheap.sh` under `/home/konobbue/mojassam-ci` when setting up or changing the deployment protocol.

The workflow uploads the Linux standalone bundle to `/home/konobbue/mojassam-releases/<commit>`, smoke-tests it, switches the `current` symlink, and restarts Passenger. `/api/health` verifies the deployed commit and database availability; failure restores the previous startup target. Customer data stays in `/home/konobbue/mojassam-data`. Previous release directories are retained for recovery; remove older ones manually when disk space requires it.

`vercel.json` disables automatic Vercel deployments. GitHub pushes do not deploy to Vercel.

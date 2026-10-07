# Deployment

## Local run

Use Node.js 22.12 or newer. In the project root, install dependencies and start the API and Vite in separate terminals:

```powershell
npm ci
npm run dev:server
npm run dev
```

The frontend defaults to `http://localhost:3001` for its API. Copy `.env.example` to `.env.local` to override `VITE_API_BASE_URL`. Copy `server/.env.example` to `server/.env`, replace both placeholder secrets, and set the admin password before first startup. The start scripts load this ignored file when present; hosted deployments should configure values in their environment/secret store.

## Production layout

Deploy the Vite frontend as a static site and the Express API as a persistent Node.js service. Set `VITE_API_BASE_URL` to the public HTTPS API URL when building the frontend. Set `CORS_ORIGIN` on the API to the exact frontend origin, without a trailing slash. Configure the service to run `npm start` and listen on the hosting provider's `PORT` value.

The API uses SQLite at `server/data/enahda.db`. Attach persistent storage at `server/data`; an ephemeral filesystem will lose customer accounts, inventory, and orders on redeploy. Keep the API as a single instance while using SQLite. Do not deploy this API to a serverless runtime or scale it horizontally without first migrating the database to a shared database service.

Set `NODE_ENV=production`, a stable random `SESSION_SECRET`, and a unique `ADMIN_PASSWORD` before the production database is initialized. Set `ADMIN_EMAIL` to the intended administrator email. Production startup fails if `SESSION_SECRET` is missing. Keep all secrets in the hosting provider's secret store, never in Vite variables or committed files.

Generate a secret locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

The default administrator email is `admin@enahda.store`; its password must be supplied through `ADMIN_PASSWORD` before the database is initialized. Online card and wallet processing are not configured; checkout currently accepts cash on delivery only. Select a payment provider available to the business and configure its server-side credentials before enabling online payments.

## Health check

The API exposes `GET /health`, which returns a JSON status response. Verify this endpoint and a production build (`npm run build`) before routing traffic to the site.

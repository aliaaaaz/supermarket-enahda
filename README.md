# SuperMarket eNahda

A supermarket storefront and admin dashboard built with React, Vite, Express, and SQLite.

## Run locally

Use Node.js 22.12 or newer. From the project root:

```powershell
npm ci
Copy-Item server/.env.example server/.env
npm run dev:server
npm run dev
```

Set a unique `ADMIN_PASSWORD` and a random `SESSION_SECRET` in the ignored `server/.env` file before the first API startup. The API runs on `http://localhost:3001`; Vite serves the storefront on `http://localhost:5173`. See [Deployment](docs/DEPLOYMENT.md) for storage requirements.

## Verify

```powershell
npm test
npm run lint
npm run build
```

## Features

- Product search, category filters, stock-aware cart, and checkout
- Customer registration, login, and private order history
- Signed, expiring bearer sessions for admin operations
- Product and order management for administrators
- Cash-on-delivery checkout; online card and wallet processing are not configured

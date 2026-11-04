# Cardinal frontend

Next.js App Router, React, TypeScript and Tailwind CSS. This is the structure only: wallet connection, quoting, signing, liquidity screens and API integration are not implemented yet. The placeholder page will be replaced with the supplied UI.

## Run

Use Node 22. From `qms/frontend`:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Backend commands remain in `qms/backend`.

## Structure

```text
src/
  app/                 Routes, root layout and global styles
  components/
    ui/                Shared UI primitives
    layout/            Header, navigation and page shells
  features/
    swap/              Swap UI and feature logic
    liquidity/         Pool and LP flows
    wallet/            Wallet connection and signing
  hooks/               Shared React hooks
  lib/
    api/               Backend API clients and response validation
    config/            Public frontend configuration
    utils/             Shared utilities
  types/               Shared frontend types
public/
  images/              Static image assets
  icons/               Static icon assets
```

Feature folders are intentionally empty until implementation. Use the `@/*` alias for imports from `src/`. Keep pages thin and feature logic in its feature folder. Keep token amounts as decimal strings or bigint, not floating-point numbers.

## Environment

Copy `.env.example` to `.env.local` when wiring the API. Frontend environment files are separate from the root backend `.env`; do not copy backend secrets into the frontend. Every `NEXT_PUBLIC_*` value is public and baked into the browser bundle at build time. Never put private keys, provider credentials or the metrics token there.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
```

## ngrok preview (after the UI is ready)

Install the ngrok CLI and authenticate it locally with your own account; never commit its authentication token. For a public preview, use the production server rather than exposing the development server:

```sh
npm run build
npm start
# In a second terminal:
npm run tunnel
```

`tunnel` runs `ngrok http 3000`. No tunnel is started by default. Browser API requests need a reachable HTTPS backend URL (localhost points to the viewer's computer); set `NEXT_PUBLIC_API_BASE_URL` before building and set the backend `CORS_ORIGIN` to the exact ngrok frontend origin. The API connection is still to be implemented. Stop ngrok when the preview is over.

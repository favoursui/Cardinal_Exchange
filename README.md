# Cardinal frontend

Next.js App Router, React, TypeScript and Tailwind CSS. The swap UI includes live backend quotes and browser wallet connection. Transaction signing/submission, live token balances and liquidity screens remain pending.

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

Use the `@/*` alias for imports from `src/`. Keep pages thin and feature logic in its feature folder. Keep token amounts as decimal strings or bigint, not floating-point numbers.

## Environment

Copy `.env.example` to `.env.local` when wiring the API. Frontend environment files are separate from the root backend `.env`; do not copy backend secrets into the frontend. Every `NEXT_PUBLIC_*` value is public and baked into the browser bundle at build time. Never put private keys, provider credentials or the metrics token there.

## Checks

```sh
npm run lint
npm run typecheck
npm run test:wallet
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

`tunnel` runs `ngrok http 3000`. No tunnel is started by default. Browser API requests need a reachable HTTPS backend URL (localhost points to the viewer's computer); set `NEXT_PUBLIC_API_BASE_URL` before building and set the backend `CORS_ORIGIN` to the exact ngrok frontend origin. Stop ngrok when the preview is over.

## Wallet connection

Connect wallet opens a chooser for installed browser wallets using [EIP-6963 discovery](https://eips.ethereum.org/EIPS/eip-6963), with an EIP-1193 window.ethereum fallback. It also works in wallet browsers exposing a compatible provider. QR-based WalletConnect sessions are not integrated. No signing request is made when connecting, and no keys or wallet permissions are stored by the app. Reloading requires connecting again.

The navbar displays the connected account; the swap card uses the same account and network state. Account changes, chain changes, permission removal and provider disconnects update the UI. A wallet on another chain can explicitly switch to QMS Testnet (19480); if missing, the wallet is asked to add it using the public NEXT_PUBLIC_QMS_RPC_URL and NEXT_PUBLIC_QMS_EXPLORER_URL configuration. Both default to the public testnet endpoints. No backend RPC credentials should be used in browser configuration.

Disconnect clears the local connection; it does not revoke the wallet's site permissions or cancel an already-open wallet prompt. Those are controlled in the wallet. Swap submission stays disabled until its approval, transaction review and signing flow is implemented.

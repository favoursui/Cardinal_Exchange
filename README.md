# Cardinal frontend

Next.js App Router, React, TypeScript and Tailwind CSS. Trading is implemented for QMS Testnet: browser-wallet connection, live token balances, native and ERC-20 swaps, wrap/unwrap, exact approvals, existing-pool liquidity deposits/withdrawals, and local transaction history. Cardinal AI and Profile remain out of scope.

## Run

Use Node 22. From `qms/frontend`:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Run the backend from its own repository. The frontend talks to its configured HTTP API.

## Structure

```text
src/
  app/                 Routes, root layout and global styles
  components/
    ui/                Shared UI primitives
    layout/            Header, navigation and page shells
  features/
    swap/              Swap UI and feature logic
    trading/           Validated transaction review, settings and liquidity flows
    history/           Wallet-scoped browser history and status tracking
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
npm run test:history
npm run test:trading
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

Disconnect clears the local connection; it does not revoke the wallet's site permissions or cancel an already-open wallet prompt. Those are controlled in the wallet. Wallet submission happens only after explicit review and confirmation. Connecting never asks for a signature.

## Transaction history

The clock button opens a wallet-scoped QMS Testnet history panel. It persists up to 20 transaction hashes in this browser, refreshes their status using GET /v1/transactions/:hash, and links to the configured public explorer. Polling is sequential, pauses in hidden tabs and stops when the panel closes. Failures display status unavailable instead of success. Pending, not found, confirming, confirmed, reverted and reorged states remain distinct. Confirmation is not a guarantee of finality.

Use Track an existing transaction to add a hash. The connected wallet must be on QMS Testnet; its RPC is used to verify the hash belongs to a transaction sent by that account. No transaction is signed or sent by this flow. Account or network changes during lookup invalidate the import. This is a local tracked list, not an index of all wallet activity or all historical swaps. Clearing browser data removes it.

Submitted approvals, swaps, conversions and liquidity operations automatically save the wallet-returned hash under the submitting account, even if the displayed account subsequently changes. Storage failures display the hash with a warning. History remains local to this browser and does not discover all transactions sent by other applications.

## Trading configuration and behavior

Set NEXT_PUBLIC_API_BASE_URL in .env.local before building. For local development it points to http://localhost:3001; configure the backend CORS_ORIGIN as http://localhost:3000 and open that exact frontend origin. In Railway, set CORS_ORIGIN to the deployed frontend origin and rebuild the frontend with the reachable HTTPS API URL. Local environment changes do not update Railway.

The backend must enable QWAP_QUOTES_ENABLED, SWAP_PREPARATION_ENABLED and LIQUIDITY_PREPARATION_ENABLED. The UI checks /v1/capabilities and disables preparation when unsupported. Quotes and wallet balances use the API; balances refresh periodically. Fiat valuations remain unavailable because no price oracle is configured.

Review swap selects the chosen venue's quote ID. Each preparation is checked against the intended chain, account, router, amount, native value, calldata, route, minima and expiry. The currently supported executable venue is the pinned direct QWAP router. Fee-executor routes require a separately verified frontend registry and are rejected. Runtime code hashes are pinned from the backend testnet registry; liquidity pool addresses are checked against the pinned factory. Do not treat these checks as an independent audit or mainnet approval.

Approvals authorize the exact requested amount to the pinned router. Existing insufficient nonzero allowances require a separately reviewed zero reset first. Wait for confirmation, close the result panel and prepare again for the next approval or trade. Every step requires a fresh explicit wallet confirmation. Pending transactions can be reopened from the action button; confirmed transactions refresh balances and quotes. All decimal quantities are strings/bigints.

Before submission the wallet network and account are checked again, the call is simulated and estimated, gas funding is checked, and only explicit transaction fields are sent. An expired preparation cannot open a new wallet request. The wallet may stay open beyond the review expiry; router swaps have on-chain deadlines, but WQMS deposit/withdraw methods do not. Refresh before retrying rejected/expired transactions. Never interpret submission as success or automatically resend an uncertain transaction.

Native MAX reserves a conservative 6.5 million gas units at twice the current gas price; this is a reserve, not the actual fee. Native balances cannot be fully spent without gas. Native liquidity is unsupported: wrap QMS first. Liquidity is restricted to existing QWAP ERC-20 pools; the router does not enforce a minimum minted LP share count, which is disclosed in review. LP balances use the V2 pair's 18-decimal units.

## Local fork verification

The integration test uses a fixed localhost transaction endpoint, checks Anvil and fork chain identity before sending, and restores its snapshot afterward. No public transaction endpoint is accepted. Build the backend, start an isolated fork, then run:

```sh
anvil --fork-url https://rpc.testnet.qms.finance --port 18546 --host 127.0.0.1 --chain-id 19480
# Separate terminal, in frontend:
CARDINAL_BACKEND_DIR=/absolute/path/to/backend npm run test:trading-fork
```

The harness exercises the actual backend preparations through the frontend validation and wallet submission code: wrap, unwrap, QMS-input swap, QMS-output swap, ERC-20 swap, exact approvals, deposit, full LP withdrawal, confirmations and history recording. Evidence is written to /tmp/cardinal-trading-fork-evidence.json. It requires a working upstream testnet RPC to populate the fork.

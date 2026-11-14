# Cadinal liquidity activation

The `/liquidity` page manages Cadinal-owned V2 pools on QMS Testnet (19480). It does not list QWAP pools or accept arbitrary router/factory addresses. The current public deployment is unavailable; the own-pool contracts and integration have only been exercised on a local fork.

## Before enabling public liquidity

1. Review and deploy the Cadinal factory/router using the backend contract deployment workflow. Record the chain, addresses, deployment receipts, runtime bytecode hashes, wrapped QMS address, token allowlist, and fee authority. Verify router/factory linkage and source code. Do not reuse QWAP addresses.
2. Add a reviewed Cadinal public registry and register its adapter in the backend server for pool reads, wallet balances, deposit preparation, and withdrawal preparation. Pin the deployed factory/router/token runtime hashes. The current server registers only QWAP; changing environment flags alone is insufficient. Keep unverified deployments disabled.
3. Populate `src/lib/config/cadinal-deployment.ts` from that reviewed evidence, using the exact same chain, router, factory, and runtime hashes. Update the trusted token metadata/code hashes if the allowlist changes. Rebuild the frontend. API responses and user input must never supply these trust pins.
4. Create and seed the intended pools through the reviewed deployment/initial-liquidity workflow. The page adds liquidity only to existing initialized pools; it does not create pairs or establish their initial price. Native QMS must be wrapped before an ERC-20 pool deposit.
5. Enable the existing preparation flags and confirm `/v1/capabilities` advertises `cadinal` separately for `liquidityAddition` and `liquidityRemoval`. Verify the Cadinal catalog, wallet balances, exact approvals, deposit, LP position, partial/full withdrawal, and history on public testnet with small test amounts. Confirm account/network changes, rejected wallet prompts, expired preparations, and upstream failures leave the UI safe to retry.
6. Activate Cadinal swap routing separately: register it for backend quotes/preparations and add verified venue-specific frontend swap validation. This liquidity change does not enable a public Cadinal swap route. Existing executable swaps remain pinned to QWAP.

The page remains read-only or unavailable until its deployment pins and the backend capabilities agree. Contract review and a successful testnet run are still required; compilation and unit tests do not establish mainnet readiness.

## Data and behavior

- `GET /v1/liquidity/pools?wallet=<optional-address>&cursor=0` is the sole pool catalog. Follow `nextCursor` until null. Only `cadinal` pools with known ERC-20 metadata and the pinned factory/router are accepted.
- Missing deployment configuration is distinct from an empty deployed factory. Partial scans show an incomplete-list notice and lower-bound pool/position counts. Lookup failures do not become zero wallet balances.
- The catalog refreshes every minute while visible, on manual refresh, and after transaction progress. A wallet change discards the previous wallet's positions. Each pool is a separate verified snapshot, not a single atomic snapshot across the catalog.
- Position amounts are pro-rata reserve estimates, not withdrawal guarantees or USD values. Pool fees accumulate in reserves; this page does not expose a separate fee-claim operation.
- Frontend discovery is bounded to its supported token metadata. Extend and validate that metadata before enabling a larger backend token allowlist. Unknown or inconsistent catalog data is rejected rather than presented as complete.
- Deposits and withdrawals use fresh backend preparations and explicit wallet confirmation. No server signing keys are needed. Submitted transaction hashes are tracked in the existing browser history.

## Checks

```sh
npm run lint
npm run typecheck
npm run test:liquidity
npm run test:trading
npm run build
```

The liquidity regression suite checks missing deployment configuration, catalog pagination and partial results, position arithmetic, identity validation, and venue-bound approval/transaction destinations. Public deployment and funded-wallet checks remain separate from these automated tests.

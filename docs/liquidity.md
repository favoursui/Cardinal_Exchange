# Cadinal liquidity activation

The `/liquidity` page manages Cadinal-owned V2 pools on QMS Testnet (19480). It does not list QWAP pools or accept arbitrary router/factory addresses. The source-verified CadinalFactory and CadinalRouter are registered, and the funded WQMS/USDC pool is active in the Cadinal app registry.

## Registered QMS testnet contracts

- Factory: `0xeb79d4CDC34E2f18ab5B9652D2e876F8E47595fF`
- Router: `0xb6530355d0F8c18D41B29443bC0defF3bE7E65f2`
- WQMS/USDC pair: `0xF436b4D445A6f108E151c4Af480EDF56112828f5`
- LP token: Cadinal LP (`CDNL-LP`)

Frontend pins live in `src/lib/config/cadinal-deployment.ts`; the matching backend registry is in `qmsbackend/backend/apps/api/src/adapters/cadinal-registry.ts`. Update and deploy both together. Historical pools under the previous factory remain separate and are not discovered by the new registry.

The replacement contracts and funded testnet pool are source-verified and registered for testnet use. This is not mainnet approval or an independent security audit.

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


## Cadinal pool registration

The source-verified Cadinal factory and router are pinned in `src/lib/config/cadinal-deployment.ts`. The funded WQMS/USDC pair is `0xF436b4D445A6f108E151c4Af480EDF56112828f5`; its LP token is Cadinal LP (`CDNL-LP`). Backend routing uses the matching pinned registry in `qmsbackend/backend/apps/api/src/adapters/cadinal-registry.ts`. Restart/redeploy the API and rebuild/redeploy the frontend together before using these addresses. Existing positions in the old factory remain separate.

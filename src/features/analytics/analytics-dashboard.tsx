"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TokenLogo } from "@/components/ui/token-logo";
import { api, object } from "@/features/trading/api";
import { parseCatalog, type LiquidityPool } from "@/features/liquidity/data";
import { tokenMetadata, type Token } from "@/lib/config/tokens";
import styles from "./analytics.module.css";

type Snapshot = { pools: LiquidityPool[]; checkedAt: string; partial: boolean; failures: number; configured: boolean };
type UsersMetric = { status: "indexing" | "ready" | "unavailable"; totalUsers: string | null; block?: string };
const amount = (raw: string, decimals: number) => {
  const value = BigInt(raw), scale = BigInt(10) ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  if (!whole && !fraction && value > BigInt(0)) return "<0.0001";
  return new Intl.NumberFormat("en-US").format(whole) + (fraction ? "." + fraction : "");
};
const shortAddress = (address: string) => address.slice(0, 8) + "…" + address.slice(-6);

function ReserveBars({ pools }: { pools: LiquidityPool[] }) {
  const totals = useMemo(() => {
    const result = new Map<Token, number>();
    for (const pool of pools) {
      result.set(pool.tokenA, (result.get(pool.tokenA) ?? 0) + Number(pool.reserveA) / 10 ** tokenMetadata[pool.tokenA].decimals);
      result.set(pool.tokenB, (result.get(pool.tokenB) ?? 0) + Number(pool.reserveB) / 10 ** tokenMetadata[pool.tokenB].decimals);
    }
    return [...result].sort((a, b) => b[1] - a[1]);
  }, [pools]);
  const max = Math.max(1, ...totals.map(([, value]) => value));
  if (!totals.length) return <div className={styles.emptyChart}>No active pool reserves were returned.</div>;
  return <div className={styles.reserveBars}>
    <div className={styles.chartCaption}><span>Relative amount · each token in its own units</span><span>NOW</span></div>
    {totals.map(([token, value]) => <div className={styles.reserveRow} key={token}>
      <div className={styles.asset}><TokenLogo symbol={token} /><b>{token}</b></div>
      <div className={styles.track}><i style={{ width: Math.max(2, value / max * 100) + "%" }} /></div>
      <strong>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value)} <small>{token}</small></strong>
    </div>)}
    <p className={styles.note}>Bars compare relative quantities. Assets are not converted to USD and amounts across different tokens are not directly comparable.</p>
  </div>;
}

type ChartMode = "bars" | "line" | "area";
function PoolChart({ pools, mode }: { pools: LiquidityPool[]; mode: ChartMode }) {
  if (!pools.length) return <div className={styles.emptyChart}>No active pools to chart yet.</div>;
  const values = pools.map(pool => Number(pool.totalSupply));
  const max = Math.max(...values, 1);
  const x = (index: number) => pools.length === 1 ? 50 : 8 + index * 84 / (pools.length - 1);
  const y = (value: number) => 82 - value / max * 66;
  const points = values.map((value, index) => x(index) + "," + y(value)).join(" ");
  return <div className={styles.poolChart}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="LP token supply by Cadinal pool">
      <defs><linearGradient id="pool-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#53c6a7" stopOpacity=".35" /><stop offset="1" stopColor="#53c6a7" stopOpacity=".02" /></linearGradient></defs>
      {[20, 40, 60, 80].map(level => <line key={level} x1="0" x2="100" y1={level} y2={level} className={styles.chartGridline} />)}
      {mode === "area" && <polygon points={points + " 92,82 8,82"} fill="url(#pool-area-fill)" />}
      {mode !== "bars" && <polyline points={points} className={styles.line} />}
      {mode === "bars" && values.map((value, index) => {
        const width = Math.min(9, 64 / values.length);
        return <rect key={pools[index]!.address} x={x(index) - width / 2} y={y(value)} width={width} height={82 - y(value)} rx="0.7" className={styles.bar}><title>{pools[index]!.tokenA}/{pools[index]!.tokenB} LP supply</title></rect>;
      })}
      {mode !== "bars" && values.map((value, index) => <circle key={pools[index]!.address} cx={x(index)} cy={y(value)} r="1.1" className={styles.dot}><title>{pools[index]!.tokenA}/{pools[index]!.tokenB} LP supply</title></circle>)}
    </svg>
    <div className={styles.axis}><span>{pools[0]!.tokenA}/{pools[0]!.tokenB}</span><span>{pools[pools.length - 1]!.tokenA}/{pools[pools.length - 1]!.tokenB}</span></div>
    <p className={styles.note}>LP token supply is an index for comparing pool size; LP tokens from different pairs are not equivalent.</p>
  </div>;
}

export function AnalyticsDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [usersMetric, setUsersMetric] = useState<UsersMetric>({ status: "indexing", totalUsers: null });
  const [venues, setVenues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [chartMode, setChartMode] = useState<ChartMode>("area");
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const caps = object(await api("/v1/capabilities", undefined, signal));
      if (caps.chainId !== 19480 || caps.testnet !== true) throw new Error("Analytics API is not connected to QMS testnet.");
      const operations = object(caps.operations), quotes = object(operations.quotes), poolReads = object(operations.poolReads);
      setVenues(Array.isArray(quotes.venues) ? quotes.venues.filter((venue): venue is string => typeof venue === "string") : []);
      if (poolReads.enabled !== true) {
        setSnapshot({ pools: [], checkedAt: new Date().toISOString(), partial: false, failures: 0, configured: false });
        return;
      }
      const pools: LiquidityPool[] = [];
      let cursor = 0, partial = false, failures = 0, configured = true;
      do {
        const data = await api("/v1/liquidity/pools?cursor=" + cursor, undefined, signal);
        const parsed = parseCatalog(data, null, cursor);
        configured = parsed.configured; pools.push(...parsed.pools); partial ||= parsed.partial;
        failures += Array.isArray(data.failures) ? data.failures.length : 0;
        if (parsed.nextCursor === null) break;
        cursor = parsed.nextCursor;
      } while (!signal.aborted);
      if (!signal.aborted) setSnapshot({ pools, checkedAt: new Date().toISOString(), partial, failures, configured });
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load live Cadinal analytics.");
    } finally { if (!signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, revision]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: number | undefined;
    const refreshUsers = async () => {
      try {
        const data = object(await api("/v1/analytics/users", undefined, controller.signal));
        if (data.chainId !== 19480 || data.metric !== "unique_successful_swap_or_lp_wallets" ||
          !["indexing", "ready", "unavailable"].includes(String(data.status)) ||
          !(data.totalUsers === null || (typeof data.totalUsers === "string" && /^(0|[1-9][0-9]{0,30})$/.test(data.totalUsers)))) {
          throw new Error("Invalid analytics response.");
        }
        const metric: UsersMetric = { status: data.status as UsersMetric["status"], totalUsers: data.totalUsers };
        if (metric.status === "ready") {
          const blocks = Object.values(object(data.indexedThrough));
          if (metric.totalUsers === null || !blocks.length ||
              !blocks.every((block): block is string => typeof block === "string" && /^[0-9]+$/.test(block))) {
            throw new Error("Invalid analytics checkpoint.");
          }
          metric.block = blocks.reduce((a, b) => BigInt(a) < BigInt(b) ? a : b);
        }
        if (active) setUsersMetric(metric);
      } catch {
        if (active && !controller.signal.aborted) setUsersMetric({ status: "unavailable", totalUsers: null });
      } finally {
        if (active) timer = window.setTimeout(refreshUsers, 30_000);
      }
    };
    void refreshUsers();
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [revision]);

  const pools = snapshot?.pools ?? [];
  const active = pools.filter(pool => BigInt(pool.totalSupply) > BigInt(0));
  const assets = new Set(active.flatMap(pool => [pool.tokenA, pool.tokenB])).size;
  const refresh = () => setRevision(value => value + 1);

  return <div className={styles.dashboard}>
    {error && <div role="alert" className={styles.error}>{error}<button onClick={refresh}>Try again</button></div>}

    <Section title="Live market snapshot" />
    <section className={styles.overview}>
      <article className={styles.panel + " " + styles.featurePanel}>
        <div className={styles.panelTitle}><div><p>CADINAL LIQUIDITY</p><h2>Pool distribution</h2></div><div className={styles.chartControls}>
          <div className={styles.chartTypes} aria-label="Chart type">
            <button type="button" aria-label="Bar chart" aria-pressed={chartMode === "bars"} onClick={() => setChartMode("bars")} title="Bar chart">▥</button>
            <button type="button" aria-label="Line chart" aria-pressed={chartMode === "line"} onClick={() => setChartMode("line")} title="Line chart">⌁</button>
            <button type="button" aria-label="Area chart" aria-pressed={chartMode === "area"} onClick={() => setChartMode("area")} title="Area chart">⌁̲</button>
          </div>
          <div className={styles.periods} aria-label="Time range (historical data unavailable)">
            {["1D", "7D", "1M", "3M", "1Y"].map(period => <button type="button" key={period} disabled title="Historical pool snapshots are not available yet">{period}</button>)}
            <button type="button" disabled aria-label="Choose date range" title="Historical pool snapshots are not available yet">▦</button>
          </div>
          <button className={styles.refresh} onClick={refresh} disabled={loading} aria-label="Refresh analytics" title="Refresh live snapshot">{loading ? "◌" : "↻"}</button>
        </div></div>
        <div className={styles.featureValue}><strong>{snapshot ? active.length : "—"}</strong><span>active pools</span></div>
        <PoolChart pools={active} mode={chartMode} />
      </article>
      <div className={styles.sideOverview}>
        <div className={styles.miniMetrics}>
          <MiniMetric label="Listed assets" value={snapshot ? String(assets) : "—"} detail="Across active pairs" />
          <MiniMetric label="Quote venues" value={venues.length ? String(venues.length) : "—"} detail={venues.length ? venues.map(value => value.toUpperCase()).join(" · " ) : "Not available"} />
          <div className={styles.miniMetric + " " + styles.emptyMiniMetric} aria-hidden="true" />
        </div>
        <article className={styles.panel + " " + styles.reservePanel}>
          <PanelTitle eyebrow="CURRENT RESERVES" title="Assets held in pools" badge="ONCHAIN" />
          {active.length ? <ReserveBars pools={active} /> : <div className={styles.emptyChart}>{loading ? "Reading Cadinal pools…" : "No active pool reserves were returned."}</div>}
        </article>
      </div>
    </section>
    <p className={styles.dataCaveat}>This is a live pool snapshot. Historical trading volume, open interest, revenue, and USD valuations need additional indexing and price data.</p>

    <Section title="All-Time" />
    <section className={styles.allTime} aria-label="All-time analytics">
      <AllTimeMetric
        label="Total Users"
        value={usersMetric.status === "ready" && usersMetric.totalUsers !== null
          ? new Intl.NumberFormat("en-US").format(BigInt(usersMetric.totalUsers)) : "—"}
        detail={usersMetric.status === "ready" ? `Unique wallets through block ${usersMetric.block}` : usersMetric.status === "indexing" ? "Indexing confirmed swap and LP history" : "Analytics unavailable"}
      />
      <AllTimeMetric label="Total Volume" />
      <AllTimeMetric label="Total Deposits (All Time)" />
      <AllTimeMetric label="Total Withdrawals (All Time)" />
    </section>
    <Section title="Volume & Open Interest" />
    <Section title="User Growth" />
    <section className={styles.growthGrid} aria-label="User growth analytics">
      <GrowthCard title="Unique Traders by Asset" legends={["WQMS", "USDC", "WETH", "WBTC", "USDT", "Total unique traders"]} />
      <GrowthCard title="Cumulative New Users" legends={["Daily new users", "Cumulative new users"]} />
    </section>

    <Section title="Trading Activity" />
    <section className={styles.growthGrid} aria-label="Trading activity analytics">
      <TradeCountCard />
      <DailyUsersCard />
    </section>

    <Section title="Liquidity & Top Users" />
    <section className={styles.growthGrid} aria-label="Liquidity and top user analytics">
      <SlippageCard />
      <TopUsersCard />
    </section>

    <Section title="Markets and data quality" />
    <section className={styles.grid}>
      <article className={styles.panel}>
        <PanelTitle eyebrow="VERIFIED CONTRACT READS" title="Cadinal pools" badge={snapshot?.partial ? "PARTIAL DATA" : "ONCHAIN"} />
        {!pools.length && !loading ? <div className={styles.emptyState}><b>{snapshot?.configured ? "No pools found" : "Pool analytics unavailable"}</b><p>{snapshot?.configured ? "No listed token pairs currently have a deployed Cadinal pool." : "The API has not enabled Cadinal pool reads."}</p><Link href="/liquidity">Open liquidity</Link></div> :
        <div className={styles.tableWrap}><table><thead><tr><th>Pool</th><th>Reserves</th><th>LP supply</th><th>Observed</th></tr></thead><tbody>
          {pools.map(pool => <tr key={pool.address}><td><span className={styles.pair}><span><TokenLogo symbol={pool.tokenA} /><TokenLogo symbol={pool.tokenB} /></span><span><b>{pool.tokenA}/{pool.tokenB}</b><small>{shortAddress(pool.address)}</small></span></span></td>
            <td>{amount(pool.reserveA, tokenMetadata[pool.tokenA].decimals)} {pool.tokenA}<br />{amount(pool.reserveB, tokenMetadata[pool.tokenB].decimals)} {pool.tokenB}</td>
            <td>{amount(pool.totalSupply, 18)} LP</td><td>{new Date(pool.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td></tr>)}
        </tbody></table>{loading && <p className={styles.loading}>Refreshing pool snapshot…</p>}</div>}
        {snapshot?.partial && <p className={styles.warning}>{snapshot.failures} pair reads could not be checked. Refresh to retry.</p>}
      </article>
      <article className={styles.panel}>
        <PanelTitle eyebrow="INDEXING STATUS" title="Network activity" badge="DATA SOURCES" />
        <div className={styles.sources}>
          <Source name="Live pool reserves" detail="Cadinal factory and pairs on QMS" status={snapshot?.configured ? "CONNECTED" : "OFFLINE"} />
          <Source name="Quote venues" detail={venues.map(value => value.toUpperCase()).join(", ") || "No venues advertised"} status={venues.length ? "CONNECTED" : "OFFLINE"} />
          <Source name="Unique swap and LP users" detail="Confirmed events across enabled venues" status={usersMetric.status === "ready" ? "CONNECTED" : usersMetric.status === "indexing" ? "INDEXING" : "OFFLINE"} />
          <Source name="Historical swaps and volume" detail="Requires trade volume indexing" status="NOT INDEXED" />
          <Source name="USD TVL and revenue" detail="Requires token pricing and fee indexing" status="NOT AVAILABLE" />
        </div>
        <div className={styles.info}><b>Snapshot taken</b><span>{snapshot ? new Date(snapshot.checkedAt).toLocaleString() : loading ? "Loading…" : "No snapshot"}</span><p>Unique users appear after the confirmed event history is indexed. Historical volume, revenue, and USD valuations still need separate indexing and pricing.</p></div>
      </article>
    </section>
    <footer className={styles.footer}>Data from Cadinal’s configured QMS Testnet contracts and API. Values are live snapshots, not historical records or financial advice.</footer>
  </div>;
}

function Section({ title }: { title: string }) { return <div className={styles.section}><span>{title}</span><i /></div>; }
function PanelTitle({ eyebrow, title, badge }: { eyebrow: string; title: string; badge: string }) {
  return <div className={styles.panelTitle}><div><p>{eyebrow}</p><h2>{title}</h2></div><span>{badge}</span></div>;
}
function Source({ name, detail, status }: { name: string; detail: string; status: string }) {
  return <div className={styles.source}><i aria-hidden="true">{status === "CONNECTED" ? "✓" : "·"}</i><span><b>{name}</b><small>{detail}</small></span><strong data-online={status === "CONNECTED"}>{status}</strong></div>;
}
function MiniMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className={styles.miniMetric}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function AllTimeMetric({ label, value = "—", detail = "Not indexed yet" }: { label: string; value?: string; detail?: string }) {
  return <article className={styles.allTimeMetric}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function GrowthCard({ title, legends }: { title: string; legends: string[] }) {
  return <article className={styles.growthCard}>
    <div className={styles.growthHeading}><h2>{title}</h2><span aria-label="Historical user data is not indexed" title="Historical user data is not indexed">ⓘ</span></div>
    <div className={styles.growthToolbar}>
      <div className={styles.growthLegends}>{legends.map((label, index) => <span key={label}><i data-tone={index % 5} />{label}</span>)}</div>
      <div className={styles.growthPeriods} aria-label="Time range unavailable">
        {["D", "W", "M", "Y"].map(period => <button type="button" key={period} disabled title="Historical user data is not indexed">{period}</button>)}
      </div>
    </div>
    <div className={styles.growthChart}>
      <div className={styles.growthGridLines}><i /><i /><i /><i /></div>
      <div className={styles.growthUnavailable}><strong>Historical user activity unavailable</strong><span>Cadinal needs an on-chain event indexer for this chart.</span></div>
    </div>
  </article>;
}

function DisabledPeriodFilters() {
  return <div className={styles.growthPeriods} aria-label="Time range unavailable">
    {["D", "W", "M", "Y"].map(period => <button type="button" key={period} disabled title="Historical trading data is not indexed">{period}</button>)}
  </div>;
}
function TradeCountCard() {
  const assets = ["WQMS", "USDC", "WETH", "WBTC", "USDT"];
  return <article className={styles.activityCard}>
    <div className={styles.growthHeading}><h2>Number of Trades</h2><span title="Historical trades are not indexed">ⓘ</span></div>
    <div className={styles.tradeTabs}><button type="button" disabled>Coins</button><button type="button" disabled>Maker / Taker</button></div>
    <div className={styles.tradeLegends}>
      {assets.map((asset, index) => <span key={asset}><i data-tone={index % 5} />{asset}</span>)}
      <span><i data-cumulative="true" />Cumulative trades</span><button type="button" disabled>Deselect all</button>
    </div>
    <div className={styles.activityToolbar}><button type="button" disabled>Assets selected⌄</button><DisabledPeriodFilters /></div>
    <ActivityEmptyChart message="Trade history is not indexed yet" />
  </article>;
}
function DailyUsersCard() {
  return <article className={styles.activityCard}>
    <div className={styles.growthHeading}><h2>Daily Active Users</h2></div>
    <div className={styles.dailyLegend}><span><i />Daily active users</span></div>
    <div className={styles.activityToolbar}>
      <div className={styles.chartTypes} aria-label="Chart type">
        <button type="button" disabled title="Historical activity is unavailable">▥</button><button type="button" disabled title="Historical activity is unavailable">⌁</button><button type="button" disabled title="Historical activity is unavailable">↗</button>
      </div><DisabledPeriodFilters />
    </div>
    <ActivityEmptyChart message="Active wallet history is not indexed yet" />
  </article>;
}
function ActivityEmptyChart({ message }: { message: string }) {
  return <div className={styles.growthChart}><div className={styles.growthGridLines}><i /><i /><i /><i /></div><div className={styles.growthUnavailable}><strong>{message}</strong><span>Cadinal needs an on-chain event indexer for these metrics.</span></div></div>;
}

function SlippageCard() {
  return <article className={styles.activityCard}>
    <div className={styles.growthHeading}><h2>Slippage</h2><span title="Historical slippage is not indexed">ⓘ</span></div>
    <div className={styles.slippageControls}>
      <div>{["Half Spread", "$1k", "$10k", "$30k", "$100k"].map((item, index) => <button type="button" key={item} disabled aria-pressed={index === 0}>{item}</button>)}</div>
      <div className={styles.tradeLegends}>{["WQMS", "USDC", "WETH", "WBTC", "USDT"].map((asset, index) => <span key={asset}><i data-tone={index} />{asset}</span>)}<button type="button" disabled>Deselect all</button></div>
    </div>
    <div className={styles.activityToolbar}><button type="button" disabled>Assets selected⌄</button><DisabledPeriodFilters /></div>
    <ActivityEmptyChart message="Historical slippage is not indexed" />
  </article>;
}
function TopUsersCard() {
  return <article className={styles.activityCard + " " + styles.topUsersCard}>
    <div className={styles.growthHeading}><h2>Top Users By Volume</h2></div>
    <div className={styles.usersTable}>
      <div className={styles.usersTableHead}><span>WALLET</span><span>VOLUME</span></div>
      <div className={styles.usersEmpty}>Trader volume data is not indexed yet.</div>
      <div className={styles.usersTableFoot}><span>Wallet activity unavailable</span><div><button disabled aria-label="Previous page">‹</button><span>—</span><button disabled aria-label="Next page">›</button></div></div>
    </div>
  </article>;
}

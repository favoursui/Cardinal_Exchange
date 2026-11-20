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

const feePeriods = ["24h", "7d", "30d"] as const;

type ChartMode = "bars" | "line" | "area";
function ChartIcon({ kind }: { kind: ChartMode | "calendar" }) {
  const drawing = {
    bars: <path d="M3 3v14h14M7 13V8m4 5V4m4 9v-3" />,
    area: <path d="M3 3v14h14M5.5 13c1.5-4 3-6 5-4s3.5 3 6-4" />,
    line: <path d="m2.5 14 5.5-5.5 3.5 3.5 6-7M13 5h4.5v4.5" />,
    calendar: <><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M6.5 2.5v3M13.5 2.5v3M3 8h14M6.5 11h1m2 0h1m2 0h1m-7 3h1m2 0h1" /></>,
  };
  return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawing[kind]}</svg>;
}

function ChartTypeButtons({ mode, onChange }: { mode?: ChartMode; onChange?: (mode: ChartMode) => void }) {
  return <div className={styles.chartTypes} role="group" aria-label="Chart type">
    {(["bars", "area", "line"] as const).map(kind => {
      const label = { bars: "Bar chart", area: "Area chart", line: "Line chart" }[kind];
      return <button key={kind} type="button" aria-label={label} aria-pressed={mode === kind}
        title={onChange ? label : "Historical activity is unavailable"} disabled={!onChange} onClick={() => onChange?.(kind)}>
        <ChartIcon kind={kind} />
      </button>;
    })}
  </div>;
}

const volumeRanges = ["1D", "7D", "1M", "3M", "1Y"] as const;

function VolumeCard() {
  const [mode, setMode] = useState<ChartMode>("bars");
  const [range, setRange] = useState<(typeof volumeRanges)[number]>("1M");

  return <article className={styles.panel + " " + styles.featurePanel + " " + styles.volumePanel}>
    <header className={styles.volumeHeader}>
      <h2>Total Volume</h2>
      <div className={styles.chartControls}>
        <ChartTypeButtons mode={mode} onChange={setMode} />
        <div className={styles.periods} role="group" aria-label="Volume time range">
          {volumeRanges.map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>{value}</button>)}
          <button type="button" disabled aria-label="Custom date range unavailable" title="Volume history is not indexed yet"><ChartIcon kind="calendar" /></button>
        </div>
      </div>
    </header>
    <div className={styles.featureValue}><strong aria-label="Total trading volume in USD unavailable">—</strong></div>
    <div className={styles.volumeChanges}><span>24h —</span><span>30d —</span></div>
    <div className={styles.volumePlot}>
      <span aria-hidden="true" className={styles.volumeWatermark}>Cadinal</span>
      <span className={styles.volumeEmpty} role="status">Volume history unavailable · {range}</span>
    </div>
  </article>;
}

export function AnalyticsDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [usersMetric, setUsersMetric] = useState<UsersMetric>({ status: "indexing", totalUsers: null });
  const [venues, setVenues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [feePeriod, setFeePeriod] = useState<(typeof feePeriods)[number]>("24h");
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
  const refresh = () => setRevision(value => value + 1);

  return <div className={styles.dashboard}>
    {error && <div role="alert" className={styles.error}>{error}<button onClick={refresh}>Try again</button></div>}

    <Section title="Live market snapshot" />
    <section className={styles.overview}>
      <VolumeCard />
      <div className={styles.sideOverview}>
        <div className={styles.miniMetrics}>
          <article className={styles.miniMetric}>
            <span className={styles.metricLabel}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m2 6 8-4 8 4-8 4z" fill="currentColor" />
                <path d="m2 10 8 4 8-4M2 14l8 4 8-4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              24h trading volume
            </span>
            <strong aria-label="24-hour trading volume unavailable">—</strong>
            <small>Volume not indexed yet</small>
          </article>
          <article className={styles.miniMetric}>
            <span className={styles.metricLabel}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <circle cx="7" cy="6" r="3" /><circle cx="14" cy="7" r="2.3" />
                <path d="M1 16a6 6 0 0 1 12 0v1H1zm13.5 0a7.5 7.5 0 0 0-1.6-4.7A4.6 4.6 0 0 1 19 15.7v.8h-4.5z" />
              </svg>
              Total Traders
            </span>
            <strong aria-label="Total traders unavailable">—</strong>
            <small>Traders not indexed yet</small>
          </article>
          <article className={styles.miniMetric}>
            <span className={styles.metricLabel}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 6.5h15m-3-3 3 3-3 3M17.5 13.5h-15m3-3-3 3 3 3" />
              </svg>
              Total Swaps
            </span>
            <strong aria-label="Total swaps unavailable">—</strong>
            <small>Swaps not indexed yet</small>
          </article>
          <article className={styles.miniMetric}>
            <div className={styles.feeHeader}>
              <span className={styles.metricLabel}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <ellipse cx="10" cy="5" rx="6.5" ry="2.5" />
                  <path d="M3.5 5v10c0 3.3 13 3.3 13 0V5M3.5 8.3c0 3.3 13 3.3 13 0M3.5 11.7c0 3.3 13 3.3 13 0" />
                </svg>
                Fees
              </span>
              <div className={styles.feePeriods} role="group" aria-label="Fee time range">
                {feePeriods.map(period => (
                  <button key={period} type="button" aria-pressed={feePeriod === period} onClick={() => setFeePeriod(period)}>
                    {period}
                  </button>
                ))}
              </div>
            </div>
            <strong aria-label={`Fees unavailable for the last ${feePeriod}`}>—</strong>
            <small>Fees not indexed yet</small>
          </article>
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
        <button type="button" className={styles.refresh} onClick={refresh} disabled={loading} aria-label="Refresh analytics" title="Refresh live snapshot">↻</button>
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
      <ChartTypeButtons />
      <DisabledPeriodFilters />
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

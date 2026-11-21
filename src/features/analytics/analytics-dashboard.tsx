"use client";

import { useEffect, useState } from "react";
import { api, object } from "@/features/trading/api";
import styles from "./analytics.module.css";

type UsersMetric = { status: "indexing" | "ready" | "unavailable"; totalUsers: string | null; block?: string };
const transactionRanges = ["24H", "7D", "30D", "90D", "1Y", "ALL"] as const;

function TransactionsCard() {
  const [range, setRange] = useState<(typeof transactionRanges)[number]>("24H");
  const [points, setPoints] = useState<{start:number; count:number}[]>([]);
  const [message, setMessage] = useState("Loading transactions");
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    setPoints([]);
    setMessage("Loading transactions");
    async function refresh() {
      try {
        const data = object(await api("/v1/analytics/transactions?range=" + range, undefined, controller.signal));
        if (controller.signal.aborted) return;
        if (data.status === "indexing") {
          setPoints([]);
          setMessage("Indexing confirmed transactions");
        } else {
          if (data.status !== "ready" || !Array.isArray(data.buckets) || data.buckets.length > 24) throw new Error("Invalid history");
          const buckets = data.buckets.map(value => {
            const { start, count } = object(value);
            if (typeof start !== "number" || typeof count !== "number" || !Number.isSafeInteger(start) || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid bucket");
            return {start,count};
          });
          setPoints(buckets);
          setMessage("No confirmed swaps in this period");
        }
      } catch {
        if (!controller.signal.aborted) { setPoints([]); setMessage("Transaction history unavailable"); }
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 30000);
      }
    }
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [range]);
  const peak = Math.max(0, ...points.map(point => point.count));
  return <article className={styles.panel + " " + styles.transactionsPanel}>
    <header className={styles.volumeHeader}>
      <h2 className={styles.transactionTitle}><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M2 6h15l-3-3m3 3-3 3M18 14H3l3-3m-3 3 3 3" /></svg>Transactions</h2>
      <div className={styles.periods} role="group" aria-label="Transaction time range">
        {transactionRanges.map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>{value}</button>)}
      </div>
    </header>
    {peak > 0 ? <figure className={styles.txFigure}>
      <div className={styles.txBars} aria-label="Confirmed swap transactions">
        {points.map(point => {
          const label = new Date(point.start * 1000).toLocaleString() + " · " + point.count + " transactions";
          return <div key={point.start} title={label} role="img" aria-label={label} style={{height: (100 * point.count / peak) + "%"}} />;
        })}
      </div>
      <figcaption>{new Date(points[0]!.start * 1000).toLocaleString()} · {points.reduce((sum,point) => sum + point.count, 0).toLocaleString()} transactions</figcaption>
    </figure> : <div className={styles.emptyChart} role="status">{message}</div>}
  </article>;
}

const feePeriods = ["24h", "7d", "30d"] as const;

function FeeTotals({period}: {period: (typeof feePeriods)[number]}) {
  const [values, setValues] = useState<string[]>([]);
  const [detail, setDetail] = useState("Loading fees");
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const data = object(await api("/v1/analytics/fees?range=" + period, undefined, controller.signal));
        if (controller.signal.aborted) return;
        if (data.status === "disabled" || data.status === "indexing") {
          setValues([]);
          setDetail(data.status === "disabled" ? "Fee collection disabled" : "Indexing fees");
        } else {
          if (data.status !== "ready" || !Array.isArray(data.totals)) throw new Error("Invalid fee totals");
          const totals = data.totals.map(value => {
            const {symbol, amount} = object(value);
            if (typeof symbol !== "string" || typeof amount !== "string" || !/^\d+(?:\.\d+)?$/.test(amount)) throw new Error("Invalid fee amount");
            return amount + " " + symbol;
          });
          setValues(totals.length ? totals : ["0"]);
          setDetail("Cadinal routing fees");
        }
      } catch {
        if (!controller.signal.aborted) { setValues([]); setDetail("Fees unavailable"); }
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 30000);
      }
    }
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [period]);
  return <>{(values.length ? values : ["—"]).map(value => <strong key={value}>{value}</strong>)}<small>{detail}</small></>;
}

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
  const [trades, setTrades] = useState<{swaps: string; traders: string; volume:string; daily:string} | null>(null);
  const [tradeStatus, setTradeStatus] = useState("Loading confirmed trades");
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const data = object(await api("/v1/analytics/trades", undefined, controller.signal));
        if (controller.signal.aborted) return;
        if (data.status === "indexing") {
          setTrades(null);
          setTradeStatus("Indexing confirmed trades");
        } else {
          if (data.status !== "ready" || typeof data.swaps !== "string" || typeof data.traders !== "string" ||
              !/^\d{1,30}$/.test(data.swaps) || !/^\d{1,30}$/.test(data.traders)) throw new Error("Invalid trade counts");
          const displayVolume = (value: unknown) => {
            if (typeof value !== "string" || !/^\d+(?:\.\d{1,6})?$/.test(value)) return "—";
            const [whole, fraction] = value.split(".");
            return BigInt(whole!).toLocaleString("en-US") + (fraction ? "." + fraction : "");
          };
          setTrades({volume: displayVolume(data.stableVolume), daily: displayVolume(data.stableVolume24h), swaps: BigInt(data.swaps).toLocaleString("en-US"), traders: BigInt(data.traders).toLocaleString("en-US")});
          setTradeStatus("Confirmed swaps");
        }
      } catch {
        if (!controller.signal.aborted) { setTrades(null); setTradeStatus("Analytics unavailable"); }
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 30000);
      }
    }
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);
  const [usersMetric, setUsersMetric] = useState<UsersMetric>({ status: "indexing", totalUsers: null });
  const [feePeriod, setFeePeriod] = useState<(typeof feePeriods)[number]>("24h");
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
  }, []);


  return <div className={styles.dashboard}>

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
            <strong>{trades?.daily ?? "—"}</strong>
            <small>USDC + USDT swap volume</small>
          </article>
          <article className={styles.miniMetric}>
            <span className={styles.metricLabel}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <circle cx="7" cy="6" r="3" /><circle cx="14" cy="7" r="2.3" />
                <path d="M1 16a6 6 0 0 1 12 0v1H1zm13.5 0a7.5 7.5 0 0 0-1.6-4.7A4.6 4.6 0 0 1 19 15.7v.8h-4.5z" />
              </svg>
              Total Traders
            </span>
            <strong>{trades?.traders ?? "—"}</strong>
            <small>{tradeStatus}</small>
          </article>
          <article className={styles.miniMetric}>
            <span className={styles.metricLabel}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 6.5h15m-3-3 3 3-3 3M17.5 13.5h-15m3-3-3 3 3 3" />
              </svg>
              Total Swaps
            </span>
            <strong>{trades?.swaps ?? "—"}</strong>
            <small>{tradeStatus}</small>
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
            <FeeTotals key={feePeriod} period={feePeriod} />
          </article>
        </div>
        <TransactionsCard />
      </div>
    </section>

    <Section title="All-Time" />
    <section className={styles.allTime} aria-labelledby="all-time-statistics">
      <div className={styles.allTimeMetric}>
        <h2 id="all-time-statistics" className={styles.allTimeTitle}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1 10h3v5H1zm5-4h3v9H6zm5-4h3v13h-3z" />
          </svg>
          All-Time Statistics
        </h2>
      </div>
      <AllTimeMetric
        label="Total Users"
        value={usersMetric.status === "ready" && usersMetric.totalUsers !== null
          ? new Intl.NumberFormat("en-US").format(BigInt(usersMetric.totalUsers)) : "—"}
        detail={usersMetric.status === "ready" ? `Unique wallets through block ${usersMetric.block}` : usersMetric.status === "indexing" ? "Indexing confirmed swap and LP history" : "Analytics unavailable"}
      />
      <AllTimeMetric label="Total Volume" value={trades?.volume ?? "—"} detail="USDC + USDT swap volume" />
      <AllTimeMetric label="Total Deposits (All Time)" />
      <AllTimeMetric label="Total Withdrawals (All Time)" />
      <div className={styles.allTimeMetric} aria-hidden="true" />
    </section>
    <Section title="User Growth" />
    <section className={styles.growthGrid} aria-label="User growth analytics">
      <GrowthCard title="Unique Traders by Asset" legends={["WQMS", "USDC", "WETH", "WBTC", "USDT", "Total unique traders"]} />
      <GrowthCard title="Cumulative New Users" legends={["Daily new users", "Cumulative new users"]} />
    </section>

    <Section title="Trading Activity" />
    <section className={styles.growthGrid + " " + styles.tradingActivity} aria-label="Trading activity analytics">
      <TradeCountCard />
      <DailyUsersCard />
    </section>

    <Section title="Liquidity & Top Users" />
    <section className={styles.growthGrid} aria-label="Liquidity and top user analytics">
      <SlippageCard />
      <TopUsersCard />
    </section>

    <footer className={styles.footer}>Data from Cadinal’s configured QMS Testnet contracts and API. Values are live snapshots, not historical records or financial advice.</footer>
  </div>;
}

function Section({ title }: { title: string }) { return <div className={styles.section}><span>{title}</span><i /></div>; }
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

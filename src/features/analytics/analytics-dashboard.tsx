"use client";

import { useEffect, useState } from "react";
import { api, object } from "@/features/trading/api";
import styles from "./analytics.module.css";

type UsersMetric = { status: "indexing" | "ready" | "unavailable"; totalUsers: string | null; block?: string };
const transactionRanges = ["24H", "7D", "30D", "90D", "1Y", "ALL"] as const;

function useDatePicker(preset:string) {
  const [calendar, setCalendar] = useState(false);
  const [custom, setCustom] = useState<{from:string; to:string}>();
  const today = new Date().toISOString().slice(0,10);
  const [from,setFrom] = useState(today);
  const [to,setTo] = useState(today);
  const label = custom ? custom.from + " – " + custom.to + " UTC" : undefined;
  return {custom,label,query:custom ? new URLSearchParams(custom).toString() : "range="+preset,
    clear:() => {setCalendar(false); setCustom(undefined);},
    button:<button type="button" aria-expanded={calendar} aria-pressed={!!custom} aria-label="Custom date range" title={label ?? "Custom date range"} onClick={() => setCalendar(!calendar)}><ChartIcon kind="calendar" /></button>,
    form:<>{calendar && <form className={styles.dateRange} onSubmit={event => {
      event.preventDefault();
      setCustom({from,to}); setCalendar(false);
    }}>
      <label>From (UTC)<input required type="date" value={from} max={to || today} onChange={e => setFrom(e.target.value)} /></label>
      <label>To (UTC)<input required type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} /></label>
      <button type="submit">Apply</button>
    </form>}</>,
  };
}

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

function TokenTotals({period}: {period?: (typeof feePeriods)[number]}) {
  const [values, setValues] = useState<string[]>([]);
  const [detail, setDetail] = useState(period ? "Loading fees" : "Loading withdrawals");
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const data = object(await api(period ? "/v1/analytics/fees?range=" + period : "/v1/analytics/withdrawals", undefined, controller.signal));
        if (controller.signal.aborted) return;
        if (data.status === "disabled" || data.status === "indexing") {
          setValues([]);
          setDetail(data.status === "disabled" ? "Fee collection disabled" : (period ? "Indexing fees" : "Indexing withdrawals"));
        } else {
          if (data.status !== "ready" || !Array.isArray(data.totals)) throw new Error("Invalid fee totals");
          const totals = data.totals.map(value => {
            const {symbol, amount} = object(value);
            if (typeof symbol !== "string" || typeof amount !== "string" || !/^\d+(?:\.\d+)?$/.test(amount)) throw new Error("Invalid fee amount");
            return amount + " " + symbol;
          });
          setValues(totals.length ? totals : ["0"]);
          setDetail(period ? "Cadinal routing fees" : "Cadinal pools · listed tokens");
        }
      } catch {
        if (!controller.signal.aborted) { setValues([]); setDetail(period ? "Fees unavailable" : "Withdrawals unavailable"); }
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

const volumeWindows = {"1D":"24H","7D":"7D","1M":"30D","3M":"90D","1Y":"1Y"} as const;

function formatVolume(raw: bigint) {
  const fraction = (raw % BigInt(1000000)).toString().padStart(6, "0").replace(/0+$/, "");
  return (raw / BigInt(1000000)).toLocaleString("en-US") + (fraction ? "." + fraction : "");
}

function VolumeCard() {
  const [mode, setMode] = useState<ChartMode>("bars");
  const [range, setRange] = useState<(typeof volumeRanges)[number]>("1M");

  const picker = useDatePicker(volumeWindows[range]);
  const {query,custom} = picker;
  const period = picker.label ?? range;
  const [series, setSeries] = useState<{range:string; points:{start:number; raw:bigint}[]; status:string}>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const data = object(await api("/v1/analytics/transactions?" + query, undefined, controller.signal));
        if (controller.signal.aborted) return;
        if (data.status === "indexing") {
          setSeries({range:query, points:[], status:"Indexing confirmed swaps"});
        } else {
          if (data.status !== "ready" || !Array.isArray(data.buckets) || data.buckets.length > 24) throw new Error("Invalid volume history");
          const points = data.buckets.map(value => {
            const {start, stableVolumeRaw} = object(value);
            if (typeof start !== "number" || !Number.isSafeInteger(start) || typeof stableVolumeRaw !== "string" ||
                !/^\d{1,100}$/.test(stableVolumeRaw)) throw new Error("Invalid volume bucket");
            return {start, raw:BigInt(stableVolumeRaw)};
          });
          setSeries({range:query, points, status:"No stablecoin volume in this period"});
        }
      } catch {
        if (!controller.signal.aborted) setSeries({range:query, points:[], status:"Volume history unavailable"});
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 30000);
      }
    }
    void refresh();
    return () => {controller.abort(); window.clearTimeout(timer);};
  }, [query]);
  const current = series?.range === query ? series : undefined;
  const points = current?.points ?? [];
  const total = points.reduce((sum, p) => sum + p.raw, BigInt(0));
  const peak = points.reduce((max, p) => p.raw > max ? p.raw : max, BigInt(0));
  const bars = points.map((p,i) => ({
    x:(i + 0.5) * 240 / points.length,
    y:100 - 100 * Number(p.raw) / Number(peak || BigInt(1)),
    label:new Date(p.start * 1000).toLocaleString() + " · " + formatVolume(p.raw) + " USDC + USDT",
  }));
  const line = bars.map(b => b.x + "," + b.y).join(" ");
  return <article className={styles.panel + " " + styles.featurePanel + " " + styles.volumePanel}>
    <header className={styles.volumeHeader}>
      <h2>Total Volume</h2>
      <div className={styles.chartControls}>
        <ChartTypeButtons mode={mode} onChange={setMode} />
        <div className={styles.periods} role="group" aria-label="Volume time range">
          {volumeRanges.map(value => <button key={value} type="button" aria-pressed={!custom && range === value} onClick={() => {picker.clear(); setRange(value);}}>{value}</button>)}
          {picker.button}
        </div>
      </div>
    </header>
    {picker.form}
    <div className={styles.featureValue}><strong>{points.length ? formatVolume(total) : "—"}</strong></div>
    <div className={styles.volumeChanges}><span>USDC + USDT swap volume · {period}</span></div>
    <div className={styles.volumePlot}>
      <span aria-hidden="true" className={styles.volumeWatermark}>Cadinal</span>
      {peak > BigInt(0) ? <svg className={styles.volumeSeries} viewBox="0 0 240 100" preserveAspectRatio="none" role="img" aria-label={period + " stablecoin swap volume"}>
        {mode === "area" && <polygon points={bars[0]!.x + ",100 " + line + " " + bars[bars.length-1]!.x + ",100"} fill="currentColor" opacity=".25" />}
        {mode !== "bars" && <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {bars.map((b,i) => <g key={points[i]!.start}>
          {mode === "bars" && <rect x={b.x-4} y={b.y} width="8" height={100-b.y} fill="currentColor" />}
          <rect x={b.x-5} width="10" height="100" fill="transparent"><title>{b.label}</title></rect>
        </g>)}
      </svg> : <span className={styles.volumeEmpty} role="status">{current?.status ?? "Loading volume history"}</span>}
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
            <TokenTotals key={feePeriod} period={feePeriod} />
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
      <article className={styles.allTimeMetric}><span>Total Withdrawals (All Time)</span><TokenTotals /></article>
      <div className={styles.allTimeMetric} aria-hidden="true" />
    </section>
    <Section title="User Growth" />
    <section className={styles.growthGrid} aria-label="User growth analytics">
      <ActivitySeriesCard series="assetTraders" />
      <ActivitySeriesCard series="growth" />
    </section>

    <Section title="Trading Activity" />
    <section className={styles.growthGrid + " " + styles.tradingActivity} aria-label="Trading activity analytics">
      <ActivitySeriesCard series="trades" />
      <ActivitySeriesCard series="active" />
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

function ActivitySeriesCard({series}: {series: "growth" | "trades" | "active" | "assetTraders"}) {
  const growth = series === "growth";
  const trades = series === "trades";
  const titles = {growth:"Cumulative New Users", trades:"Number of Trades", active:"Daily Active Users", assetTraders:"Unique Traders by Asset"};
  const [cumulative, setCumulative] = useState(growth);
  const [asset, setAsset] = useState("");
  const [range, setRange] = useState("M");
  const [mode, setMode] = useState<ChartMode>(growth ? "line" : "bars");
  const [result, setResult] = useState<{range:string; points:{start:number; count:number; total:number}[]; message:string}>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const data = object(await api((trades ? "/v1/analytics/trade-counts" : "/v1/analytics/daily-users") + "?range=" + range + (growth ? "&series=growth" : "") + (asset ? "&asset=" + asset : ""), undefined, controller.signal));
        if (controller.signal.aborted) return;
        if (data.status === "indexing") {
          setResult({range:range+asset, points:[], message:"Indexing confirmed swaps"});
        } else {
          if (data.status !== "ready" || !Array.isArray(data.buckets) || data.buckets.length > 365) throw new Error("Invalid wallet history");
          const points = data.buckets.map(value => {
            const {start,count,cumulative:total} = object(value);
            if (typeof start !== "number" || !Number.isSafeInteger(start) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid wallet count");
            if ((growth || trades) && (typeof total !== "number" || !Number.isSafeInteger(total) || total < count)) throw new Error("Invalid cumulative count");
            return {start,count,total:growth || trades ? Number(total) : count};
          });
          setResult({range:range+asset, points, message:trades ? "No trades in this period" : growth ? "No new swap wallets in this period" : "No active swap wallets in this period"});
        }
      } catch {
        if (!controller.signal.aborted) setResult({range:range+asset, points:[], message:"Activity history unavailable"});
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 30000);
      }
    }
    void refresh();
    return () => {controller.abort(); window.clearTimeout(timer);};
  }, [range,growth,trades,asset]);
  const current = result?.range === range+asset ? result : undefined;
  const points = (current?.points ?? []).map(p => ({...p, count:(growth || trades) && cumulative ? p.total : p.count}));
  const peak = Math.max(0,...points.map(p => p.count));
  const step = 365 / Math.max(1, points.length);
  const chart = points.map((p,i) => ({x:(i+.5)*step, y:99-98*p.count/(peak || 1),
    label:new Date(p.start*1000).toISOString().slice(0,10) + " UTC · " + p.count + (trades ? " trades" : " wallets")}));
  const line = chart.map(p => p.x + "," + p.y).join(" ");
  return <article className={styles.activityCard}>
    <div className={styles.growthHeading}><h2>{titles[series]}</h2></div>
    {(trades || series === "assetTraders") && <label>Input asset <select value={asset} onChange={event => setAsset(event.target.value)}>
      <option value="">All assets</option>{["WQMS","USDC","WETH","WBTC","USDT"].map(symbol => <option key={symbol}>{symbol}</option>)}
    </select></label>}
    {growth || trades ? <div className={styles.periods} role="group" aria-label={trades ? "Trade series" : "First-time swap wallets"}>
      <button type="button" aria-pressed={!cumulative} onClick={() => setCumulative(false)}>{trades ? "Daily trades" : "Daily new wallets"}</button>
      <button type="button" aria-pressed={cumulative} onClick={() => setCumulative(true)}>{trades ? "Cumulative trades" : "Cumulative wallets"}</button>
    </div> : <div className={styles.dailyLegend}><span><i />Unique swap wallets per UTC day</span></div>}
    <div className={styles.activityToolbar}>
      <ChartTypeButtons mode={mode} onChange={setMode} />
      <div className={styles.periods} role="group" aria-label={trades ? "Trade time range" : "Active wallet time range"}>
        {["D","W","M","Y"].map(value => <button key={value} aria-pressed={value === range} onClick={() => setRange(value)}>{value}</button>)}
      </div>
    </div>
    <div className={styles.growthChart}>
      {peak ? <svg className={styles.volumeSeries} viewBox="0 0 365 100" preserveAspectRatio="none" role="img" aria-label={trades ? "Confirmed trades by UTC day" : growth ? "Wallets by first confirmed swap, UTC" : "Unique swap wallets by day"}>
        {mode === "area" && <polygon points={chart[0]!.x + ",100 " + line + " " + chart[chart.length-1]!.x + ",100"} fill="currentColor" opacity=".25" />}
        {mode !== "bars" && <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {chart.map(p => <g key={p.x}>
          {mode === "bars" ? <rect x={p.x-step*.4} y={p.y} width={step*.8} height={100-p.y} opacity={p.y === 99 ? 0 : 1} fill="currentColor" /> : chart.length === 1 && <circle cx={p.x} cy={Math.max(2,p.y)} r="2" fill="currentColor" />}
          <rect x={p.x-step/2} width={step} height="100" fill="transparent"><title>{p.label}</title></rect>
        </g>)}
      </svg> : <div className={styles.growthUnavailable} role="status">{current?.message ?? "Loading activity"}</div>}
    </div>
  </article>;
}
function SlippageCard() {
  const [range,setRange] = useState("M");
  const [series,setSeries] = useState<{range:string; message:string; points:{day:number; percent:number; samples:number}[]}>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const data = object(await api("/v1/analytics/slippage?range=" + range, undefined, controller.signal));
        if (controller.signal.aborted) return;
        if (data.status === "indexing") setSeries({range,points:[],message:"Indexing confirmed swaps"});
        else {
          if (data.status !== "ready" || !Array.isArray(data.points) || data.points.length > 365) throw new Error("Invalid slippage history");
          const points = data.points.map(value => {
            const {day,percent,samples} = object(value);
            if (typeof day !== "number" || !Number.isSafeInteger(day) || typeof percent !== "number" || !Number.isFinite(percent) ||
                typeof samples !== "number" || !Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid slippage measurement");
            return {day,percent,samples};
          });
          setSeries({range,points,message:"No confirmed swaps matched a prepared quote in this period"});
        }
      } catch {
        if (!controller.signal.aborted) setSeries({range,points:[],message:"Slippage history unavailable"});
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh,30000);
      }
    }
    void refresh();
    return () => {controller.abort(); window.clearTimeout(timer);};
  },[range]);
  const current = series?.range === range ? series : undefined;
  const points = current?.points ?? [];
  const peak = Math.max(...points.map(p => Math.abs(p.percent)),0) || 1;
  const days = {D:1,W:7,M:30,Y:365}[range] ?? 30;
  const first = Math.floor(Date.now()/86400000)-days+1;
  return <article className={styles.activityCard}>
    <div className={styles.growthHeading}><h2>Slippage</h2></div>
    <div className={styles.activityToolbar}><span>Daily average · positive means less received</span>
      <div className={styles.periods} role="group" aria-label="Slippage time range">
        {["D","W","M","Y"].map(value => <button key={value} aria-pressed={value === range} onClick={() => setRange(value)}>{value}</button>)}
      </div>
    </div>
    <div className={styles.growthChart}>{points.length ? <svg className={styles.volumeSeries} viewBox="0 0 365 100" preserveAspectRatio="none" role="img" aria-label="Daily average execution slippage">
      <line x2="365" y1="50" y2="50" stroke="currentColor" opacity=".4" />
      {points.map(p => {
        const y = 50-46*p.percent/peak;
        return <rect key={p.day} x={(p.day-first+.1)*365/days} width={.8*365/days} y={Math.min(50,y)} height={Math.max(1,Math.abs(50-y))} fill="currentColor">
          <title>{new Date(p.day*86400000).toISOString().slice(0,10)} UTC · {p.percent.toFixed(3)}% · {p.samples} matched</title>
        </rect>;
      })}
    </svg> : <div className={styles.growthUnavailable} role="status">{current?.message ?? "Loading slippage"}</div>}</div>
  </article>;
}
function TopUsersCard() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{page:number; users:{wallet:string; volume:string}[]; hasNext:boolean; message:string}>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const data = object(await api("/v1/analytics/top-users?page=" + page, undefined, controller.signal));
        if (controller.signal.aborted) return;
        if (data.status === "indexing") {
          setResult({page, users:[], hasNext:false, message:"Indexing confirmed swaps"});
        } else {
          if (data.status !== "ready" || typeof data.hasNext !== "boolean" || !Array.isArray(data.users) || data.users.length > 10) throw new Error("Invalid leaderboard");
          const users = data.users.map(value => {
            const {wallet, stableVolumeRaw} = object(value);
            if (typeof wallet !== "string" || !/^0x[0-9a-f]{40}$/i.test(wallet) || typeof stableVolumeRaw !== "string" ||
                !/^\d{1,100}$/.test(stableVolumeRaw)) throw new Error("Invalid ranked wallet");
            return {wallet, volume:formatVolume(BigInt(stableVolumeRaw))};
          });
          setResult({page, users, hasNext:data.hasNext, message:"No ranked wallets on this page"});
        }
      } catch {
        if (!controller.signal.aborted) setResult({page, users:[], hasNext:false, message:"Rankings unavailable"});
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 30000);
      }
    }
    void refresh();
    return () => {controller.abort(); window.clearTimeout(timer);};
  }, [page]);
  const current = result?.page === page ? result : undefined;
  return <article className={styles.activityCard + " " + styles.topUsersCard}>
    <div className={styles.growthHeading}><h2>Top Users By Volume</h2></div>
    <div className={styles.usersTable}>
      <table className={styles.rankedWallets}>
        <thead><tr><th scope="col">Wallet</th><th scope="col">Volume (USDC + USDT)</th></tr></thead>
        <tbody>{current?.users.map((user,index) => <tr key={user.wallet}>
          <td title={user.wallet}>{(page-1)*10+index+1}. {user.wallet.slice(0,6)}…{user.wallet.slice(-4)}</td>
          <td>{user.volume}</td>
        </tr>)}</tbody>
      </table>
      {!current?.users.length && <div className={styles.usersEmpty} role="status">{current?.message ?? "Loading wallet rankings"}</div>}
      <div className={styles.usersTableFoot}><span>All-time stablecoin volume</span><div>
        <button disabled={page === 1} aria-label="Previous page" onClick={() => setPage(page-1)}>‹</button>
        <span>Page {page}</span>
        <button disabled={!current?.hasNext} aria-label="Next page" onClick={() => setPage(page+1)}>›</button>
      </div></div>
    </div>
  </article>;
}

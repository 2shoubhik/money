// Fetches daily closes for every holding, watchlist name and benchmark from
// Yahoo Finance and caches them in src/data/prices.json. If a fetch fails, the
// previously cached series is kept so the site still builds offline.
import { readFile, writeFile } from "node:fs/promises";

const PORTFOLIO = new URL("../src/data/portfolio.json", import.meta.url);
const CACHE = new URL("../src/data/prices.json", import.meta.url);

const { portfolios } = JSON.parse(await readFile(PORTFOLIO, "utf8"));
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE, "utf8"));
} catch {}

const dates = portfolios
  .flatMap((p) => [p.inceptionDate, ...p.holdings.map((h) => h.entryDate)])
  .filter(Boolean)
  .sort();
const start = new Date(dates[0]);
start.setDate(start.getDate() - 10); // a little slack before the first entry
const period1 = Math.floor(start.getTime() / 1000);
const period2 = Math.floor(Date.now() / 1000);

async function fetchSeries(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const r = json.chart?.result?.[0];
  if (!r?.timestamp) throw new Error("no data");
  const closes = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
  const out = { currency: r.meta.currency, dates: [], closes: [] };
  r.timestamp.forEach((t, i) => {
    if (closes[i] == null) return;
    out.dates.push(new Date((t + r.meta.gmtoffset) * 1000).toISOString().slice(0, 10));
    out.closes.push(+closes[i].toFixed(4));
  });
  return out;
}

const symbols = new Set(
  portfolios.flatMap((p) => [
    ...p.benchmarks.map((b) => b.symbol),
    ...p.holdings.filter((h) => h.ticker !== "CASH").map((h) => h.ticker),
    ...p.watchlist.map((w) => w.ticker),
  ])
);

const next = { updatedAt: new Date().toISOString(), series: {} };
let failed = 0;

async function load(symbol) {
  try {
    next.series[symbol] = await fetchSeries(symbol);
  } catch (e) {
    failed++;
    if (cache.series?.[symbol]) next.series[symbol] = cache.series[symbol];
    console.warn(`  ! ${symbol}: ${e.message}${cache.series?.[symbol] ? " (using cached)" : ""}`);
  }
}

await Promise.all([...symbols].map(load));

// FX: every non-USD currency (listings and portfolio bases) gets a USD rate
// series. Yahoo "CAD=X" = CAD per 1 USD.
const currencies = new Set([
  ...Object.values(next.series).map((s) => s.currency),
  ...portfolios.map((p) => p.currency),
]);
currencies.delete("USD");
currencies.delete(undefined);
await Promise.all([...currencies].map((c) => load(`${c}=X`)));

if (Object.keys(next.series).length === 0) {
  console.error("No price data fetched and no cache available.");
  process.exit(1);
}
await writeFile(CACHE, JSON.stringify(next));
console.log(`Prices: ${Object.keys(next.series).length} series saved${failed ? `, ${failed} failed` : ""}.`);

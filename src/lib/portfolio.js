// Build-time portfolio math. Each portfolio is measured in its own currency
// (USD for US & Canada, INR for India) and expressed as % returns and weights,
// so no position sizes are ever published.
import data from "../data/portfolio.json";
import prices from "../data/prices.json";

const S = prices.series;
export const updatedAt = prices.updatedAt;

// Units of `cur` per 1 USD on each calendar day (1 for USD).
function fxRate(cur, fill) {
  if (!cur || cur === "USD") return null;
  const fx = S[`${cur}=X`];
  return fx ? fill(fx) : null;
}

function build(p) {
  const base = p.currency ?? "USD";
  // Trading calendar from the portfolio's main benchmark.
  const calendar = S[p.benchmarks[0].symbol].dates.filter((d) => d >= p.inceptionDate);

  // Forward-fill a series onto the calendar (holidays, cross-listing gaps).
  const fill = (series) => {
    const map = new Map(series.dates.map((d, i) => [d, series.closes[i]]));
    let last = null;
    for (let i = 0; i < series.dates.length && series.dates[i] <= calendar[0]; i++) last = series.closes[i];
    return calendar.map((d) => (map.has(d) ? (last = map.get(d)) : last));
  };
  const baseRate = fxRate(base, fill);

  // Close in the portfolio's base currency for each calendar day.
  const cache = {};
  function inBase(symbol) {
    if (cache[symbol]) return cache[symbol];
    const s = S[symbol];
    if (!s) return null;
    const local = fill(s);
    const cur = s.currency ?? "USD";
    let out = local;
    if (cur !== base) {
      const from = fxRate(cur, fill); // local -> USD
      out = local.map((v, i) => {
        if (v == null) return null;
        const usd = from ? v / from[i] : v;
        return baseRate ? usd * baseRate[i] : usd;
      });
    }
    out.local = local;
    return (cache[symbol] = out);
  }

  const idxOn = (date) => {
    const i = calendar.findIndex((d) => d >= date);
    return i === -1 ? calendar.length - 1 : i;
  };

  const holdings = p.holdings
    .map((h) => {
      if (h.ticker === "CASH") return { ...h, isCash: true };
      const s = S[h.ticker];
      const series = inBase(h.ticker);
      const local = s?.closes ?? [];
      const entryDate = h.entryDate ?? p.inceptionDate;
      const ei = idxOn(entryDate);
      // a manual entryPrice is in the listing currency; scale it by that day's FX
      const entryBase = series ? (h.entryPrice ? (series[ei] * h.entryPrice) / series.local[ei] : series[ei]) : null;
      return {
        ...h,
        entryDate,
        displayTicker: h.ticker.replace(/\.(NS|BO)$/, ""),
        currency: s?.currency ?? base,
        price: local.at(-1),
        ret: series ? pct(entryBase, series.at(-1)) : null,
        day: local.length > 1 ? pct(local.at(-2), local.at(-1)) : null,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const watchlist = p.watchlist.map((w) => {
    const s = S[w.ticker];
    const c = s?.closes ?? [];
    const i1y = s ? s.dates.findIndex((d) => d >= shiftYear(s.dates.at(-1), -1)) : -1;
    return { ...w, displayTicker: w.ticker.replace(/\.(NS|BO)$/, ""), currency: s?.currency, price: c.at(-1), day: pct(c.at(-2), c.at(-1)), ret1y: i1y >= 0 ? pct(c[i1y], c.at(-1)) : null };
  });

  // Model portfolio index: fixed target weights, rebalanced daily. A holding
  // only counts from its entry date; until then its weight sits in cash.
  const live = holdings.filter((h) => !h.isCash).map((h) => ({ w: h.weight / 100, s: inBase(h.ticker), from: idxOn(h.entryDate) }));
  const port = [100];
  for (let t = 1; t < calendar.length; t++) {
    let r = 0;
    for (const h of live) if (h.s && t > h.from && h.s[t] && h.s[t - 1]) r += h.w * (h.s[t] / h.s[t - 1] - 1);
    port.push(port[t - 1] * (1 + r));
  }
  const index = (arr) => {
    const first = arr.find((v) => v != null);
    return arr.map((v) => +(((v ?? first) / first) * 100).toFixed(3));
  };

  const performance = {
    dates: calendar,
    series: [
      { name: "My portfolio", values: index(port) },
      ...p.benchmarks.map((b) => ({ name: b.name, values: index(inBase(b.symbol)) })),
    ],
  };
  const lastRet = (s) => s.values.at(-1) - 100;
  const weightSum = holdings.reduce((a, h) => a + h.weight, 0);

  return {
    id: p.id,
    name: p.name,
    currency: base,
    benchmarks: p.benchmarks,
    asOf: calendar.at(-1),
    holdings,
    watchlist,
    performance,
    weightSum,
    summary: {
      sinceInception: lastRet(performance.series[0]),
      benchmark: lastRet(performance.series[1]),
      benchmarkName: p.benchmarks[0].name,
      inceptionDate: p.inceptionDate,
      positions: holdings.filter((h) => !h.isCash).length,
      cash: holdings.find((h) => h.isCash)?.weight ?? 0,
    },
  };
}

function pct(a, b) {
  return a && b ? (b / a - 1) * 100 : null;
}
function shiftYear(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

export const portfolios = data.portfolios.map(build);

export const fmtPct = (v, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`);
const SYMBOL = { USD: "$", CAD: "C$", INR: "₹", EUR: "€", GBP: "£" };
export const fmtPrice = (v, cur = "USD") =>
  v == null
    ? "—"
    : `${SYMBOL[cur] ?? ""}${v.toLocaleString(cur === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${SYMBOL[cur] ? "" : ` ${cur}`}`;

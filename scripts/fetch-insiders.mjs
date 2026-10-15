// Pulls the last 90 days of insider open-market buys and sells (SEC Form 4)
// for every US/Canada holding and watchlist name, and caches a summary in
// src/data/insiders.json. Needs SEC_CONTACT_EMAIL: the SEC requires a contact
// address in the User-Agent of automated requests. Never fails the build.
import { readFile, writeFile } from "node:fs/promises";

const WINDOW_DAYS = 90;
const PORTFOLIO = new URL("../src/data/portfolio.json", import.meta.url);
const CACHE = new URL("../src/data/insiders.json", import.meta.url);

const contact = process.env.SEC_CONTACT_EMAIL;
if (!contact) {
  console.warn("Insiders: SEC_CONTACT_EMAIL not set, keeping cached data.");
  process.exit(0);
}
const UA = `money-site ${contact}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function sec(url, as = "json") {
  // SEC fair-access limit is 10 requests/second; stay well under it.
  const wait = last + 150 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return as === "json" ? res.json() : res.text();
}

// Form 4 fields are either <name>text</name> or <name><value>text</value>(<footnoteId/>)</name>.
const tag = (xml, name) =>
  (xml.match(new RegExp(`<${name}>\\s*<value>([^<]*)</value>`)) ?? xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)))?.[1]?.trim() ?? "";

const decode = (t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

function parseForm4(xml, cik) {
  // A company's filing list also holds Form 4s it files as an investor in
  // other companies (e.g. Alphabet's GV); only count trades in its own stock.
  if (+tag(xml, "issuerCik") !== +cik) return [];
  const owner = decode(tag(xml, "rptOwnerName"));
  const title = decode(tag(xml, "officerTitle")) || (tag(xml, "isDirector") === "1" ? "Director" : tag(xml, "isTenPercentOwner") === "1" ? "10% owner" : "Insider");
  const planned = tag(xml, "aff10b5One") === "1" || /10b5-1/i.test(xml.match(/<footnotes>[\s\S]*<\/footnotes>/)?.[0] ?? "");
  const trades = [];
  for (const [block] of xml.matchAll(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/g)) {
    const code = tag(block, "transactionCode");
    if (code !== "P" && code !== "S") continue; // open-market purchases and sales only
    const shares = +tag(block, "transactionShares");
    const price = +tag(block, "transactionPricePerShare");
    if (!shares || !price) continue;
    trades.push({ date: tag(block, "transactionDate"), type: code === "P" ? "buy" : "sell", shares, value: Math.round(shares * price), owner, title, planned });
  }
  return trades;
}

function signal(s) {
  if (!s.buys.value && !s.sells.value) return { key: "quiet", label: "No open-market trades" };
  if (s.buys.value > s.sells.value) return { key: "buying", label: "Insider buying" };
  if (s.sells.value < 1e6) return { key: "light", label: "Light selling" }; // under $1M total is noise
  // Sales made under pre-arranged 10b5-1 plans say little about an insider's
  // current view, so judge only the unplanned part against any buying.
  const unplanned = s.sells.value - s.sells.planned;
  if (unplanned <= s.buys.value || s.sells.planned / s.sells.value >= 0.75) return { key: "routine", label: "Routine selling" };
  return { key: "selling", label: "Net selling" };
}

const { portfolios } = JSON.parse(await readFile(PORTFOLIO, "utf8"));
let cache = { tickers: {} };
try { cache = JSON.parse(await readFile(CACHE, "utf8")); } catch {}

const symbols = [...new Set(portfolios.flatMap((p) => [...p.holdings, ...p.watchlist].map((h) => h.ticker)))]
  .filter((t) => t && t !== "CASH" && !/\.(NS|BO)$|-USD$/.test(t));

const out = { updatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, tickers: {} };
const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10);

let map;
try {
  const raw = await sec("https://www.sec.gov/files/company_tickers.json");
  map = Object.fromEntries(Object.values(raw).map((v) => [v.ticker, v.cik_str]));
} catch (e) {
  console.warn(`Insiders: ${e.message}, keeping cached data.`);
  process.exit(0);
}

for (const symbol of symbols) {
  const base = symbol.replace(/\.(TO|V)$/, "").replace("-", ".");
  const cik = map[base] ?? map[base.replace(".", "-")];
  if (!cik) { out.tickers[symbol] = { status: "not-sec" }; continue; }
  try {
    const sub = await sec(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`);
    const r = sub.filings.recent;
    const filings = r.form.map((f, i) => ({ f, date: r.filingDate[i], acc: r.accessionNumber[i], doc: r.primaryDocument[i] }))
      .filter((x) => x.f === "4" && x.date >= since);
    const trades = [];
    for (const x of filings) {
      const doc = x.doc.replace(/^xslF345X\d+\//, "");
      try {
        trades.push(...parseForm4(await sec(`https://www.sec.gov/Archives/edgar/data/${cik}/${x.acc.replace(/-/g, "")}/${doc}`, "text"), cik));
      } catch (e) { console.warn(`  ! ${symbol} ${x.acc}: ${e.message}`); }
    }
    const sum = (type) => {
      const t = trades.filter((x) => x.type === type);
      return { value: t.reduce((a, x) => a + x.value, 0), planned: t.filter((x) => x.planned).reduce((a, x) => a + x.value, 0), insiders: new Set(t.map((x) => x.owner)).size, trades: t.length };
    };
    const s = { status: "ok", filings: filings.length, buys: sum("buy"), sells: sum("sell") };
    // Biggest trades per insider, so one person's 40 small sales don't crowd the list.
    const byOwner = {};
    for (const t of trades) {
      const k = `${t.owner}|${t.type}`;
      byOwner[k] ??= { owner: t.owner, title: t.title, type: t.type, value: 0, planned: t.planned, last: t.date };
      byOwner[k].value += t.value;
      if (t.date > byOwner[k].last) byOwner[k].last = t.date;
    }
    s.top = Object.values(byOwner).sort((a, b) => b.value - a.value).slice(0, 5);
    s.signal = signal(s);
    out.tickers[symbol] = s;
    console.log(`  ${symbol}: ${filings.length} Form 4s, ${s.signal.label}`);
  } catch (e) {
    console.warn(`  ! ${symbol}: ${e.message}`);
    if (cache.tickers?.[symbol]) out.tickers[symbol] = cache.tickers[symbol];
  }
}

await writeFile(CACHE, JSON.stringify(out, null, 1));
console.log(`Insiders: ${Object.keys(out.tickers).length} tickers saved.`);

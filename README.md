# Investing site

A static Astro site with a live portfolio dashboard and research posts.

## Everyday use

| To... | Do this |
|---|---|
| Add or change a holding | Edit `src/data/portfolio.json`. Each entry under `portfolios` is a tab (US & Canada, India); set ticker, weight %, entry date and an optional `post` slug |
| Add another portfolio tab | Add a new object to `portfolios` with its own `id`, `currency` and benchmarks |
| Write research | Copy `src/posts/_template.md` to `src/posts/<slug>.md`, fill it in, and delete `draft: true` |
| Change your name, handle or domain | Edit `src/config.js` |
| Preview locally | `npm run dev`, then open http://localhost:4321 |
| Refresh prices locally | `npm run prices` |
| Refresh retail pulse locally | `npm run sentiment` (attention works with no setup; chatter needs `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` and `ANTHROPIC_API_KEY` in `.env`) |
| Refresh insider trades locally | `npm run insiders` (needs `SEC_CONTACT_EMAIL` in a local `.env` file, which is git-ignored) |

Tickers use Yahoo Finance symbols: `AAPL`, `BRK-B`, `SHOP.TO` (TSX), `RELIANCE.NS` (NSE). Non-USD listings are converted to USD automatically.

## Privacy

Only weights and % returns are published. Don't add share counts or amounts to `portfolio.json`, because the repo (and the JSON) may be public.

## Deploying (Vercel)

1. Push this folder to a GitHub repo.
2. In Vercel, choose **Add New → Project**, import the repo, and keep the detected Astro settings (build `npm run build`, output `dist`).
3. Daily prices: in Vercel, open **Settings → Git → Deploy Hooks** and create a hook on `main`. Copy its URL into GitHub as a repo secret named `VERCEL_DEPLOY_HOOK` (**Settings → Secrets and variables → Actions**). `.github/workflows/daily-rebuild.yml` then triggers a rebuild every weekday after market close.
4. Insider data: in Vercel, open **Settings → Environment Variables** and add `SEC_CONTACT_EMAIL` (the SEC requires a contact address on automated requests). Without it, builds reuse the last committed `src/data/insiders.json`.
5. Retail pulse chatter: add `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` and `ANTHROPIC_API_KEY` as Vercel environment variables. Without them the panel shows Wikipedia attention only.
6. Set `url` in `src/config.js` to your Vercel (or custom) domain.

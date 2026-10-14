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

Tickers use Yahoo Finance symbols: `AAPL`, `BRK-B`, `SHOP.TO` (TSX), `RELIANCE.NS` (NSE). Non-USD listings are converted to USD automatically.

## Privacy

Only weights and % returns are published. Don't add share counts or amounts to `portfolio.json`, because the repo (and the JSON) may be public.

## Deploying

1. Create a GitHub repo and push this folder to it.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` builds on every push and every weekday after market close, so prices stay current without you doing anything.
4. Optional: add a custom domain under Settings → Pages, then set `url` in `src/config.js`.

Vercel or Netlify also work: import the repo, set the build command to `npm run build`, and set the output directory to `dist`.

# Token Usage Dashboard

A local dashboard that reuses your logged-in Microsoft Edge profile to show today's token usage, query volume, spend, and balance across multiple providers.

What it shows:
- tokens used today
- total queries today
- estimated cost today
- provider-level usage and balance details
- per-provider refresh buttons and direct dashboard links

## Supported providers

- `right-code`
- `micu`
- `packy`

## Requirements

1. Node.js
2. Microsoft Edge
3. A logged-in Edge profile for the providers you want to scrape

## Quick start

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Edit `.env`:

```bash
PORT=8088
EDGE_PROFILE_PATH=/home/username/.config/microsoft-edge-dashboard
PROVIDERS=right-code,micu,packy
```

3. Install dependencies:

```bash
npm install
```

4. Install the Playwright browser runtime:

```bash
npm run install-browsers
```

5. Open the dedicated Edge profile and log in once:

```bash
node setup-profile.js
```

Log in to any providers you want to use:
- `https://www.right.codes`
- `https://www.packyapi.com`
- `https://www.openclaudecode.cn`

6. Start the dashboard:

```bash
node server.js
```

7. Open `http://localhost:8088`

## How it works

- The server defaults to today's date in `Asia/Shanghai` when fetching usage.
- The dashboard reuses your Edge profile session instead of storing provider credentials in `.env`.
- Each provider reads its own console or log pages through Playwright.
- The main refresh button reloads all enabled providers.
- The small refresh icon on a provider card reloads only that provider and recalculates the combined totals.

## Configuration

Main settings in `.env`:

- `PORT` - local server port
- `EDGE_PROFILE_PATH` - Edge profile path to reuse for scraping
- `PROVIDERS` - comma-separated provider ids
- `RIGHT_CODE_COST_MULTIPLIER` - optional cost multiplier for Right Code

Optional provider display names:

- `RIGHT_CODE_PROVIDER_ID`
- `MICU_PROVIDER_ID`
- `PACKY_PROVIDER_ID`

## Notes

- If a provider is not logged in, only that provider should fail; the dashboard still renders the others.
- If your main Edge profile is already in use, a dedicated profile path is the safest option.
- `setup-profile.js` is only a convenience tool for opening the configured Edge profile and logging in.

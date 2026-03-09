# Token Usage Dashboard

A lightweight web app that automatically scrapes token usage from multiple providers using a separate Edge browser profile:

- Total tokens and estimated cost
- Account metrics (balance remaining, spent today, expiration day)
- Today metrics (tokens used today, total queries today)
- Per-provider status and totals

## Prerequisites

1. **Node.js** (v14 or higher)
2. **Microsoft Edge** browser

## Quick start

### Option 1: Use a Separate Edge Profile (Recommended)

This approach creates a dedicated Edge profile for the dashboard, so you can keep your main Edge browser running without conflicts.

1. Copy example env file:

```bash
cp .env.example .env
```

2. Edit `.env` and configure the separate profile:

```
# Use a separate Edge profile for scraping
EDGE_PROFILE_PATH=/home/username/.config/microsoft-edge-dashboard

# Enable providers
PROVIDERS=right-code,packy
```

3. Install dependencies:

```bash
npm install
```

4. Install Playwright browsers:

```bash
npm run install-browsers
```

5. **First-time setup** - Log in to providers:

```bash
npm run setup-profile
```

This opens Edge with your dashboard profile. Log in to:
- https://www.right.codes
- https://www.packyapi.com
- https://www.openclaudecode.cn

Press Ctrl+C when done.

6. Start the server:

```bash
node server.js
```

7. Open `http://localhost:8088` and click "Refresh usage"

### Option 2: Use Your Default Edge Profile

If you prefer to use your main Edge profile, you can omit `EDGE_PROFILE_PATH` from `.env`. However, you'll need to close Edge before refreshing the dashboard (Playwright can't access a profile that's already in use).

## How it works

This dashboard uses **Playwright** to access an Edge browser profile:

1. **Separate Profile**: Uses a dedicated Edge profile to avoid conflicts with your main browser
2. **Headless Scraping**: Runs in the background without opening browser windows
3. **Automatic Scraping**: Navigates to dashboards and extracts data automatically
4. **Always Fresh**: Each refresh fetches real-time data from provider dashboards
5. **No Credentials Needed**: Just log in once in the separate profile using `npm run setup-profile`

### Why This Approach?

- ✅ **No credentials in .env** - more secure
- ✅ **Reuses your logins** - log in once, use forever
- ✅ **Works with any auth method** - OAuth, 2FA, SSO, etc.
- ✅ **Keep your main browser running** - separate profile means no conflicts
- ✅ **Runs in background** - headless mode for seamless operation

## Providers

Current provider status:

- `right-code` - ✅ Implemented (uses your Edge login)
- `micu` - ✅ Implemented (uses your Edge login)
- `packy` - ✅ Implemented (uses your Edge login)
- `openai` - ⚠️ Placeholder (needs implementation)
- `anthropic` - ⚠️ Placeholder (needs implementation)
- `custom` - ✅ API-based (works without Playwright)

Set `PROVIDERS=right-code,micu,packy` in `.env` to enable providers.

## Configuration

### Right Code

Optional environment variables:
- `RIGHT_CODE_COST_MULTIPLIER` - Multiply costs (e.g., 0.14 for CNY to USD)
- `RIGHT_CODE_PROVIDER_ID` - Override provider display name

### Micu

Optional environment variables:
- `MICU_PROVIDER_ID` - Override provider display name

### Packy

Optional environment variables:
- `PACKY_PROVIDER_ID` - Override provider display name

## Provider model

Providers return normalized data:

```json
{
  "provider": "right-code",
  "totals": {
    "inputTokens": 0,
    "outputTokens": 0,
    "totalTokens": 1720000,
    "queryCount": 15,
    "costUsd": 3.05
  },
  "daily": [
    {
      "date": "2026-03-03",
      "inputTokens": 0,
      "outputTokens": 0,
      "totalTokens": 1720000,
      "queryCount": 15,
      "costUsd": 3.05
    }
  ],
  "account": {
    "balanceRemainingUsd": 12.38,
    "balanceExpirationDate": "2026-03-30"
  }
}
```

## Troubleshooting

### "Not logged in" error

If you see this error:
1. Open Edge (not Chromium)
2. Go to the provider website (right.codes or packyapi.com)
3. Log in manually
4. Keep Edge open or just stay logged in
5. Try refreshing the dashboard again

### Edge profile not found

Make sure you have Google Edge installed (not just Chromium). The dashboard looks for Edge in these locations:
- **Windows**: `%LOCALAPPDATA%\Google\Edge\User Data`
- **macOS**: `~/Library/Application Support/Google/Edge`
- **Linux**: `~/.config/google-edge`

### Multiple Edge profiles

The dashboard uses your default Edge profile. If you use multiple profiles, make sure you're logged in with your default profile.

## Security Notes

- No credentials stored in `.env` file
- Uses your existing Edge profile and cookies
- Browser runs in non-headless mode so you can see what's happening
- All scraping happens locally on your machine

## Notes

- Browser automation runs in non-headless mode (you'll see Edge windows briefly)
- Uses your existing Edge profile and sessions
- Each refresh fetches fresh data directly from provider dashboards
- If one provider fails, the dashboard still renders successful providers
- First scrape may take 5-10 seconds, subsequent requests are similar

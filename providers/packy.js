const { mergeUsageTotals, normalizeDailyRecords, toNumber } = require("./utils");
const { withEdgePage } = require("./edge-browser");

/**
 * Packy provider using Playwright browser automation.
 * 
 * This provider uses your existing Edge profile, so if you're already logged in
 * to packyapi.com in Edge, it will reuse that session automatically.
 * 
 * No credentials needed in .env - just log in manually in Edge once!
 */

async function scrapePackyData(envPrefix, env, runtime) {
  return withEdgePage(runtime, env, async (page) => {
    // Navigate to console
    await page.goto("https://www.packyapi.com/console", { 
      waitUntil: "domcontentloaded", 
      timeout: 60000
    });
    
    // Wait for the page to be fully loaded
    await page.waitForTimeout(3000);
    
    // Check if we're on the login page or need to authenticate
    const needsLogin = await page.evaluate(() => {
      return document.body.textContent.includes('登录') || 
             document.body.textContent.includes('login') ||
             document.URL.includes('/login') ||
             document.querySelector('input[type="password"]') !== null;
    });
    
    if (needsLogin) {
      throw new Error(
        `Not logged in to Packy. Please:\n` +
        `1. Open Edge and go to https://www.packyapi.com\n` +
        `2. Log in manually\n` +
        `3. Keep Edge open and try refreshing the dashboard again`
      );
    }
    
    // Extract usage data
    return page.evaluate(() => {
      const text = document.body.textContent;
      
      // Extract balance
      const balanceMatch = text.match(/当前余额[^$]*\$\s*([0-9.]+)/);
      const balanceRemainingUsd = balanceMatch ? parseFloat(balanceMatch[1]) : null;
      
      // Extract cost
      const costMatch = text.match(/统计额度[^$]*\$\s*([0-9.]+)/);
      const totalCost = costMatch ? parseFloat(costMatch[1]) : 0;
      
      // Extract tokens
      const tokensMatch = text.match(/统计Tokens[^0-9]*([0-9,]+)/);
      let totalTokens = 0;
      if (tokensMatch) {
        totalTokens = parseInt(tokensMatch[1].replace(/,/g, ''), 10);
      }
      
      // Extract requests
      const requestsMatch = text.match(/请求次数[^0-9]*([0-9,]+)/);
      const totalRequests = requestsMatch ? parseInt(requestsMatch[1].replace(/,/g, ''), 10) : 0;
      
      const today = new Date().toISOString().slice(0, 10);
      
      return {
        daily: [{
          date: today,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: totalTokens,
          queryCount: totalRequests,
          costUsd: totalCost
        }],
        balanceRemainingUsd,
        balanceExpirationDate: null,
        balanceRemainingText: null,
        balanceExpirationText: "No expiry",
        scrapedAt: new Date().toISOString()
      };
    });
  });
}

/**
 * Generic factory for a Packy billing provider.
 * @param {string} envPrefix  - env var prefix, e.g. "PACKY"
 * @param {string} defaultId  - fallback providerId string
 */
function createPackyProvider(envPrefix, defaultId) {
  async function fetchUsage({ start, end, env, runtime }) {
    try {
      const data = await scrapePackyData(envPrefix, env, runtime);
      const todayDaily = Array.isArray(data.daily) ? data.daily[0] || null : null;
      
      // Filter by date range
      const daily = normalizeDailyRecords(
        (data.daily || []).filter(item => {
          return item.date >= start && item.date <= end;
        })
      );

      const totals = mergeUsageTotals(daily);

      const providerId = env[`${envPrefix}_PROVIDER_ID`] || defaultId;

      return {
        provider: providerId,
        totals,
        daily,
        todayDaily,
        account: {
          balanceRemainingUsd: data.balanceRemainingUsd || null,
          balanceExpirationDate: data.balanceExpirationDate || null,
          balanceRemainingText: data.balanceRemainingText || null,
          balanceExpirationText: data.balanceExpirationText || null,
        },
        meta: {
          supportsTokenBreakdown: false,
          supportsQueryCount: false,
        },
      };
    } catch (error) {
      throw new Error(`${envPrefix} provider failed: ${error.message}`);
    }
  }

  return {
    providerId: defaultId,
    fetchUsage,
  };
}

module.exports = { createPackyProvider };

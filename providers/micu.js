const { mergeUsageTotals, normalizeDailyRecords, toNumber } = require("./utils");
const { withEdgePage } = require("./edge-browser");

/**
 * Micu (米醋API) provider using Playwright browser automation.
 * 
 * This provider uses your existing Edge profile, so if you're already logged in
 * to openclaudecode.cn in Edge, it will reuse that session automatically.
 * 
 * No credentials needed in .env - just log in manually in Edge once!
 */

async function scrapeMicuData(env, runtime) {
  return withEdgePage(runtime, env, async (page) => {
    // Navigate to console
    await page.goto("https://www.openclaudecode.cn/console", { 
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
        `Not logged in to Micu. Please:\n` +
        `1. Open Edge and go to https://www.openclaudecode.cn\n` +
        `2. Log in manually\n` +
        `3. Keep Edge open and try refreshing the dashboard again`
      );
    }
    
    // Extract usage data
    return page.evaluate(() => {
      const text = document.body.textContent;
      
      // Extract balance (当前余额)
      const balanceMatch = text.match(/当前余额[^$]*\$\s*([0-9.]+)/);
      const balanceRemainingUsd = balanceMatch ? parseFloat(balanceMatch[1]) : null;
      
      // Extract historical consumption (历史消耗)
      const costMatch = text.match(/历史消耗[^$]*\$\s*([0-9.]+)/);
      const totalCost = costMatch ? parseFloat(costMatch[1]) : 0;
      
      // Extract tokens (统计Tokens)
      const tokensMatch = text.match(/统计Tokens[^0-9]*([0-9,]+)/);
      let totalTokens = 0;
      if (tokensMatch) {
        totalTokens = parseInt(tokensMatch[1].replace(/,/g, ''), 10);
      }
      
      // Extract request count (请求次数)
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
        scrapedAt: new Date().toISOString()
      };
    });
  });
}

async function fetchUsage({ start, end, env, runtime }) {
  try {
    const data = await scrapeMicuData(env, runtime);
    const todayDaily = Array.isArray(data.daily) ? data.daily[0] || null : null;
    
    // Filter by date range
    const daily = normalizeDailyRecords(
      (data.daily || []).filter(item => {
        return item.date >= start && item.date <= end;
      })
    );

    const totals = mergeUsageTotals(daily);

    return {
      provider: env.MICU_PROVIDER_ID || "micu",
      totals,
      daily,
      todayDaily,
      account: {
        balanceRemainingUsd: data.balanceRemainingUsd || null,
        balanceExpirationDate: data.balanceExpirationDate || null,
      },
    };
  } catch (error) {
    throw new Error(`Micu provider failed: ${error.message}`);
  }
}

module.exports = {
  providerId: "micu",
  fetchUsage,
};

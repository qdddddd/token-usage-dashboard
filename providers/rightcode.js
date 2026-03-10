const { getShanghaiDateString, mergeUsageTotals, normalizeDailyRecords, toNumber } = require("./utils");
const { withEdgePage } = require("./edge-browser");

/**
 * Right Code provider using Playwright browser automation.
 * 
 * This provider uses your existing Edge profile, so if you're already logged in
 * to right.codes in Edge, it will reuse that session automatically.
 * 
 * No credentials needed in .env - just log in manually in Edge once!
 */

async function scrapeRightCodeData(env, runtime) {
  return withEdgePage(runtime, env, async (page) => {
    // Navigate to dashboard
    await page.goto("https://www.right.codes/dashboard", { 
      waitUntil: "domcontentloaded", 
      timeout: 60000
    });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Check if we need to log in
    const isLoginPage = await page.evaluate(() => {
      return document.body.textContent.includes('登录') || 
             document.body.textContent.includes('login') ||
             document.URL.includes('/login');
    });
    
    if (isLoginPage) {
      throw new Error(
        'Not logged in to Right Code. Please:\n' +
        '1. Open Edge and go to https://www.right.codes\n' +
        '2. Log in manually\n' +
        '3. Keep Edge open and try refreshing the dashboard again'
      );
    }
    
    // Extract usage data
    return page.evaluate(() => {
      const text = document.body.textContent;
      
      const requestsMatch = text.match(/累计请求\s*(\d+)/);
      const tokensMatch = text.match(/累计\s*Token\s*([\d.]+[MK]?)/);
      const costMatch = text.match(/累计花费\s*\$\s*([\d.]+)/);
      
      let totalRequests = requestsMatch ? parseInt(requestsMatch[1], 10) : 0;
      let totalTokens = 0;
      let totalCost = costMatch ? parseFloat(costMatch[1]) : 0;
      
      if (tokensMatch) {
        const tokensText = tokensMatch[1];
        if (tokensText.includes('M')) {
          totalTokens = parseFloat(tokensText.replace(/[^0-9.]/g, '')) * 1000000;
        } else if (tokensText.includes('K')) {
          totalTokens = parseFloat(tokensText.replace(/[^0-9.]/g, '')) * 1000;
        } else {
          totalTokens = parseFloat(tokensText);
        }
      }
      
      const balanceMatch = text.match(/余额:\s*\$\s*([0-9.]+)/);
      const balanceRemainingUsd = balanceMatch ? parseFloat(balanceMatch[1]) : null;
      
      const expiryMatch = text.match(/到期时间[^0-9]*(\d{4}-\d{2}-\d{2})/);
      const balanceExpirationDate = expiryMatch ? expiryMatch[1] : null;
      
      const today = new Date().toISOString().slice(0, 10);
      
      return {
        daily: [{
          date: today,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: Math.round(totalTokens),
          queryCount: totalRequests,
          costUsd: totalCost
        }],
        balanceRemainingUsd,
        balanceExpirationDate,
        scrapedAt: new Date().toISOString()
      };
    });
  });
}

async function fetchUsage({ start, end, env, runtime }) {
  try {
    const data = await scrapeRightCodeData(env, runtime);
    const todayDate = getShanghaiDateString();
    const todayDaily = Array.isArray(data.daily) && data.daily[0]
      ? { ...data.daily[0], date: todayDate }
      : null;
    
    // Filter by date range
    const daily = normalizeDailyRecords(
      (data.daily || []).map((item) => ({ ...item, date: todayDate })).filter(item => {
        return item.date >= start && item.date <= end;
      })
    );

    const costMultiplier = toNumber(env.RIGHT_CODE_COST_MULTIPLIER) || 1;
    const adjustedDaily = daily.map(item => ({
      ...item,
      costUsd: item.costUsd * costMultiplier
    }));

    const totals = mergeUsageTotals(adjustedDaily);

    return {
      provider: env.RIGHT_CODE_PROVIDER_ID || "right-code",
      totals,
      daily: adjustedDaily,
      todayDaily,
      account: {
        balanceRemainingUsd: data.balanceRemainingUsd || null,
        balanceExpirationDate: data.balanceExpirationDate || null,
      },
    };
  } catch (error) {
    throw new Error(`Right Code provider failed: ${error.message}`);
  }
}

module.exports = {
  providerId: "right-code",
  fetchUsage,
};

const { getShanghaiDateString, mergeUsageTotals, normalizeDailyRecords, parseShanghaiDateTime } = require("./utils");
const { withEdgePage } = require("./edge-browser");

const PACKY_CONSOLE_URL = "https://www.packyapi.com/console";
const PACKY_CONSUMPTION_LOG_URL = "https://www.packyapi.com/console/consumption-log";

/**
 * Packy provider using Playwright browser automation.
 * 
 * This provider uses your existing Edge profile, so if you're already logged in
 * to packyapi.com in Edge, it will reuse that session automatically.
 * 
 * No credentials needed in .env - just log in manually in Edge once!
 */

function buildUnixTimestamp(dateStr, isEnd) {
  const value = parseShanghaiDateTime(dateStr, isEnd);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid Packy date: ${dateStr}`);
  }
  return Math.floor(value / 1000);
}

function isLoginScreen(text, url) {
  return text.includes("登录") || text.toLowerCase().includes("login") || url.includes("/login");
}

function parseConsoleSummary(text) {
  const balanceMatch = text.match(/当前余额[^$]*\$\s*([0-9.]+)/);
  const costMatch = text.match(/统计额度[^$]*\$\s*([0-9.]+)/);
  const tokensMatch = text.match(/统计Tokens[^0-9]*([0-9,]+)/);

  return {
    balanceRemainingUsd: balanceMatch ? parseFloat(balanceMatch[1]) : null,
    totalCost: costMatch ? parseFloat(costMatch[1]) : 0,
    totalTokens: tokensMatch ? parseInt(tokensMatch[1].replace(/,/g, ""), 10) : 0,
  };
}

async function selectConsoleTodayTab(page) {
  const todayLabel = "当天";
  const tabClicked = await page.evaluate((label) => {
    const elements = Array.from(document.querySelectorAll("button, [role=tab], .semi-tabs-tab, .semi-segmented-item, div, span, a"));
    const match = elements.find((element) => {
      const text = (element.textContent || "").trim();
      return text === label;
    });

    if (!match) {
      return false;
    }

    match.click();
    return true;
  }, todayLabel);

  if (!tabClicked) {
    throw new Error("Unable to find the Packy console '当天' statistics tab");
  }

  await page.waitForTimeout(1500);
}

async function fetchConsumptionLogQueryCount(page, start, end) {
  const startTimestamp = buildUnixTimestamp(start, false);
  const endTimestamp = buildUnixTimestamp(end, true);

  return page.evaluate(async ({ endTimestamp: endTs, startTimestamp: startTs }) => {
    let currentUserId = -1;
    try {
      const rawUser = localStorage.getItem("user");
      const parsedUser = rawUser ? JSON.parse(rawUser) : null;
      const userId = parsedUser?.id ?? -1;
      currentUserId = Number.isFinite(Number(userId)) && Number(userId) > 0 ? Number(userId) : -1;
    } catch {
      currentUserId = -1;
    }

    if (currentUserId <= 0) {
      throw new Error("Unable to identify the Packy account from local storage");
    }

    const params = new URLSearchParams({
      p: "1",
      page_size: "1",
      type: "0",
      token_name: "",
      model_name: "",
      start_timestamp: String(startTs),
      end_timestamp: String(endTs),
      group: "",
    });

    const response = await fetch(`/api/log/self/?${params.toString()}`, {
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "New-Api-User": String(currentUserId),
      },
    });

    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || `Packy log request failed (${response.status})`);
    }

    const total = Number(payload?.data?.total);
    if (Number.isFinite(total)) {
      return total;
    }

    const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    return items.length;
  }, { startTimestamp, endTimestamp });
}

async function scrapePackyData(start, end, env, runtime) {
  return withEdgePage(runtime, env, async (page) => {
    await page.goto(PACKY_CONSOLE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    const consoleState = await page.evaluate(() => {
      return {
        text: document.body.innerText,
        url: document.URL,
      };
    });

    if (isLoginScreen(consoleState.text, consoleState.url)) {
      throw new Error(
        "Not logged in to Packy. Open Edge, sign in at https://www.packyapi.com, then refresh again."
      );
    }

    await selectConsoleTodayTab(page);

    const todayConsoleState = await page.evaluate(() => ({
      text: document.body.innerText,
      url: document.URL,
    }));

    if (isLoginScreen(todayConsoleState.text, todayConsoleState.url)) {
      throw new Error(
        "Not logged in to Packy. Open Edge, sign in at https://www.packyapi.com, then refresh again."
      );
    }

    const { balanceRemainingUsd, totalCost, totalTokens } = parseConsoleSummary(todayConsoleState.text);

    await page.goto(PACKY_CONSUMPTION_LOG_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2500);

    const logState = await page.evaluate(() => ({
      text: document.body.innerText,
      url: document.URL,
    }));

    if (isLoginScreen(logState.text, logState.url)) {
      throw new Error(
        "Not logged in to Packy. Open Edge, sign in at https://www.packyapi.com, then refresh again."
      );
    }

    const totalRequests = await fetchConsumptionLogQueryCount(page, start, end);
    const today = getShanghaiDateString();

    return {
      daily: [{
        date: today,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens,
        queryCount: totalRequests,
        costUsd: totalCost,
      }],
      balanceRemainingUsd,
      balanceExpirationDate: null,
      balanceRemainingText: null,
      balanceExpirationText: "No expiry",
      scrapedAt: new Date().toISOString(),
    };
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
      const data = await scrapePackyData(start, end, env, runtime);
      const todayDate = getShanghaiDateString();
      const todayDaily = Array.isArray(data.daily)
        ? data.daily.find((item) => item.date === todayDate) || null
        : null;
      const daily = Array.isArray(data.daily) ? data.daily : [];

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
          supportsQueryCount: true,
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

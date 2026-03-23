const { getShanghaiDateString, mergeUsageTotals, normalizeDailyRecords } = require("./utils");
const { withEdgePage } = require("./edge-browser");

const TIMICC_DASHBOARD_URL = "https://timicc.com/dashboard";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
}

function parseCompactNumber(value) {
  const match = String(value || "")
    .trim()
    .replace(/,/g, "")
    .match(/^([0-9]+(?:\.[0-9]+)?)([KMB])?$/i);

  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();

  if (suffix === "B") {
    return amount * 1_000_000_000;
  }

  if (suffix === "M") {
    return amount * 1_000_000;
  }

  if (suffix === "K") {
    return amount * 1_000;
  }

  return amount;
}

function parseLabeledMetric(text, label) {
  const regex = new RegExp(
    `${escapeRegex(label)}[^0-9$¥€]{0,24}([$¥€])?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?[KMBkmb]?)`
  );
  const match = text.match(regex);
  return match ? parseCompactNumber(match[2]) : null;
}

function isLoginScreen(text, url) {
  const lowerText = text.toLowerCase();
  const lowerUrl = url.toLowerCase();
  return text.includes("登录") || lowerText.includes("login") || lowerUrl.includes("/login") || lowerUrl.includes("/auth");
}

function parseDashboardMetrics(text) {
  return {
    totalTokens: Math.round(parseLabeledMetric(text, "今日 Token") || 0),
    totalCost: parseLabeledMetric(text, "今日消费") || 0,
    totalRequests: Math.round(parseLabeledMetric(text, "今日请求") || 0),
    balanceRemainingUsd: parseLabeledMetric(text, "余额"),
  };
}

async function scrapeTimiCcData(env, runtime) {
  return withEdgePage(runtime, env, async (page) => {
    await page.goto(TIMICC_DASHBOARD_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(3000);
    await page
      .waitForFunction(
        () => document.body.innerText.includes("今日请求") || document.body.innerText.includes("今日 Token"),
        { timeout: 15000 }
      )
      .catch(() => {});

    const pageState = await page.evaluate(() => ({
      text: document.body.innerText,
      url: document.URL,
    }));

    if (isLoginScreen(pageState.text, pageState.url)) {
      throw new Error("Not logged in to TimiCC. Open Edge, sign in at https://timicc.com, then refresh again.");
    }

    const metrics = parseDashboardMetrics(pageState.text);
    const today = getShanghaiDateString();

    return {
      daily: [
        {
          date: today,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: metrics.totalTokens,
          queryCount: metrics.totalRequests,
          costUsd: metrics.totalCost,
        },
      ],
      balanceRemainingUsd: Number.isFinite(metrics.balanceRemainingUsd) ? metrics.balanceRemainingUsd : null,
      balanceExpirationDate: null,
      scrapedAt: new Date().toISOString(),
    };
  });
}

async function fetchUsage({ start, end, env, runtime }) {
  try {
    const data = await scrapeTimiCcData(env, runtime);
    const todayDate = getShanghaiDateString();
    const todayDaily = Array.isArray(data.daily) && data.daily[0] ? { ...data.daily[0], date: todayDate } : null;
    const daily = normalizeDailyRecords(
      (data.daily || []).map((item) => ({ ...item, date: todayDate })).filter((item) => item.date >= start && item.date <= end)
    );

    return {
      provider: env.TIMICC_PROVIDER_ID || "timicc",
      totals: mergeUsageTotals(daily),
      daily,
      todayDaily,
      account: {
        balanceRemainingUsd: Number.isFinite(data.balanceRemainingUsd) ? data.balanceRemainingUsd : null,
        balanceExpirationDate: data.balanceExpirationDate || null,
      },
      meta: {
        supportsTokenBreakdown: false,
        supportsQueryCount: true,
      },
    };
  } catch (error) {
    throw new Error(`TimiCC provider failed: ${error.message}`);
  }
}

module.exports = {
  providerId: "timicc",
  fetchUsage,
};

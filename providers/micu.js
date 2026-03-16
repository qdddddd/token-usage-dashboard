const { getShanghaiDateString, mergeUsageTotals, normalizeDailyRecords, parseShanghaiDateTime, toNumber } = require("./utils");
const { withEdgePage } = require("./edge-browser");

const MICU_CONSOLE_URL = "https://www.openclaudecode.cn/console";
const MICU_LOG_URL = "https://www.openclaudecode.cn/console/log";
const MICU_QUOTA_TO_USD = 500000;

function buildUnixTimestamp(dateStr, isEnd) {
  const value = parseShanghaiDateTime(dateStr, isEnd);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid Micu date: ${dateStr}`);
  }
  return Math.floor(value / 1000);
}

function isLoginScreen(text, url) {
  return text.includes("登录") || text.toLowerCase().includes("login") || url.includes("/login");
}

function parseConsoleBalance(text) {
  const match = text.match(/当前余额[^$]*\$\s*([0-9.]+)/);
  return match ? parseFloat(match[1]) : null;
}

function extractUserField(selfPayload, field) {
  const directValue = selfPayload?.data?.[field];
  if (directValue !== undefined) {
    return directValue;
  }

  return selfPayload?.data?.user?.[field];
}

function deriveBalanceRemainingUsd(consoleText, selfPayload, quotaPerUnit) {
  const parsedConsoleBalance = parseConsoleBalance(consoleText);
  if (Number.isFinite(parsedConsoleBalance)) {
    return parsedConsoleBalance;
  }

  const rawQuota = toNumber(extractUserField(selfPayload, "quota"));
  if (!Number.isFinite(rawQuota) || rawQuota <= 0) {
    return null;
  }

  const divisor = Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : MICU_QUOTA_TO_USD;
  return rawQuota / divisor;
}

function parseOtherPayload(other) {
  if (!other || typeof other !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(other);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function pickCacheMetric(payload, primaryKey, fallbackKey) {
  if (Object.prototype.hasOwnProperty.call(payload, primaryKey)) {
    return Math.round(toNumber(payload[primaryKey]));
  }

  if (Object.prototype.hasOwnProperty.call(payload, fallbackKey)) {
    return Math.round(toNumber(payload[fallbackKey]));
  }

  return 0;
}

function mapLogItemToDailyRecord(item) {
  const createdAt = toNumber(item.created_at);
  if (!createdAt) {
    return null;
  }

  const date = getShanghaiDateString(new Date(createdAt * 1000));
  const otherPayload = parseOtherPayload(item.other);
  const cacheReadTokens = pickCacheMetric(otherPayload, "cache_tokens", "cache_tokens_5m");
  const cacheCreationTokens = pickCacheMetric(otherPayload, "cache_creation_tokens", "cache_creation_tokens_5m");
  const inputTokens = Math.round(toNumber(item.prompt_tokens)) + cacheReadTokens + cacheCreationTokens;
  const outputTokens = Math.round(toNumber(item.completion_tokens));
  const totalTokens = inputTokens + outputTokens;
  const quota = toNumber(item.quota);

  return {
    date,
    inputTokens,
    outputTokens,
    totalTokens,
    queryCount: 1,
    costUsd: quota / MICU_QUOTA_TO_USD,
  };
}

async function scrapeMicuData(start, end, env, runtime) {
  return withEdgePage(runtime, env, async (page) => {
    await page.goto(MICU_CONSOLE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2500);

    const consoleState = await page.evaluate(() => ({
      text: document.body.innerText,
      url: document.URL,
      quotaPerUnit: Number.parseFloat(localStorage.getItem("quota_per_unit") || "0"),
    }));

    if (isLoginScreen(consoleState.text, consoleState.url)) {
      throw new Error(
        "Not logged in to Micu. Open Edge, sign in at https://www.openclaudecode.cn, then refresh again."
      );
    }

    const selfResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/user/self") && response.status() === 200,
      { timeout: 30000 }
    );

    await page.goto(MICU_LOG_URL, {
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
        "Not logged in to Micu. Open Edge, sign in at https://www.openclaudecode.cn, then refresh again."
      );
    }

    const selfResponse = await selfResponsePromise;
    const selfPayload = await selfResponse.json();
    const balanceRemainingUsd = deriveBalanceRemainingUsd(consoleState.text, selfPayload, consoleState.quotaPerUnit);
    const userId = extractUserField(selfPayload, "id") || selfResponse.request().headers()["new-api-user"];

    if (!userId) {
      throw new Error("Unable to identify the Micu account from the console session");
    }

    const startTimestamp = buildUnixTimestamp(start, false);
    const endTimestamp = buildUnixTimestamp(end, true);

    const rawItems = await page.evaluate(
      async ({ endTimestamp: endTs, startTimestamp: startTs, userId: currentUserId }) => {
        const pageSize = 100;
        let pageNumber = 1;
        let totalPages = 1;
        const allItems = [];

        while (pageNumber <= totalPages) {
          const params = new URLSearchParams({
            p: String(pageNumber),
            page_size: String(pageSize),
            type: "0",
            token_name: "",
            model_name: "",
            start_timestamp: String(startTs),
            end_timestamp: String(endTs),
            group: "",
            request_id: "",
          });

          const response = await fetch(`/api/log/self?${params.toString()}`, {
            credentials: "include",
            headers: {
              accept: "application/json, text/plain, */*",
              "new-api-user": String(currentUserId),
            },
          });

          const payload = await response.json();
          if (!response.ok || payload?.success === false) {
            throw new Error(payload?.message || `Micu log request failed (${response.status})`);
          }

          const data = payload?.data || {};
          const items = Array.isArray(data.items) ? data.items : [];
          const total = Number(data.total) || items.length;
          totalPages = Math.max(1, Math.ceil(total / pageSize));
          allItems.push(...items);

          if (items.length === 0) {
            break;
          }

          pageNumber += 1;
        }

        return allItems;
      },
      { startTimestamp, endTimestamp, userId }
    );

    const daily = normalizeDailyRecords(rawItems.map(mapLogItemToDailyRecord).filter(Boolean));

    return {
      daily,
      balanceRemainingUsd,
      balanceExpirationDate: null,
      scrapedAt: new Date().toISOString(),
    };
  });
}

async function fetchUsage({ start, end, env, runtime }) {
  try {
    const data = await scrapeMicuData(start, end, env, runtime);
    const today = getShanghaiDateString();
    const todayDaily = Array.isArray(data.daily) ? data.daily.find((item) => item.date === today) || null : null;
    const daily = Array.isArray(data.daily) ? data.daily : [];

    return {
      provider: env.MICU_PROVIDER_ID || "micu",
      totals: mergeUsageTotals(daily),
      daily,
      todayDaily,
      account: {
        balanceRemainingUsd: Number.isFinite(data.balanceRemainingUsd) ? data.balanceRemainingUsd : null,
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

const { mergeUsageTotals, normalizeDailyRecords, toNumber } = require("./utils");

async function fetchUsage({ env }) {
  if (!env.CUSTOM_PROVIDER_URL) {
    throw new Error("CUSTOM_PROVIDER_URL is missing");
  }

  const headers = { "Content-Type": "application/json" };
  if (env.CUSTOM_PROVIDER_API_KEY) {
    headers.Authorization = `Bearer ${env.CUSTOM_PROVIDER_API_KEY}`;
  }

  const response = await fetch(env.CUSTOM_PROVIDER_URL, { headers });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Custom provider failed (${response.status}): ${details.slice(0, 250)}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.daily)) {
    throw new Error("Custom provider payload must include a daily array");
  }

  const account = payload.account && typeof payload.account === "object" ? payload.account : {};

  const daily = normalizeDailyRecords(
    payload.daily
      .map((item) => {
        if (!item || typeof item.date !== "string") {
          return null;
        }
        return {
          date: item.date.slice(0, 10),
          inputTokens: toNumber(item.inputTokens),
          outputTokens: toNumber(item.outputTokens),
          totalTokens: toNumber(item.totalTokens),
          queryCount: toNumber(item.queryCount) || toNumber(item.requests) || toNumber(item.totalQueries),
          costUsd: toNumber(item.costUsd),
        };
      })
      .filter(Boolean)
  );

  return {
    provider: "custom",
    totals: mergeUsageTotals(daily),
    daily,
    account: {
      balanceRemainingUsd:
        toNumber(account.balanceRemainingUsd) ||
        toNumber(account.balance_remaining_usd) ||
        toNumber(account.remainingBalanceUsd) ||
        null,
      balanceExpirationDate:
        typeof account.balanceExpirationDate === "string"
          ? account.balanceExpirationDate.slice(0, 10)
          : typeof account.balance_expiration_date === "string"
            ? account.balance_expiration_date.slice(0, 10)
            : null,
    },
  };
}

module.exports = {
  providerId: "custom",
  fetchUsage,
};

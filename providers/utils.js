const SHANGHAI_TIMEZONE = "Asia/Shanghai";

function formatDateInTimezone(date, timeZone = SHANGHAI_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function getShanghaiDateString(date = new Date()) {
  return formatDateInTimezone(date, SHANGHAI_TIMEZONE);
}

function parseShanghaiDateTime(dateStr, isEndOfDay) {
  const suffix = isEndOfDay ? "T23:59:59.999+08:00" : "T00:00:00.000+08:00";
  const value = Date.parse(`${dateStr}${suffix}`);
  return Number.isFinite(value) ? value : NaN;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isoDateFromUnix(seconds) {
  if (!Number.isFinite(seconds)) {
    return null;
  }
  return getShanghaiDateString(new Date(seconds * 1000));
}

function newUsageRecord(date) {
  return {
    date,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    queryCount: 0,
    costUsd: 0,
  };
}

function sortByDate(records) {
  return [...records].sort((a, b) => a.date.localeCompare(b.date));
}

function mergeUsageTotals(items) {
  return items.reduce(
    (totals, item) => {
      totals.inputTokens += toNumber(item.inputTokens);
      totals.outputTokens += toNumber(item.outputTokens);
      totals.totalTokens += toNumber(item.totalTokens);
      totals.queryCount += toNumber(item.queryCount);
      totals.costUsd += toNumber(item.costUsd);
      return totals;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      queryCount: 0,
      costUsd: 0,
    }
  );
}

function normalizeDailyRecords(records) {
  const byDate = new Map();

  for (const record of records) {
    if (!record || !record.date) {
      continue;
    }

    if (!byDate.has(record.date)) {
      byDate.set(record.date, newUsageRecord(record.date));
    }

    const bucket = byDate.get(record.date);
    bucket.inputTokens += toNumber(record.inputTokens);
    bucket.outputTokens += toNumber(record.outputTokens);
    bucket.totalTokens += toNumber(record.totalTokens);
    bucket.queryCount += toNumber(record.queryCount);
    bucket.costUsd += toNumber(record.costUsd);
  }

  return sortByDate(Array.from(byDate.values()));
}

module.exports = {
  formatDateInTimezone,
  getShanghaiDateString,
  isoDateFromUnix,
  mergeUsageTotals,
  normalizeDailyRecords,
  parseShanghaiDateTime,
  toNumber,
};

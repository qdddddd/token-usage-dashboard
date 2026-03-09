const form = document.getElementById("range-form");
const startInput = document.getElementById("start");
const endInput = document.getElementById("end");
const refreshButton = document.getElementById("refresh");

const kpiTotalTokens = document.getElementById("kpi-total-tokens");
const kpiCost = document.getElementById("kpi-cost");
const kpiTokensToday = document.getElementById("kpi-tokens-today");
const kpiQueriesToday = document.getElementById("kpi-queries-today");

const providersContainer = document.getElementById("providers");
const providerStatus = document.getElementById("provider-status");
const messages = document.getElementById("messages");

let activeUsageStream = null;
let activeUsageToken = 0;
let currentDashboardState = null;
const refreshingProviders = new Set();

function formatInt(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value || 0);
}

function toSafeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function setDefaultRange() {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 6);
  const start = startDate.toISOString().slice(0, 10);

  startInput.value = start;
  endInput.value = end;
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "Loading..." : "Refresh usage";
}

function clearMessages() {
  messages.innerHTML = "";
}

function showMessage(type, text) {
  const element = document.createElement("p");
  element.className = `message ${type}`;
  element.textContent = text;
  messages.append(element);
}

function createProviderHeading(label, dashboardUrl) {
  const heading = document.createElement("h3");

  if (!dashboardUrl) {
    heading.textContent = label;
    return heading;
  }

  const link = document.createElement("a");
  link.className = "provider-link";
  link.href = dashboardUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = `Open ${label} dashboard`;
  link.textContent = label;
  heading.append(link);
  return heading;
}

function clearSummary() {
  kpiTotalTokens.textContent = "-";
  kpiCost.textContent = "-";
  kpiTokensToday.textContent = "-";
  kpiQueriesToday.textContent = "-";
  kpiTokensToday.title = "";
  kpiQueriesToday.title = "";
}

function closeUsageStream() {
  if (!activeUsageStream) {
    return;
  }

  activeUsageStream.close();
  activeUsageStream = null;
}

function resetDashboardForLoading() {
  currentDashboardState = null;
  refreshingProviders.clear();
  clearSummary();
  providersContainer.innerHTML = "";
  providerStatus.textContent = "Preparing provider requests...";
}

function upsertProviderEntry(collection, entry) {
  const index = collection.findIndex((item) => item.provider === entry.provider);
  if (index >= 0) {
    collection[index] = entry;
    return;
  }

  collection.push(entry);
}

function removeProviderEntry(collection, providerName) {
  return (collection || []).filter((item) => item.provider !== providerName);
}

function buildCombinedTotals(providers) {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    queryCount: 0,
    costUsd: 0,
  };

  for (const provider of providers || []) {
    const providerTotals = provider.totals || {};
    totals.inputTokens += toSafeNumber(providerTotals.inputTokens);
    totals.outputTokens += toSafeNumber(providerTotals.outputTokens);
    totals.totalTokens += toSafeNumber(providerTotals.totalTokens);
    totals.queryCount += toSafeNumber(providerTotals.queryCount);
    totals.costUsd += toSafeNumber(providerTotals.costUsd);
  }

  totals.inputTokens = Math.round(totals.inputTokens);
  totals.outputTokens = Math.round(totals.outputTokens);
  totals.totalTokens = Math.round(totals.totalTokens);
  totals.queryCount = Math.round(totals.queryCount);
  totals.costUsd = Number(totals.costUsd.toFixed(4));
  return totals;
}

function buildCombinedDaily(providers) {
  const byDate = new Map();

  for (const provider of providers || []) {
    for (const entry of provider.daily || []) {
      if (!entry || !entry.date) {
        continue;
      }

      if (!byDate.has(entry.date)) {
        byDate.set(entry.date, {
          date: entry.date,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          queryCount: 0,
          costUsd: 0,
        });
      }

      const bucket = byDate.get(entry.date);
      bucket.inputTokens += toSafeNumber(entry.inputTokens);
      bucket.outputTokens += toSafeNumber(entry.outputTokens);
      bucket.totalTokens += toSafeNumber(entry.totalTokens);
      bucket.queryCount += toSafeNumber(entry.queryCount);
      bucket.costUsd += toSafeNumber(entry.costUsd);
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildAccountSummary(providers, todayByProvider) {
  const summary = {
    balanceRemainingUsd: null,
    balanceSpentTodayUsd: 0,
    balanceExpirationDate: null,
    tokensUsedToday: 0,
    totalQueriesToday: 0,
  };

  let hasBalance = false;
  const expirationCandidates = [];

  for (const provider of providers || []) {
    const account = provider.account || {};
    if (Number.isFinite(account.balanceRemainingUsd)) {
      hasBalance = true;
      summary.balanceRemainingUsd = toSafeNumber(summary.balanceRemainingUsd) + toSafeNumber(account.balanceRemainingUsd);
    }

    if (typeof account.balanceExpirationDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(account.balanceExpirationDate)) {
      expirationCandidates.push(account.balanceExpirationDate);
    }
  }

  if (!hasBalance) {
    summary.balanceRemainingUsd = null;
  }

  if (expirationCandidates.length > 0) {
    summary.balanceExpirationDate = expirationCandidates.sort()[0];
  }

  for (const metric of Object.values(todayByProvider || {})) {
    summary.balanceSpentTodayUsd += toSafeNumber(metric.costUsd);
    summary.tokensUsedToday += toSafeNumber(metric.totalTokens);
    summary.totalQueriesToday += toSafeNumber(metric.queryCount);
  }

  summary.balanceSpentTodayUsd = Number(summary.balanceSpentTodayUsd.toFixed(4));
  summary.tokensUsedToday = Math.round(summary.tokensUsedToday);
  summary.totalQueriesToday = Math.round(summary.totalQueriesToday);
  return summary;
}

function recalculateDashboardState(state) {
  const nextState = state || {};
  nextState.providers = Array.isArray(nextState.providers) ? nextState.providers : [];
  nextState.providerErrors = Array.isArray(nextState.providerErrors) ? nextState.providerErrors : [];
  nextState.todayByProvider = nextState.todayByProvider && typeof nextState.todayByProvider === "object"
    ? nextState.todayByProvider
    : {};
  nextState.totals = buildCombinedTotals(nextState.providers);
  nextState.daily = buildCombinedDaily(nextState.providers);
  nextState.accountSummary = buildAccountSummary(nextState.providers, nextState.todayByProvider);
  nextState.fetchedAt = new Date().toISOString();
  nextState.streamComplete = true;
  return nextState;
}

function renderDashboardState(state) {
  if (!state) {
    return;
  }

  renderTotals(state.totals || {});
  renderAccountSummary(state.accountSummary, state.todayDate);
  renderProviders(state);
}

function getSpentTodayText(providerName, todayByProvider, isFinalState) {
  const today = (todayByProvider && todayByProvider[providerName]) || null;
  if (today && Number.isFinite(today.costUsd)) {
    return formatUsd(today.costUsd);
  }

  return isFinalState ? formatUsd(0) : "Loading...";
}

function formatExpirationText(expirationDate, fallbackText, todayDate) {
  if (!expirationDate) {
    return fallbackText || "N/A";
  }

  const referenceDate = typeof todayDate === "string" ? todayDate : new Date().toISOString().slice(0, 10);
  const expirationValue = Date.parse(`${expirationDate}T00:00:00Z`);
  const referenceValue = Date.parse(`${referenceDate}T00:00:00Z`);

  if (!Number.isFinite(expirationValue) || !Number.isFinite(referenceValue)) {
    return expirationDate;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const daysLeft = Math.round((expirationValue - referenceValue) / dayMs);
  const label = Math.abs(daysLeft) === 1 ? "day" : "days";
  return `${expirationDate} (${daysLeft} ${label} left)`;
}

function parseStreamPayload(event) {
  return JSON.parse(event.data);
}

function renderTotals(totals) {
  kpiTotalTokens.textContent = formatInt(totals.totalTokens);
  kpiCost.textContent = formatUsd(totals.costUsd);
}

function renderAccountSummary(summary, todayDate) {
  if (!summary) {
    kpiTokensToday.textContent = "-";
    kpiQueriesToday.textContent = "-";
    return;
  }

  kpiTokensToday.textContent = formatInt(summary.tokensUsedToday);
  kpiQueriesToday.textContent = formatInt(summary.totalQueriesToday);

  if (todayDate) {
    kpiTokensToday.title = `Calculated for ${todayDate}`;
    kpiQueriesToday.title = `Calculated for ${todayDate}`;
  }
}

function createProviderRefreshButton(providerName, isFinalState) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "provider-refresh";
  button.textContent = "🗘";
  button.disabled = !isFinalState || refreshingProviders.has(providerName);
  button.setAttribute("aria-label", `Refresh ${providerName} only`);
  button.title = refreshingProviders.has(providerName)
    ? `Refreshing ${providerName}...`
    : `Refresh ${providerName} only`;
  button.addEventListener("click", () => {
    refreshProvider(providerName);
  });
  return button;
}

function renderProviders(data) {
  providersContainer.innerHTML = "";

  const isFinalState = data.streamComplete !== false;
  const expectedProviderCount = Number.isFinite(data.expectedProviderCount)
    ? data.expectedProviderCount
    : (data.providers || []).length + (data.providerErrors || []).length;

  for (const provider of data.providers || []) {
    const item = document.createElement("article");
    item.className = "provider-item";

    const account = provider.account || {};
    const meta = provider.meta || {};
    const name = createProviderHeading(provider.provider, meta.dashboardUrl);
    const refreshControl = createProviderRefreshButton(provider.provider, isFinalState);
    const header = document.createElement("div");
    header.className = "provider-header";
    header.append(name, refreshControl);
    const balance = Number.isFinite(account.balanceRemainingUsd)
      ? formatUsd(account.balanceRemainingUsd)
      : account.balanceRemainingText || "N/A";
    const spentToday = getSpentTodayText(provider.provider, data.todayByProvider, isFinalState);
    const expires = formatExpirationText(account.balanceExpirationDate, account.balanceExpirationText, data.todayDate);

    const ok = document.createElement("p");
    ok.className = "provider-meta status-ok";
    ok.textContent = `OK  ${balance}`;

    const totalTokens = formatInt(provider.totals.totalTokens);
    const totalQueries = meta.supportsQueryCount === false ? "Not exposed" : formatInt(provider.totals.queryCount);

    const usageEntries = [
      `Total tokens: ${totalTokens}`,
      `Total queries: ${totalQueries}`,
    ];

    const balanceEntries = [
      `Balance spent today: ${spentToday}`,
      `Balance expiration day: ${expires}`,
    ];

    const subcards = document.createElement("div");
    subcards.className = "provider-subcards";

    const usageCard = document.createElement("section");
    usageCard.className = "provider-subcard";

    const usageTitle = document.createElement("p");
    usageTitle.className = "provider-meta provider-subcard-title";
    usageTitle.textContent = "Usage";

    const usageList = document.createElement("ul");
    usageList.className = "provider-facts";

    for (const text of usageEntries) {
      const entry = document.createElement("li");
      entry.textContent = text;
      usageList.append(entry);
    }

    usageCard.append(usageTitle, usageList);

    const balanceCard = document.createElement("section");
    balanceCard.className = "provider-subcard";

    const balanceTitle = document.createElement("p");
    balanceTitle.className = "provider-meta provider-subcard-title";
    balanceTitle.textContent = "Balance";

    const balanceList = document.createElement("ul");
    balanceList.className = "provider-facts";

    for (const text of balanceEntries) {
      const entry = document.createElement("li");
      entry.textContent = text;
      balanceList.append(entry);
    }

    balanceCard.append(balanceTitle, balanceList);

    subcards.append(usageCard, balanceCard);

    item.append(header, ok, subcards);
    providersContainer.append(item);
  }

  for (const error of data.providerErrors || []) {
    const item = document.createElement("article");
    item.className = "provider-item";

    const name = createProviderHeading(error.provider, error.dashboardUrl);
    const refreshControl = createProviderRefreshButton(error.provider, isFinalState);
    const header = document.createElement("div");
    header.className = "provider-header";
    header.append(name, refreshControl);

    const failed = document.createElement("p");
    failed.className = "provider-meta status-error";
    failed.textContent = "Error";

    const details = document.createElement("p");
    details.className = "provider-meta status-error";
    details.textContent = error.message;

    item.append(header, failed, details);
    providersContainer.append(item);
  }

  const successCount = (data.providers || []).length;
  const errorCount = (data.providerErrors || []).length;
  const finishedCount = successCount + errorCount;

  if (!isFinalState && expectedProviderCount > 0) {
    providerStatus.textContent = `${finishedCount} of ${expectedProviderCount} provider(s) finished: ${successCount} ok, ${errorCount} failed`;
  } else {
    providerStatus.textContent = `${successCount} provider(s) ok, ${errorCount} provider(s) failed`;
  }

  if (finishedCount === 0 && expectedProviderCount > 0 && !isFinalState) {
    const waiting = document.createElement("p");
    waiting.className = "hint";
    waiting.textContent = "Waiting for the first provider result...";
    providersContainer.append(waiting);
  }
}

function getProviderDashboardUrl(providerName) {
  const providerEntry = currentDashboardState?.providers?.find((item) => item.provider === providerName);
  if (providerEntry?.meta?.dashboardUrl) {
    return providerEntry.meta.dashboardUrl;
  }

  const errorEntry = currentDashboardState?.providerErrors?.find((item) => item.provider === providerName);
  return errorEntry?.dashboardUrl || null;
}

async function refreshProvider(providerName) {
  if (!currentDashboardState) {
    return;
  }

  if (activeUsageStream) {
    showMessage("info", "Wait for the full dashboard refresh to finish before refreshing one provider.");
    return;
  }

  if (refreshingProviders.has(providerName)) {
    return;
  }

  refreshingProviders.add(providerName);
  renderProviders(currentDashboardState);

  try {
    const params = new URLSearchParams({
      provider: providerName,
      start: startInput.value,
      end: endInput.value,
    });

    const response = await fetch(`/api/provider?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || `Unable to refresh ${providerName}`);
    }

    currentDashboardState.range = payload.range || currentDashboardState.range;
    currentDashboardState.todayDate = payload.todayDate || currentDashboardState.todayDate;
    currentDashboardState.providers = Array.isArray(currentDashboardState.providers) ? currentDashboardState.providers : [];
    currentDashboardState.providerErrors = removeProviderEntry(currentDashboardState.providerErrors, providerName);
    upsertProviderEntry(currentDashboardState.providers, payload.provider);

    if (!currentDashboardState.todayByProvider || typeof currentDashboardState.todayByProvider !== "object") {
      currentDashboardState.todayByProvider = {};
    }

    if (payload.todayMetric) {
      currentDashboardState.todayByProvider[providerName] = payload.todayMetric;
    } else if (!payload.todayMetricError) {
      delete currentDashboardState.todayByProvider[providerName];
    }

    recalculateDashboardState(currentDashboardState);
    renderDashboardState(currentDashboardState);
  } catch (error) {
    const hasLiveProvider = currentDashboardState.providers?.some((item) => item.provider === providerName);
    if (!hasLiveProvider) {
      upsertProviderEntry(currentDashboardState.providerErrors, {
        provider: providerName,
        message: error.message || String(error),
        dashboardUrl: getProviderDashboardUrl(providerName),
      });
      renderProviders(currentDashboardState);
    }

    showMessage("error", error.message || String(error));
  } finally {
    refreshingProviders.delete(providerName);
    renderProviders(currentDashboardState);
  }
}

async function fetchUsage() {
  clearMessages();
  setLoading(true);
  activeUsageToken += 1;
  const requestToken = activeUsageToken;
  closeUsageStream();
  resetDashboardForLoading();

  try {
    const params = new URLSearchParams({
      start: startInput.value,
      end: endInput.value,
    });

    const payload = await new Promise((resolve, reject) => {
      const state = {
        providers: [],
        providerErrors: [],
        todayByProvider: {},
        expectedProviderCount: 0,
        streamComplete: false,
      };
      const stream = new EventSource(`/api/usage/stream?${params.toString()}`);
      let settled = false;

      activeUsageStream = stream;

      function isStale() {
        return requestToken !== activeUsageToken;
      }

      function cleanup() {
        if (settled) {
          return;
        }

        settled = true;
        stream.close();
        if (activeUsageStream === stream) {
          activeUsageStream = null;
        }
      }

      stream.addEventListener("start", (event) => {
        if (settled || isStale()) {
          return;
        }

        const payload = parseStreamPayload(event);
        state.expectedProviderCount = Array.isArray(payload.providers) ? payload.providers.length : 0;
        renderProviders(state);
      });

      stream.addEventListener("provider", (event) => {
        if (settled || isStale()) {
          return;
        }

        const payload = parseStreamPayload(event);
        upsertProviderEntry(state.providers, payload.provider);
        if (payload.todayMetric) {
          state.todayByProvider[payload.provider.provider] = payload.todayMetric;
        }
        renderProviders(state);
      });

      stream.addEventListener("provider-error", (event) => {
        if (settled || isStale()) {
          return;
        }

        const payload = parseStreamPayload(event);
        upsertProviderEntry(state.providerErrors, payload.error);
        renderProviders(state);
      });

      stream.addEventListener("done", (event) => {
        if (settled || isStale()) {
          cleanup();
          return;
        }

        const payload = parseStreamPayload(event);
        cleanup();
        currentDashboardState = {
          ...payload,
          streamComplete: true,
          expectedProviderCount: state.expectedProviderCount,
        };
        renderDashboardState(currentDashboardState);
        resolve(currentDashboardState);
      });

      stream.addEventListener("fatal", (event) => {
        if (settled || isStale()) {
          cleanup();
          return;
        }

        const payload = parseStreamPayload(event);
        cleanup();
        reject(new Error(payload.error || "Unable to load usage"));
      });

      stream.onerror = () => {
        if (settled || isStale()) {
          cleanup();
          return;
        }

        cleanup();
        reject(new Error("Lost connection while loading usage"));
      };
    });

    showMessage("info", `Updated ${new Date(payload.fetchedAt).toLocaleString()}`);
  } catch (error) {
    showMessage("error", error.message || String(error));
  } finally {
    if (requestToken === activeUsageToken) {
      setLoading(false);
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  fetchUsage();
});

setDefaultRange();
fetchUsage();

// Server-backed size-tier fetch.
//
// Sends the design code to the quote server's `/quote-tier` endpoint and
// returns { tier, tierLabel, tierIndex, tierCount }. The server computes
// the dollar quote internally but never sends it — the public site sees
// only the tier letter.
//
// Endpoint URL: `window.QUOTE_URL` if set (configured in index.html for a
// public deployment), otherwise relative `/quote-tier` (same-origin dev).

const DEFAULT_PATH = "/quote-tier";
const DEFAULT_TIMEOUT_MS = 60_000;

export class QuoteError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "QuoteError";
    if (cause) this.cause = cause;
  }
}

export async function fetchTier(code, { signal } = {}) {
  const url = (typeof window !== "undefined" && window.QUOTE_URL) || DEFAULT_PATH;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  const chained = signal ? anySignal([signal, ctrl.signal]) : ctrl.signal;
  const apiKey = (typeof window !== "undefined" && window.QUOTE_API_KEY) || null;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify({ code }),
      signal: chained,
    });
  } catch (e) {
    throw new QuoteError(e.name === "AbortError" ? "request cancelled" : "network error", e);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {}
    throw new QuoteError(detail);
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data.tier !== "string") {
    throw new QuoteError("malformed response");
  }
  return data;
}

function anySignal(signals) {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) { ctrl.abort(); break; }
    s.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}

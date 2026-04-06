/**
 * FinanceFeed — Cloudflare Worker proxy
 *
 * Routes:
 *   GET /api/finnhub?category=general   → Finnhub /v1/news
 *   GET /api/newsapi/v2/top-headlines?… → NewsAPI top-headlines
 *   GET /api/newsapi/v2/everything?…    → NewsAPI everything
 *
 * Secrets (set via `wrangler secret put`):
 *   FINNHUB_KEY   — Finnhub API key
 *   NEWSAPI_KEY   — NewsAPI.org API key
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/finnhub') {
      return handleFinnhub(url, env);
    }

    if (path.startsWith('/api/newsapi/')) {
      return handleNewsAPI(url, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};

// ── Finnhub ───────────────────────────────────────────────────────────────────
async function handleFinnhub(url, env) {
  if (!env.FINNHUB_KEY) {
    return json({ error: 'FINNHUB_KEY secret not configured' }, 500);
  }

  const category = url.searchParams.get('category') || 'general';
  const apiUrl   = `https://finnhub.io/api/v1/news?category=${encodeURIComponent(category)}&token=${env.FINNHUB_KEY}`;

  try {
    const upstream = await fetch(apiUrl);
    const body     = await upstream.text();
    return new Response(body, {
      status:  upstream.status,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    return json({ error: `Finnhub fetch failed: ${err.message}` }, 502);
  }
}

// ── NewsAPI ───────────────────────────────────────────────────────────────────
async function handleNewsAPI(url, env) {
  if (!env.NEWSAPI_KEY) {
    return json({ error: 'NEWSAPI_KEY secret not configured' }, 500);
  }

  // Strip the /api/newsapi prefix to get the real NewsAPI path (e.g. /v2/top-headlines)
  const newsapiPath = url.pathname.replace('/api/newsapi', '');

  // Forward all query params the browser sent, then inject the API key
  const params = new URLSearchParams(url.searchParams);
  params.set('apiKey', env.NEWSAPI_KEY);

  const apiUrl = `https://newsapi.org${newsapiPath}?${params.toString()}`;

  try {
    const upstream = await fetch(apiUrl, {
      headers: { 'User-Agent': 'FinanceFeed/1.0' },
    });
    const body = await upstream.text();
    return new Response(body, {
      status:  upstream.status,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    return json({ error: `NewsAPI fetch failed: ${err.message}` }, 502);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

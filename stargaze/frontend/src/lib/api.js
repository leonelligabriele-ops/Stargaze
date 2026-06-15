/**
 * Base URL for backend API calls.
 *
 * Defaults to the relative `/api` prefix, which works in two setups:
 *   - local dev: Vite proxies `/api` → http://localhost:8000 (see vite.config.js)
 *   - Netlify:   netlify.toml proxies `/api/*` → the Render backend (no CORS)
 *
 * To call a backend on a different origin directly (bypassing the proxy), set
 * `VITE_API_BASE` at build time, e.g. VITE_API_BASE=https://stargaze-api.onrender.com
 */
export const API = import.meta.env.VITE_API_BASE || '/api'

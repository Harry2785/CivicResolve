/**
 * CivicResolve API Configuration
 *
 * Exact Environment Variable:
 * VITE_API_URL (e.g. https://your-civicresolve-backend.vercel.app)
 *
 * Usage:
 * - Local Development: Leave unset or empty to use Vite's local proxy (/api -> http://127.0.0.1:8000)
 * - Vercel Deployment: Set VITE_API_URL in Vercel project environment variables to the backend's URL.
 */

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  ''
).replace(/\/+$/, '')

/**
 * Resolve an API or media path against the configured backend base URL.
 * If endpoint is already an absolute URL (http:// or https://), returns it as-is.
 * Otherwise prepends API_BASE_URL.
 */
export function getApiUrl(endpoint = '') {
  if (!endpoint) return API_BASE_URL
  if (endpoint.startsWith('data:image/')) return endpoint
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint
  }
  let cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  // Prevent duplicate /api if API_BASE_URL already ends with /api
  if (API_BASE_URL.endsWith('/api') && cleanPath.startsWith('/api/')) {
    cleanPath = cleanPath.substring(4)
  }
  // If endpoint is a static asset mount (/uploads/...) and base URL has /api suffix, route to server root
  if (cleanPath.startsWith('/uploads/')) {
    const rootBase = API_BASE_URL.replace(/\/api$/, '')
    return `${rootBase}${cleanPath}`
  }
  return `${API_BASE_URL}${cleanPath}`
}

import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { getAccessToken, setAccessToken } from "@/lib/auth/token";

// Requests go to /api/* on the same origin, which Next.js proxies to the
// backend. This keeps cookies same-site so SameSite=Lax refresh tokens work
// regardless of where the frontend and backend are hosted.
export const apiClient = createClient<paths>({
  baseUrl: "/api",
  credentials: "same-origin",
});

// ── Token refresh ─────────────────────────────────────────────────────────────

// Singleton promise: prevents multiple concurrent refresh attempts when
// several queries fail with 401 at the same time (e.g. on window focus).
let pendingRefresh: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = (await res.json()) as { access_token?: string };
        if (data.access_token) {
          setAccessToken(data.access_token);
          return data.access_token;
        }
      }
    } catch {
      // Network error — fall through
    }
    setAccessToken(null);
    return null;
  })();

  const result = await pendingRefresh;
  pendingRefresh = null;
  return result;
}

// ── Middleware ────────────────────────────────────────────────────────────────

apiClient.use({
  onRequest({ request }) {
    const token = getAccessToken();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },

  async onResponse({ request, response }) {
    if (!response.ok) {
      // Auth endpoints return 401/403 as normal control flow (e.g. no session
      // yet on page load). Let the auth context handle those itself.
      const url = new URL(request.url, "http://localhost");
      if (url.pathname.startsWith("/api/auth/")) return;

      if (response.status === 401) {
        // Access token expired. Attempt a silent token refresh and retry the
        // request once. Multiple concurrent 401s share one refresh call via
        // the pendingRefresh singleton above.
        const newToken = await tryRefreshToken();
        if (newToken) {
          const retryHeaders = new Headers(request.headers);
          retryHeaders.set("Authorization", `Bearer ${newToken}`);
          // Retry — only safe for methods with no body (GET, HEAD, DELETE).
          // POST/PATCH would need to re-read the body, so we let them fail.
          if (["GET", "HEAD", "DELETE"].includes(request.method)) {
            const retried = await fetch(request.url, {
              method: request.method,
              headers: retryHeaders,
              credentials: "same-origin",
            });
            if (retried.ok) return retried;
            // Retry also failed — fall through to throw below.
            const text = await retried.text().catch(() => retried.statusText);
            throw new Error(`${retried.status}: ${text}`);
          }
        }
        throw new Error("401: Session expired — please log in again");
      }

      // React Query v5 requires query functions to throw rather than return
      // undefined. Throwing here ensures errors surface correctly.
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`${response.status}: ${text}`);
    }
  },
});

import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { getAccessToken } from "@/lib/auth/token";

// Requests go to /api/* on the same origin, which Next.js proxies to the
// backend. This keeps cookies same-site so SameSite=Lax refresh tokens work
// regardless of where the frontend and backend are hosted.
export const apiClient = createClient<paths>({
  baseUrl: "/api",
  credentials: "same-origin",
});

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

      // React Query v5 requires query functions to throw rather than return
      // undefined. Throwing here ensures errors surface correctly instead of
      // silently producing undefined data.
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`${response.status}: ${text}`);
    }
  },
});

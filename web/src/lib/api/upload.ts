/**
 * Image upload utility for the BlockNote editor.
 *
 * BlockNote's `uploadFile` option expects a function that takes a File and
 * returns a Promise<string> — the URL to embed in the image block.
 *
 * The returned URL is stored in the block JSON in the database, so it must
 * be a stable, browser-accessible path. We store "/api/uploads/{uuid}.ext"
 * which the Next.js proxy forwards to the FastAPI backend.
 */

import { getAccessToken } from "@/lib/auth/token";

/**
 * Upload an image to the server and return its browser-accessible URL.
 * Throws on network error or non-2xx response.
 */
export async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const token = getAccessToken();
  const headers: HeadersInit = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch("/api/uploads", {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Image upload failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { url: string };
  // data.url is "/uploads/{filename}" — prepend /api for browser-side access.
  return `/api${data.url}`;
}

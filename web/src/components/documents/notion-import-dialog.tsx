"use client";

/**
 * Markdown + HTML import dialog.
 *
 * Accepts a zip of markdown or HTML files (Notion, Obsidian, Bear, Logseq, …),
 * reconstructs page hierarchy from the folder structure, strips unresolvable
 * image references, and bulk-POSTs to POST /documents/bulk-import.
 *
 * Prefers .html files over .md when both exist for the same page stem (as in
 * Notion's HTML export), because the HTML export preserves toggle lists.
 *
 * Notion-specific fixes applied during parse:
 *   1. Database-row pages (every line is "key: value") are converted to stubs.
 *   2. Stub parent pages are auto-created for folders with no matching file.
 *   3. Inter-page links ([text](Page hexid.md)) are rewritten to internal
 *      /documents/{uuid} links via a post-import PATCH pass (MD only).
 *   4. Page icons (emoji) are extracted from HTML or MD and stored on the doc.
 *
 * Notion export structures:
 *   "Markdown & CSV" → Page Title <32-hex>.md
 *   "HTML"           → Page Title <32-hex>.html  (preserves toggles, icons)
 */

import { useRef, useState } from "react";
import JSZip from "jszip";
import { BlockNoteEditor } from "@blocknote/core";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/auth/token";
import { Upload, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedPage {
  clientId: string;
  clientParentId: string | null;
  title: string;
  /** source_markdown content; empty string for stubs or HTML-only pages. */
  markdown: string;
  /** editor_json blocks from BlockNote HTML parsing. */
  editorJson?: unknown;
  /** Emoji icon from the page header, if present. */
  icon?: string | null;
}

type ImportState =
  | { phase: "idle" }
  | { phase: "parsing" }
  | { phase: "uploading" }
  | { phase: "rewriting" }
  | { phase: "done"; created: number; skipped: number }
  | { phase: "error"; message: string };

interface ImportResultItem {
  id: string;
  client_id: string;
}

// ── Emoji helpers ─────────────────────────────────────────────────────────────

// Matches a single emoji codepoint (or ZWJ sequence). Used to detect icon lines.
const EMOJI_RE =
  /^(?:\p{Emoji_Presentation}|\p{Emoji}️)(?:‍(?:\p{Emoji_Presentation}|\p{Emoji}️))*\s*$/u;

function isEmojiOnly(text: string): boolean {
  return EMOJI_RE.test(text.trim());
}

// ── Markdown helpers ──────────────────────────────────────────────────────────

function stripLocalImages(md: string): string {
  return md.replace(/!\[[^\]]*\]\((?!https?:\/\/|data:|ftp:\/\/)[^)]*\)/g, "");
}

/**
 * Returns true when the entire file content looks like a Notion database row
 * (every non-blank line follows "Key: value" format with no prose content).
 */
function isDatabaseRow(markdown: string): boolean {
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const kvRe = /^[^:]+:\s+\S/;
  return lines.every((l) => kvRe.test(l));
}

/**
 * Rewrites Notion inter-page links to DOCREF: placeholders for post-import
 * resolution to real /documents/{uuid} URLs.
 */
function rewriteNotionLinks(
  md: string,
  hexToClientId: Map<string, string>,
): string {
  return md.replace(
    /\[([^\]]*)\]\(([^)]*?)([0-9a-f]{32})\.md\)/gi,
    (_match, text, _prefix, hexId) => {
      const targetClientId = hexToClientId.get(hexId.toLowerCase());
      if (!targetClientId) return `[${text}]`;
      return `[${text}](DOCREF:${targetClientId})`;
    },
  );
}

/**
 * Try to extract a leading emoji icon from a markdown file.
 * Notion MD exports sometimes begin with just an emoji line before the heading.
 */
function parseIconFromMarkdown(md: string): string | null {
  const firstLine = md.split("\n").find((l) => l.trim().length > 0);
  if (!firstLine) return null;
  const trimmed = firstLine.trim();
  // Must be an emoji-only line (not a heading or paragraph)
  if (!trimmed.startsWith("#") && isEmojiOnly(trimmed)) return trimmed;
  return null;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

/**
 * Extracts the page icon emoji from Notion HTML.
 * Notion puts the icon in elements with class containing "page-icon" or "icon".
 */
function parseIconFromHtml(html: string): string | null {
  // Try <p class="page-icon">🔥</p> or <figure class="page-icon">🔥</figure>
  const iconEl = html.match(
    /<(?:p|figure|div|span)[^>]+class="[^"]*(?:page[-_]icon|icon)[^"]*"[^>]*>\s*([^\n<]{1,10})\s*<\/(?:p|figure|div|span)>/i,
  );
  if (iconEl) {
    const candidate = iconEl[1].trim();
    if (isEmojiOnly(candidate)) return candidate;
  }

  // Fallback: check for <link rel="icon" ...> with emoji-like content
  const linkIcon = html.match(/<link[^>]+rel="icon"[^>]+href="([^"]+)"/i);
  if (linkIcon) {
    const href = linkIcon[1];
    // emoji are sometimes base64-encoded SVG or plain text — skip non-emoji
    if (isEmojiOnly(href)) return href.trim();
  }
  return null;
}

/**
 * Extracts the body content from a Notion HTML page for BlockNote parsing.
 * Strips the title heading so it doesn't duplicate the page title.
 */
function extractNotionHtmlBody(html: string): string {
  // Prefer the dedicated page-body div
  const bodyMatch = html.match(
    /<div[^>]+class="[^"]*page-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/i,
  );
  if (bodyMatch) return bodyMatch[1];

  // Fallback: strip <head>, then strip the first <h1> (the title)
  const bodyTag = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyTag ? bodyTag[1] : html;
  return bodyContent.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "").trim();
}

// Singleton parser editor — created lazily, reused across all pages.
// BlockNoteEditor.create() is safe to call in the browser without mounting.
let _parseEditor: BlockNoteEditor | null = null;

function getParseEditor(): BlockNoteEditor {
  if (!_parseEditor) {
    _parseEditor = BlockNoteEditor.create();
  }
  return _parseEditor;
}

async function parseHtmlPage(
  html: string,
): Promise<{ editorJson: unknown; icon: string | null }> {
  const icon = parseIconFromHtml(html);
  const bodyHtml = extractNotionHtmlBody(html);
  const editor = getParseEditor();
  const blocks = editor.tryParseHTMLToBlocks(bodyHtml);
  return { editorJson: { blocks }, icon };
}

// ── Notion filename helpers ───────────────────────────────────────────────────

const NOTION_SYSTEM_PAGE_TITLES = new Set([
  "home",
  "teamspace home",
  "people",
]);

const NOTION_UUID_RE = /\s+[0-9a-f]{32}$/i;

function stripNotionId(name: string): string {
  return name.replace(NOTION_UUID_RE, "").trim();
}

function parseTitleFromPath(filePath: string): string {
  const segments = filePath.split("/");
  const filename = segments[segments.length - 1];
  // Strip any known extension
  const withoutExt = filename.replace(/\.(md|html?)$/i, "");
  return stripNotionId(withoutExt) || "Untitled";
}

/**
 * Normalises a file path by stripping Notion UUIDs from every segment.
 * Preserves the file extension (.md or .html) on the last segment.
 */
function normalisePath(filePath: string): string {
  return filePath
    .split("/")
    .map((seg, i, arr) => {
      const isLast = i === arr.length - 1;
      if (isLast) {
        const htmlMatch = seg.match(/^(.+)(\.html?)$/i);
        if (htmlMatch) return stripNotionId(htmlMatch[1]) + htmlMatch[2].toLowerCase();
        const mdMatch = seg.match(/^(.+)(\.md)$/i);
        if (mdMatch) return stripNotionId(mdMatch[1]) + ".md";
      }
      return stripNotionId(seg);
    })
    .filter(Boolean)
    .join("/");
}

// ── Zip file collector ────────────────────────────────────────────────────────

interface ZipFile {
  path: string;
  file: JSZip.JSZipObject;
}

async function collectFiles(
  zip: JSZip,
  md: ZipFile[],
  html: ZipFile[],
): Promise<void> {
  const innerZips: JSZip.JSZipObject[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir || relativePath.startsWith("__MACOSX")) return;
    const lower = relativePath.toLowerCase();
    if (lower.endsWith(".zip")) {
      innerZips.push(zipEntry);
    } else if (lower.endsWith(".md")) {
      md.push({ path: relativePath, file: zipEntry });
    } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      html.push({ path: relativePath, file: zipEntry });
    }
  });

  for (const innerEntry of innerZips) {
    const innerData = await innerEntry.async("arraybuffer");
    const innerZip = await JSZip.loadAsync(innerData);
    await collectFiles(innerZip, md, html);
  }
}

// ── Ancestor stub helpers ─────────────────────────────────────────────────────

function expandNeededAncestors(normDir: string): string[] {
  const parts = normDir.split("/");
  const result: string[] = [];
  for (let i = 2; i <= parts.length; i++) {
    result.push(parts.slice(0, i).join("/"));
  }
  return result;
}

// ── Main parser ───────────────────────────────────────────────────────────────

async function parseNotionZip(file: File): Promise<ParsedPage[]> {
  const zip = await JSZip.loadAsync(file);

  const mdFiles: ZipFile[] = [];
  const htmlFiles: ZipFile[] = [];
  await collectFiles(zip, mdFiles, htmlFiles);

  // ── Normalise all files and build stem maps ────────────────────────────────
  // normalised stem (without extension) → file entry, preferring HTML over MD
  // when both exist for the same page.

  interface FileEntry {
    path: string;
    file: JSZip.JSZipObject;
    ext: "md" | "html";
    id: string;
  }

  // Build normalised entries for MD files
  const mdEntries: FileEntry[] = mdFiles.map((f, i) => ({
    path: f.path,
    file: f.file,
    ext: "md",
    id: `import-${i}`,
  }));

  // Build normalised entries for HTML files (offset IDs past MD range)
  const htmlEntries: FileEntry[] = htmlFiles.map((f, i) => ({
    path: f.path,
    file: f.file,
    ext: "html",
    id: `import-h-${i}`,
  }));

  // For each normalised stem, prefer HTML entry over MD entry.
  // stemToEntry maps: normStem → winning FileEntry
  const stemToEntry = new Map<string, FileEntry>();

  for (const entry of mdEntries) {
    const norm = normalisePath(entry.path);
    const stem = norm.replace(/\.md$/i, "");
    stemToEntry.set(stem, { ...entry, id: `import-${mdEntries.indexOf(entry)}` });
  }
  for (const entry of htmlEntries) {
    const norm = normalisePath(entry.path);
    const stem = norm.replace(/\.html?$/i, "");
    // HTML wins over MD — always overwrite
    stemToEntry.set(stem, { ...entry });
  }

  // Final ordered list: re-assign sequential IDs for determinism
  const entries: Array<FileEntry & { norm: string; stem: string }> = [];
  let idx = 0;
  for (const [stem, entry] of stemToEntry) {
    const norm = stem + (entry.ext === "html" ? ".html" : ".md");
    entries.push({ ...entry, id: `import-${idx++}`, norm, stem });
  }

  // ── Build dirToId and hexToClientId ───────────────────────────────────────
  const dirToId = new Map<string, string>();
  const hexToClientId = new Map<string, string>(); // for MD link rewriting

  for (const entry of entries) {
    dirToId.set(entry.stem, entry.id);
  }

  // Hex IDs from original MD paths (for link rewriting)
  for (const f of mdFiles) {
    const hexMatch = f.path.match(/([0-9a-f]{32})\.md$/i);
    if (!hexMatch) continue;
    const norm = normalisePath(f.path);
    const stem = norm.replace(/\.md$/i, "");
    const clientId = dirToId.get(stem);
    if (clientId) hexToClientId.set(hexMatch[1].toLowerCase(), clientId);
  }

  // ── Stub ancestors ────────────────────────────────────────────────────────
  const allNeeded = new Set<string>();
  for (const entry of entries) {
    const parts = entry.stem.split("/");
    parts.pop();
    const parentDir = parts.join("/");
    if (parentDir) {
      for (const ancestor of expandNeededAncestors(parentDir)) {
        allNeeded.add(ancestor);
      }
    }
  }

  const sortedNeeded = [...allNeeded].sort(
    (a, b) => a.split("/").length - b.split("/").length,
  );

  let stubIdx = entries.length;
  const stubPages: ParsedPage[] = [];

  for (const normDir of sortedNeeded) {
    if (dirToId.has(normDir)) continue;
    const stubId = `import-stub-${stubIdx++}`;
    const title = normDir.split("/").pop() || "Untitled";
    const normParts = normDir.split("/");
    normParts.pop();
    const parentNorm = normParts.join("/");
    const clientParentId = parentNorm ? (dirToId.get(parentNorm) ?? null) : null;
    dirToId.set(normDir, stubId);
    stubPages.push({ clientId: stubId, clientParentId, title, markdown: "" });
  }

  // ── Process each page ─────────────────────────────────────────────────────
  const pages: ParsedPage[] = [];

  for (const entry of entries) {
    // Resolve parent
    const stemParts = entry.stem.split("/");
    stemParts.pop();
    const parentStem = stemParts.join("/");
    const clientParentId = parentStem ? (dirToId.get(parentStem) ?? null) : null;

    const title = parseTitleFromPath(entry.path);

    if (NOTION_SYSTEM_PAGE_TITLES.has(title.toLowerCase())) continue;

    if (entry.ext === "html") {
      // ── HTML page ──────────────────────────────────────────────────────────
      const raw = await entry.file.async("string");
      const { editorJson, icon } = await parseHtmlPage(raw);
      pages.push({
        clientId: entry.id,
        clientParentId,
        title,
        markdown: "",
        editorJson,
        icon,
      });
    } else {
      // ── Markdown page ──────────────────────────────────────────────────────
      const raw = await entry.file.async("string");
      const stripped = stripLocalImages(raw);

      if (isDatabaseRow(stripped)) {
        pages.push({ clientId: entry.id, clientParentId, title, markdown: "" });
        continue;
      }

      const icon = parseIconFromMarkdown(stripped);
      const markdown = rewriteNotionLinks(stripped, hexToClientId);
      pages.push({ clientId: entry.id, clientParentId, title, markdown, icon });
    }
  }

  return [...stubPages, ...pages];
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function NotionImportDialog({ onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ phase: "idle" });
  const qc = useQueryClient();

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setState({
        phase: "error",
        message: "Please select a .zip file containing pages.",
      });
      return;
    }

    try {
      setState({ phase: "parsing" });
      const pages = await parseNotionZip(file);

      const realPages = pages.filter(
        (p) => p.markdown !== "" || p.editorJson !== undefined || p.clientId.startsWith("import-stub"),
      );
      if (realPages.length === 0) {
        setState({
          phase: "error",
          message:
            "No pages found in this zip. Check the browser console (⌘⌥J) for detected paths.",
        });
        return;
      }

      setState({ phase: "uploading" });

      const token = getAccessToken();
      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) authHeaders["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/documents/bulk-import", {
        method: "POST",
        headers: authHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          items: pages.map((p) => ({
            client_id: p.clientId,
            client_parent_id: p.clientParentId,
            title: p.title,
            icon: p.icon ?? null,
            source_markdown: p.markdown || null,
            editor_json: p.editorJson ?? null,
          })),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Import failed (${res.status}): ${text}`);
      }

      const result = (await res.json()) as {
        created: number;
        skipped: number;
        items: ImportResultItem[];
      };

      // Fix 3 — Resolve DOCREF: placeholders in MD pages that had links.
      const pagesWithLinks = pages.filter((p) => p.markdown.includes("DOCREF:"));

      if (pagesWithLinks.length > 0) {
        setState({ phase: "rewriting" });

        const clientIdToRealId = new Map<string, string>();
        for (const item of result.items) {
          clientIdToRealId.set(item.client_id, item.id);
        }

        await Promise.all(
          pagesWithLinks.map(async (p) => {
            const realId = clientIdToRealId.get(p.clientId);
            if (!realId) return;

            const resolved = p.markdown.replace(
              /\(DOCREF:([^)]+)\)/g,
              (_match, targetClientId: string) => {
                const targetRealId = clientIdToRealId.get(targetClientId);
                return targetRealId
                  ? `(/documents/${targetRealId})`
                  : "(broken-link)";
              },
            );

            await fetch(`/api/documents/${realId}`, {
              method: "PATCH",
              headers: authHeaders,
              credentials: "same-origin",
              body: JSON.stringify({ source_markdown: resolved }),
            });
          }),
        );
      }

      qc.invalidateQueries({ queryKey: ["get", "/documents"] });

      setState({
        phase: "done",
        created: result.created,
        skipped: result.skipped,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState({ phase: "error", message: msg });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const isWorking =
    state.phase === "parsing" ||
    state.phase === "uploading" ||
    state.phase === "rewriting";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-card text-card-foreground rounded-xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Import pages</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isWorking}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Instructions */}
        {state.phase === "idle" && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Upload a zip of pages. Hierarchy is inferred from folder
              structure. Notion&rsquo;s HTML export preserves toggle lists and page icons.
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs pl-1">
              <li>• Notion <span className="text-muted-foreground/60">(HTML or Markdown)</span></li>
              <li>• Obsidian</li>
              <li>• Logseq</li>
              <li>• Bear</li>
              <li>• Craft</li>
              <li>• Any markdown zip</li>
            </ul>
          </div>
        )}

        {/* Drop zone */}
        {(state.phase === "idle" || state.phase === "error") && (
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-center text-muted-foreground">
              Drop your export zip here, or click to browse
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        )}

        {/* Error */}
        {state.phase === "error" && (
          <div className="flex items-start gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{state.message}</span>
          </div>
        )}

        {/* Progress */}
        {state.phase === "parsing" && (
          <ProgressRow icon={<Loader2 className="h-4 w-4 animate-spin" />} label="Reading zip…" />
        )}
        {state.phase === "uploading" && (
          <ProgressRow icon={<Loader2 className="h-4 w-4 animate-spin" />} label="Saving to your library…" />
        )}
        {state.phase === "rewriting" && (
          <ProgressRow icon={<Loader2 className="h-4 w-4 animate-spin" />} label="Resolving page links…" />
        )}

        {/* Done */}
        {state.phase === "done" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Import complete — {state.created} page
                {state.created !== 1 ? "s" : ""} added
                {state.skipped > 0 ? `, ${state.skipped} skipped` : ""}.
              </span>
            </div>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressRow({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}

/**
 * fetch-models.js
 *
 * Runs on a schedule via GitHub Actions.
 * Pulls new AI model releases from two sources:
 *   1. HuggingFace API  — open-weights models
 *   2. Official lab RSS / Atom feeds — closed-source announcements (GPT, Claude, Gemini, etc.)
 *
 * Run manually: node scripts/fetch-models.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_PATH = path.join(__dirname, "../public/models.json");

// ── Config ────────────────────────────────────────────────────────────────────

const DAYS_BACK = 10; // slight overlap so no model is missed between runs

const HF_ORGS = [
  { org: "openai",      company: "OpenAI",      color: "#10a37f" },
  { org: "anthropic",   company: "Anthropic",   color: "#e879a0" },
  { org: "google",      company: "Google",      color: "#34d399" },
  { org: "meta-llama",  company: "Meta",        color: "#3b82f6" },
  { org: "deepseek-ai", company: "DeepSeek",    color: "#5b9cf6" },
  { org: "Qwen",        company: "Alibaba",     color: "#f97316" },
  { org: "mistralai",   company: "Mistral AI",  color: "#f59e0b" },
  { org: "moonshotai",  company: "Moonshot AI", color: "#a78bfa" },
  { org: "THUDM",       company: "Zhipu AI",    color: "#facc15" },
  { org: "microsoft",   company: "Microsoft",   color: "#0078d4" },
  { org: "nvidia",      company: "NVIDIA",      color: "#76b900" },
  { org: "01-ai",       company: "01.AI",       color: "#ec4899" },
  { org: "tiiuae",      company: "TII",         color: "#8b5cf6" },
  { org: "cohere",      company: "Cohere",      color: "#39d353" },
  { org: "xai-org",     company: "xAI",         color: "#e5e7eb" },
];

// Low threshold — important models may not have many likes within 24 h of release
const MIN_LIKES = 10;

// Official blog RSS / Atom feeds. Failures are silently skipped.
const RSS_SOURCES = [
  { url: "https://openai.com/blog/rss.xml",                   company: "OpenAI",     color: "#10a37f", license: "Proprietary"  },
  { url: "https://www.anthropic.com/rss.xml",                 company: "Anthropic",  color: "#e879a0", license: "Proprietary"  },
  { url: "https://blog.google/technology/ai/rss/",            company: "Google",     color: "#34d399", license: "Proprietary"  },
  { url: "https://ai.meta.com/blog/rss/",                     company: "Meta",       color: "#3b82f6", license: "Open Weights" },
  { url: "https://mistral.ai/feed.xml",                       company: "Mistral AI", color: "#f59e0b", license: "Mixed"        },
  { url: "https://x.ai/blog/rss.xml",                        company: "xAI",        color: "#e5e7eb", license: "Proprietary"  },
];

// A post title must match at least one of these to be considered a model release
const RELEASE_PATTERNS = [
  /\bintroducing\b/i,
  /\blaunching\b/i,
  /\bannouncing\b/i,
  /\bnew model\b/i,
  /\bour (new|latest|next)\b/i,
  /model (release|update|launch)/i,
  /\b(gpt|claude|gemini|llama|grok|mistral|deepseek|qwen|phi|copilot|o\d)[\s\-]?[\d.]/i,
];

const EXCLUDE_PATTERNS = [
  /partnership/i, /acqui/i, /funding/i, /\bhiring\b/i,
  /safety (report|paper)/i, /policy/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function weekOfMonth(dateStr) {
  return Math.ceil(new Date(dateStr).getDate() / 7);
}

function inferLicense(tags = []) {
  const t = tags.join(" ").toLowerCase();
  if (t.includes("apache-2.0"))                              return "Apache 2.0";
  if (t.includes("mit"))                                     return "MIT";
  if (t.includes("llama"))                                   return "Open Weights";
  if (t.includes("gpl"))                                     return "Open Source";
  if (t.includes("proprietary") || t.includes("commercial")) return "Proprietary";
  return "Open Weights";
}

// Normalise a name so "GPT-5" and "gpt5" map to the same slug for dedup
function slug(name) {
  return name.toLowerCase().replace(/[\s\-_.]/g, "");
}

// ── RSS parsing (no external deps) ───────────────────────────────────────────

function stripCDATA(s) {
  return (s ?? "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function getTag(xml, tag) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() ?? null;
}

function getLinkHref(xml) {
  return xml.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? null;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function parseRSSFeed(xml) {
  const items = [];
  // RSS 2.0 <item>
  for (const [, body] of xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = stripCDATA(getTag(body, "title") ?? "");
    const link  = getTag(body, "link") || getLinkHref(body);
    const date  = parseDate(getTag(body, "pubDate") || getTag(body, "dc:date"));
    if (title) items.push({ title, link, date });
  }
  // Atom <entry>
  for (const [, body] of xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const title = stripCDATA(getTag(body, "title") ?? "");
    const link  = getLinkHref(body) || getTag(body, "link");
    const date  = parseDate(getTag(body, "published") || getTag(body, "updated"));
    if (title) items.push({ title, link, date });
  }
  return items;
}

function isModelRelease(title) {
  return (
    RELEASE_PATTERNS.some((p) => p.test(title)) &&
    !EXCLUDE_PATTERNS.some((p) => p.test(title))
  );
}

function cleanTitle(title) {
  return title
    .replace(/^(introducing|launching|announcing|hello,?\s+|meet\s+|releasing\s+)/i, "")
    .replace(/\s*[:|–—]\s*[\s\S]+$/, "")   // remove subtitle
    .replace(/\s+is (here|now available|available now).*/i, "")
    .trim() || title;
}

// ── HuggingFace ───────────────────────────────────────────────────────────────

async function fetchHFModels(orgEntry, since) {
  const { org, company, color } = orgEntry;
  const url =
    `https://huggingface.co/api/models?author=${org}` +
    `&sort=createdAt&direction=-1&limit=20&full=true`;

  const res = await fetch(url, {
    headers: { "User-Agent": "ModelMonitor/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) { console.warn(`    HTTP ${res.status}`); return []; }

  const data = await res.json();
  const cutoff = new Date(since);

  return data
    .filter((m) => new Date(m.createdAt) >= cutoff && (m.likes ?? 0) >= MIN_LIKES)
    .map((m) => ({
      name:    m.modelId?.split("/")[1] ?? m.id,
      hfId:    m.modelId ?? m.id,
      company,
      date:    m.createdAt.slice(0, 10),
      tags:    (m.tags ?? []).filter((t) => !t.startsWith("en") && t.length < 30).slice(0, 4),
      license: inferLicense(m.tags),
      color,
      source:  "huggingface",
    }));
}

// ── RSS ───────────────────────────────────────────────────────────────────────

async function fetchRSSModels(source, since) {
  const { url, company, color, license } = source;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ModelMonitor/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];

    const xml  = await res.text();
    const items = parseRSSFeed(xml);
    const cutoff = new Date(since);

    return items
      .filter((i) => i.date && i.date >= cutoff && isModelRelease(i.title))
      .map((i) => ({
        name:    cleanTitle(i.title),
        company,
        date:    i.date.toISOString().slice(0, 10),
        tags:    [],
        license,
        color,
        source:  "rss",
        link:    i.link,
      }));
  } catch {
    return []; // feed doesn't exist or timed out — skip silently
  }
}

// ── Enrichment ────────────────────────────────────────────────────────────────

async function fetchSummary(modelName) {
  const q = encodeURIComponent(modelName.replace(/-/g, " "));
  try {
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&fields=title,abstract,tldr&limit=1`,
      { headers: { "User-Agent": "ModelMonitor/1.0" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.data?.[0];
    return p?.tldr?.text ?? p?.abstract?.slice(0, 200) ?? null;
  } catch {
    return null;
  }
}

async function fetchHighlights(hfId) {
  if (!hfId) return [];
  try {
    const res = await fetch(`https://huggingface.co/${hfId}/raw/main/README.md`, {
      headers: { "User-Agent": "ModelMonitor/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    return [...text.matchAll(/^[-*]\s+(.+)/gm)]
      .map((m) => m[1].trim())
      .filter((b) => b.length > 10 && b.length < 120)
      .slice(0, 3);
  } catch {
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("── ModelMonitor fetch-models ──\n");

  const existing    = JSON.parse(fs.readFileSync(MODELS_PATH, "utf8"));
  const knownSlugs  = new Set(existing.map((m) => slug(m.name)));
  let   nextId      = Math.max(...existing.map((m) => m.id), 0) + 1;

  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);
  const sinceStr = since.toISOString();
  console.log(`Looking back ${DAYS_BACK} days (since ${sinceStr.slice(0, 10)})\n`);

  const candidates = [];

  // 1 — HuggingFace
  console.log(`[HuggingFace] Scanning ${HF_ORGS.length} orgs…`);
  for (const entry of HF_ORGS) {
    process.stdout.write(`  ${entry.org}… `);
    try {
      const models = await fetchHFModels(entry, sinceStr);
      process.stdout.write(`${models.length} found\n`);
      candidates.push(...models);
    } catch (e) {
      process.stdout.write(`error (${e.message})\n`);
    }
    await sleep(300);
  }

  // 2 — RSS feeds
  console.log(`\n[RSS] Scanning ${RSS_SOURCES.length} feeds…`);
  for (const src of RSS_SOURCES) {
    process.stdout.write(`  ${src.company}… `);
    const models = await fetchRSSModels(src, sinceStr);
    process.stdout.write(`${models.length} releases\n`);
    candidates.push(...models);
    await sleep(200);
  }

  // 3 — Deduplicate & enrich
  console.log(`\n${candidates.length} candidates total. Filtering duplicates…\n`);
  const newModels = [];

  for (const c of candidates) {
    const s = slug(c.name);
    if (knownSlugs.has(s)) {
      console.log(`  skip (exists): ${c.name}`);
      continue;
    }
    knownSlugs.add(s);
    console.log(`  + ${c.name} (${c.company}) [${c.source}]`);

    await sleep(500);
    const [summary, highlights] = await Promise.all([
      fetchSummary(c.name),
      fetchHighlights(c.hfId ?? null),
    ]);

    newModels.push({
      id:         nextId++,
      name:       c.name,
      company:    c.company,
      date:       c.date,
      week:       weekOfMonth(c.date),
      color:      c.color,
      tags:       c.tags,
      license:    c.license,
      summary:    summary ?? `New release by ${c.company}.`,
      highlights: highlights.length > 0
        ? highlights
        : [`Released by ${c.company}`, `Date: ${c.date}`],
      ...(c.link ? { link: c.link } : {}),
    });
  }

  if (newModels.length === 0) {
    console.log("No new notable models found.");
    return;
  }

  fs.writeFileSync(MODELS_PATH, JSON.stringify([...newModels, ...existing], null, 2));
  console.log(`\n✓ Added ${newModels.length} model(s):`);
  newModels.forEach((m) => console.log(`  • ${m.name} (${m.company})`));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

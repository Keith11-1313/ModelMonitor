/**
 * fetch-models.js
 *
 * Weekly automation script — called by GitHub Actions every Monday.
 * Fetches new model releases from tracked orgs on Hugging Face,
 * enriches them with summaries from Semantic Scholar,
 * and merges them into public/models.json.
 *
 * Run manually: node scripts/fetch-models.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_PATH = path.join(__dirname, "../public/models.json");

// ── Config ────────────────────────────────────────────────────────────────────

/** Only fetch models from these orgs. Add more as needed. */
const TRACKED_ORGS = [
  "openai",
  "anthropic",
  "google",
  "meta-llama",
  "deepseek-ai",
  "Qwen",
  "mistralai",
  "moonshotai",
  "THUDM",        // Zhipu AI / GLM series
];

const COMPANY_NAME_MAP = {
  "openai":       "OpenAI",
  "anthropic":    "Anthropic",
  "google":       "Google",
  "meta-llama":   "Meta",
  "deepseek-ai":  "DeepSeek",
  "Qwen":         "Alibaba",
  "mistralai":    "Mistral AI",
  "moonshotai":   "Moonshot AI",
  "THUDM":        "Zhipu AI",
};

const COMPANY_COLORS = {
  "OpenAI":      "#10a37f",
  "Anthropic":   "#e879a0",
  "Google":      "#34d399",
  "Meta":        "#3b82f6",
  "DeepSeek":    "#5b9cf6",
  "Alibaba":     "#f97316",
  "Mistral AI":  "#f59e0b",
  "Moonshot AI": "#a78bfa",
  "Zhipu AI":    "#facc15",
};

/** Minimum HF likes and downloads to be considered "notable" */
const MIN_LIKES = 50;

/** How many days back to look */
const DAYS_BACK = 7;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function isoWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/** Derive relative week-of-month from a date string */
function weekOfMonth(dateStr) {
  const d = new Date(dateStr);
  return Math.ceil(d.getDate() / 7);
}

/** Infer license string from HF tags */
function inferLicense(tags = []) {
  const t = tags.join(" ").toLowerCase();
  if (t.includes("apache-2.0")) return "Apache 2.0";
  if (t.includes("mit"))        return "MIT";
  if (t.includes("cc-by"))      return "Open Source";
  if (t.includes("llama"))      return "Open Weights";  // Meta Llama uses custom license
  if (t.includes("gpl"))        return "Open Source";
  if (t.includes("proprietary") || t.includes("commercial")) return "Proprietary";
  return "Open Weights"; // default assumption for flagged models
}

// ── HuggingFace fetch ─────────────────────────────────────────────────────────

async function fetchHFModels(org, since) {
  const url =
    `https://huggingface.co/api/models?author=${org}` +
    `&sort=createdAt&direction=-1&limit=10` +
    `&full=true`;

  const res = await fetch(url, {
    headers: { "User-Agent": "ModelMonitor/1.0" },
  });

  if (!res.ok) {
    console.warn(`  [HF] ${org}: HTTP ${res.status}`);
    return [];
  }

  const data = await res.json();
  const cutoff = new Date(since);

  return data
    .filter((m) => {
      const created = new Date(m.createdAt);
      return created >= cutoff && (m.likes ?? 0) >= MIN_LIKES;
    })
    .map((m) => ({
      hfId:    m.modelId || m.id,
      name:    m.modelId?.split("/")[1] ?? m.id,
      org,
      company: COMPANY_NAME_MAP[org] ?? org,
      date:    m.createdAt.slice(0, 10),
      tags:    (m.tags ?? []).filter((t) => !t.startsWith("en") && t.length < 30),
      license: inferLicense(m.tags),
    }));
}

// ── Semantic Scholar fetch ────────────────────────────────────────────────────

async function fetchSummary(modelName) {
  const query = encodeURIComponent(modelName.replace(/-/g, " "));
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search` +
    `?query=${query}&fields=title,abstract,tldr&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ModelMonitor/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const paper = data.data?.[0];
    if (!paper) return null;

    const summary = paper.tldr?.text ?? paper.abstract?.slice(0, 200) ?? null;
    return summary;
  } catch {
    return null;
  }
}

// ── HF model card fetch for highlights ───────────────────────────────────────

async function fetchHighlights(hfId) {
  const url = `https://huggingface.co/${hfId}/raw/main/README.md`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ModelMonitor/1.0" } });
    if (!res.ok) return [];
    const text = await res.text();

    // Extract bullet points from the model card as highlights
    const bullets = [...text.matchAll(/^[-*]\s+(.+)/gm)]
      .map((m) => m[1].trim())
      .filter((b) => b.length > 10 && b.length < 120)
      .slice(0, 3);

    return bullets;
  } catch {
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("── ModelMonitor fetch-models ──");

  // Load current models
  const existing = JSON.parse(fs.readFileSync(MODELS_PATH, "utf8"));
  const existingIds = new Set(existing.map((m) => m.name.toLowerCase()));
  let nextId = Math.max(...existing.map((m) => m.id), 0) + 1;

  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);
  const sinceStr = since.toISOString();

  console.log(`Fetching models since ${sinceStr.slice(0, 10)} from ${TRACKED_ORGS.length} orgs…\n`);

  const newModels = [];

  for (const org of TRACKED_ORGS) {
    console.log(`[HF] Fetching ${org}…`);
    let candidates = [];
    try {
      candidates = await fetchHFModels(org, sinceStr);
    } catch (e) {
      console.warn(`  Error: ${e.message}`);
    }

    for (const c of candidates) {
      if (existingIds.has(c.name.toLowerCase())) {
        console.log(`  ↳ Skip (already exists): ${c.name}`);
        continue;
      }

      console.log(`  ↳ New model: ${c.name} — fetching enrichment…`);

      // Rate-limit: be polite to APIs
      await sleep(500);

      const [summary, highlights] = await Promise.all([
        fetchSummary(c.name),
        fetchHighlights(c.hfId),
      ]);

      newModels.push({
        id:         nextId++,
        name:       c.name,
        company:    c.company,
        date:       c.date,
        week:       weekOfMonth(c.date),
        color:      COMPANY_COLORS[c.company] ?? "#5b9cf6",
        tags:       c.tags.slice(0, 4),
        license:    c.license,
        summary:    summary ?? `New release by ${c.company}. Check the model card for details.`,
        highlights: highlights.length > 0
          ? highlights
          : [`Released by ${c.company}`, `Date: ${c.date}`],
      });

      existingIds.add(c.name.toLowerCase());
    }

    await sleep(300); // org-level rate limit
  }

  if (newModels.length === 0) {
    console.log("\nNo new notable models found this week.");
    return;
  }

  // Prepend new models (newest first)
  const updated = [...newModels, ...existing];
  fs.writeFileSync(MODELS_PATH, JSON.stringify(updated, null, 2));
  console.log(`\n✓ Added ${newModels.length} new model(s) to models.json:`);
  newModels.forEach((m) => console.log(`  • ${m.name} (${m.company})`));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

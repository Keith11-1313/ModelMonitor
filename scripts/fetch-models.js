import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { collectZen, collectCatalog, collectDocs, collectHF, collectOpenRouter, collectGroq, collectGemini, ZEN, CATALOG, DOCS, OPENROUTER, GROQ, GEMINI } from "./collectors.js";
import { day, model, source, mergeKnown, resolveIdentity, migrateLegacy, updateAvailability, appendHistory, sorted, digest, event, applyReveal } from "./pipeline.js";
import { validateCuration, validateData } from "./validation.js";
import { buildTimeline } from "./timeline.js";
import { buildReport } from "./report.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, "public", "data");
const date = day();

async function readJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function save(name, value) {
  const path = join(destination, `${name}.json`);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  let old;
  try { old = await readFile(path, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (old === text) return;
  await writeFile(`${path}.tmp`, text);
  await rename(`${path}.tmp`, path);
}

async function publishCurated(output, previous) {
  const glossary = await readJSON(join(root, "data", "glossary.json"), null);
  const milestones = await readJSON(join(root, "data", "milestones.json"), null);
  assert.ok(glossary && Array.isArray(glossary.terms) && glossary.terms.length, "Glossary data missing");
  assert.ok(milestones && Array.isArray(milestones.milestones) && milestones.milestones.length, "Milestones data missing");
  output.glossary = glossary;
  output.milestones = milestones;
  output.report = buildReport({ previous, current: output, date });
  const snapshot = { schemaVersion: 2, generatedAt: date, snapshot: output.report.snapshot };
  output.snapshot = previous.snapshot?.schemaVersion === 2 && digest(previous.snapshot.snapshot) === digest(snapshot.snapshot) ? previous.snapshot : snapshot;
}

async function main() {
  const archiveBytes = await readFile(join(root, "public", "models.json"));
  const archive = JSON.parse(archiveBytes.toString("utf8"));
  const curation = await readJSON(join(root, "data", "curation.json"));
  validateCuration(curation);
  const names = ["models", "timeline", "availability", "history", "metadata", "limits", "signals", "audit", "cache", "glossary", "milestones", "report", "snapshot"];
  const previous = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readJSON(join(destination, `${name}.json`), name === "history" ? { snapshots: [] } : name === "metadata" ? { sources: [] } : name === "cache" ? {} : [])])));
  if (process.argv.includes("--offline")) {
    assert.ok(previous.metadata.schemaVersion === 1 && previous.models.length, "Offline publishing requires persisted datasets");
    const output = structuredClone(previous);
    validateData(output, archive);
    await publishCurated(output, previous);
    await mkdir(destination, { recursive: true });
    for (const name of ["glossary", "milestones", "report", "snapshot"]) await save(name, output[name]);
    console.log("Published curated datasets and report offline; source data and timestamps unchanged.");
    return;
  }
  const migration = migrateLegacy(archive, date);
  const map = new Map(previous.models.map((m) => [m.id, structuredClone(m)]));
  for (const row of migration.models) {
    const old = map.get(row.id);
    map.set(row.id, old ? { ...old, type: row.type } : row);
  }
  const timeline = [...previous.timeline];
  const history = structuredClone(previous.history);
  const cache = structuredClone(previous.cache);
  const statuses = [];
  const oldStatus = (id) => previous.metadata.sources.find((s) => s.id === id);
  async function collect(id, name, url, action) {
    const old = oldStatus(id);
    try {
      const data = await action();
      statuses.push({ id, name, url, status: "ok", lastChecked: date, lastSuccess: date, count: Array.isArray(data) ? data.length : data.rows?.length ?? data.models?.length });
      console.log(`${id}: ok`);
      return data;
    } catch (error) {
      statuses.push({ id, name, url, status: "error", lastChecked: date, lastSuccess: old?.lastSuccess ?? null, ...(old?.count !== undefined ? { count: old.count } : {}), error: error.message });
      console.warn(`${id}: ${error.message}; preserving previous data`);
      return null;
    }
  }
  const [zen, catalog, docs, openrouter] = await Promise.all([
    collect("opencode", "OpenCode Zen official availability", ZEN, () => collectZen(oldStatus("opencode")?.count)),
    collect("models-dev", "models.dev secondary opencode catalog", CATALOG, () => collectCatalog(oldStatus("models-dev")?.count)),
    collect("zen-docs", "OpenCode Zen official documentation and prices", DOCS, () => collectDocs(oldStatus("zen-docs")?.count)),
    collect("openrouter", "OpenRouter official model catalog", OPENROUTER, () => collectOpenRouter(oldStatus("openrouter")?.count, { apiKey: process.env.OPENROUTER_API_KEY || null })),
  ]);
  if (catalog) cache.catalog = { rows: catalog, lastSuccess: date };
  if (docs) cache.docs = { rows: docs.rows, lastSuccess: date };
  const verified = new Set();
  const revealDates = new Map(curation.reveals.filter((reveal) => reveal.dateSourceUrl).map((reveal) => [reveal.id, { sourceUrl: reveal.dateSourceUrl, evidence: reveal.dateEvidence }]));
  const assertions = [...curation.identities, ...curation.links, ...curation.reveals, ...curation.limits, ...revealDates.values()];
  const evidencePages = new Map([[DOCS, docs?.text ?? null]]);
  for (const assertion of assertions) {
    if (!evidencePages.has(assertion.sourceUrl)) {
      const text = await collect(`evidence:${digest(assertion.sourceUrl).slice(0, 12)}`, "Curated identity evidence", assertion.sourceUrl, async () => {
        const { request, plain } = await import("./collectors.js");
        return plain((await request(assertion.sourceUrl, { text: true })).value);
      });
      evidencePages.set(assertion.sourceUrl, text);
    }
    const page = evidencePages.get(assertion.sourceUrl);
    if (page?.includes(assertion.evidence)) verified.add(assertion);
    else statuses.push({ id: `curation:${digest(assertion).slice(0, 12)}`, name: "Curated assertion verification", url: assertion.sourceUrl, status: "error", lastChecked: date, lastSuccess: null, error: "Source unavailable or exact evidence no longer present; prior assertion retained without refreshing its provenance." });
  }
  for (const identity of curation.identities) {
    if (!verified.has(identity) || map.get(identity.id)?.canonicalId) continue;
    const row = mergeKnown(map.get(identity.id), {
      ...model(identity.id, identity.name, identity.provider, date),
      identity: identity.identity, type: identity.type, summary: identity.summary,
      aliases: [`opencode/${identity.providerModelId}`], confidence: "official",
      sources: [source(identity.sourceUrl, "Source-backed curated identity; protocol does not identify maker", "official", date)],
    });
    map.set(row.id, row);
  }
  const links = curation.links.filter((l) => verified.has(l));
  for (const link of links) {
    if (!map.has(link.modelId)) throw new Error(`Curated link target missing: ${link.modelId}`);
    const row = map.get(link.modelId);
    row.aliases = [...new Set([...row.aliases, link.alias])].sort();
  }
  let availability = structuredClone(previous.availability);
  if (zen) {
    const secondary = new Map((cache.catalog?.rows ?? []).map((r) => [r.id, r]));
    const official = new Map((cache.docs?.rows ?? []).map((r) => [r.id, r]));
    const observations = [];
    for (const { id } of zen) {
      const canonicalId = resolveIdentity(`opencode:${id}`, [...map.values()], links);
      const prior = map.get(canonicalId);
      const supplemental = secondary.get(id);
      const documented = official.get(id);
      const row = mergeKnown(prior, {
        ...(prior ?? model(canonicalId, documented?.name ?? supplemental?.name ?? id, "Unknown", date)),
        aliases: [`opencode/${id}`], lastChecked: date,
        context: supplemental?.context ?? null, reasoning: supplemental?.reasoning ?? null,
        tools: supplemental?.tools ?? null, structuredOutput: supplemental?.structuredOutput ?? null,
        modalities: supplemental?.modalities ?? [],
        sources: [source(ZEN, "Official Zen membership; not maker attribution or release date", "official", date),
          ...(supplemental ? [source(CATALOG, "Secondary catalog capabilities; exact provider model ID", "observed", cache.catalog.lastSuccess)] : [])],
      });
      map.set(canonicalId, row);
      const price = documented?.pricing ?? supplemental?.pricing ?? null;
      const priorAvailability = previous.availability.find((a) => a.id === `opencode:${id}`);
      const priceSources = documented?.pricing ? [source(DOCS, "Official published Zen token prices", "official", cache.docs.lastSuccess)] : supplemental?.pricing ? [source(CATALOG, "Secondary catalog prices; not verified official pricing", "observed", cache.catalog.lastSuccess)] : [];
      const priceDate = documented?.pricing ? cache.docs.lastSuccess : supplemental?.pricing ? cache.catalog.lastSuccess : null;
      const preservePrice = priorAvailability?.pricing && ((!documented?.pricing && priorAvailability.sources.some((s) => s.url === DOCS && s.label.includes("prices"))) || (priceDate && priorAvailability.sources.some((s) => s.label.includes("prices") && s.lastChecked > priceDate)));
      observations.push({
        id: `opencode:${id}`, modelId: canonicalId, provider: "opencode", providerModelId: id,
        status: "available", free: preservePrice ? priorAvailability.free : price ? price.input === 0 && price.output === 0 : null,
        context: row.context, reasoning: row.reasoning, tools: row.tools, structuredOutput: row.structuredOutput,
        modalities: row.modalities, pricing: preservePrice ? priorAvailability.pricing : price,
        confidence: "official", sources: [...row.sources.filter((s) => s.url === ZEN || s.url === CATALOG), ...priceSources],
        firstSeen: date, lastChecked: date,
        notes: "Availability is official; capability and price provenance is field-specific in sources. Null means unknown. Free is token pricing, not an unlimited usage entitlement. Documented discounts and tier conditions may apply; consult source.",
      });
      if (!prior && history.snapshots.some((s) => s.provider === "opencode") && row.type === "stealth") timeline.push(event("stealth_appearance", row, date, undefined, undefined, timeline.length));
    }
    const baseline = !history.snapshots.some((s) => s.provider === "opencode");
    const result = updateAvailability(previous.availability, observations, "opencode", date, baseline, timeline.length);
    availability = result.availability;
    timeline.push(...result.events);
    appendHistory(history, availability, "opencode", date);
  }
  if (openrouter) {
    const observations = [];
    for (const item of openrouter) {
      const entityId = `openrouter:${item.id}`;
      const prior = map.get(entityId);
      const row = mergeKnown(prior, {
        ...(prior ?? model(entityId, item.name, "Unknown", date)),
        aliases: [item.id, `openrouter/${item.id}`], identity: "unknown", confidence: "official",
        context: item.context, reasoning: item.reasoning, tools: item.tools, structuredOutput: item.structuredOutput, modalities: item.modalities,
        hfId: item.hfId, lastChecked: date,
        sources: [source(OPENROUTER, "Official OpenRouter catalog metadata for this provider-scoped endpoint; not maker attribution or release evidence", "official", date)],
      });
      map.set(entityId, row);
      observations.push({
        id: `openrouter:${item.id}`, modelId: entityId, provider: "openrouter", providerModelId: item.id,
        status: "available", free: item.pricing ? item.pricing.input === 0 && item.pricing.output === 0 : null,
        context: item.context, reasoning: item.reasoning, tools: item.tools, structuredOutput: item.structuredOutput, modalities: item.modalities,
        pricing: item.pricing, confidence: "official",
        sources: [source(OPENROUTER, "Official OpenRouter model catalog availability and token pricing", "official", date)],
        firstSeen: date, lastChecked: date,
        notes: "OpenRouter free endpoints have zero token pricing but remain subject to account and provider rate limits. A free endpoint is not an unlimited entitlement.",
      });
    }
    const baseline = !history.snapshots.some((s) => s.provider === "openrouter");
    const result = updateAvailability(availability, observations, "openrouter", date, baseline, timeline.length);
    availability = result.availability;
    timeline.push(...result.events);
    appendHistory(history, availability, "openrouter", date);
  }

  const optionalProviderCollectors = [
    {
      id: "groq", name: "Groq official active model catalog", url: GROQ, key: process.env.GROQ_API_KEY,
      action: () => collectGroq(process.env.GROQ_API_KEY, oldStatus("groq")?.count),
      normalize: (item) => ({ context: item.context, reasoning: null, tools: null, structuredOutput: null, modalities: ["text"] }),
    },
    {
      id: "gemini", name: "Google Gemini API official model catalog", url: GEMINI, key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      action: () => collectGemini(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, oldStatus("gemini")?.count),
      normalize: (item) => ({ context: item.context, reasoning: null, tools: item.methods?.some((m) => /generateContent|interactions/i.test(m)) ? null : null, structuredOutput: null, modalities: [] }),
    },
  ];
  for (const providerSource of optionalProviderCollectors) {
    if (!providerSource.key) continue;
    const rows = await collect(providerSource.id, providerSource.name, providerSource.url, providerSource.action);
    if (!rows) continue;
    const observations = [];
    for (const item of rows) {
      const entityId = `${providerSource.id}:${item.id}`;
      const prior = map.get(entityId);
      const extra = providerSource.normalize(item);
      const row = mergeKnown(prior, {
        ...(prior ?? model(entityId, item.name || item.id, "Unknown", date)),
        aliases: [`${providerSource.id}/${item.id}`], identity: "unknown", confidence: "official", lastChecked: date, ...extra,
        sources: [source(providerSource.url, `Official ${providerSource.id} API catalog; provider-scoped availability only`, "official", date)],
      });
      map.set(entityId, row);
      observations.push({
        id: `${providerSource.id}:${item.id}`, modelId: entityId, provider: providerSource.id, providerModelId: item.id, status: "available",
        free: null, pricing: null, confidence: "official", firstSeen: date, lastChecked: date, ...extra,
        sources: [source(providerSource.url, `Official ${providerSource.id} API model availability; free-tier eligibility is tracked separately`, "official", date)],
        notes: "This endpoint is listed by the provider API. Model-level free eligibility is not inferred from catalog membership; see the provider free-access program card.",
      });
    }
    const baseline = !history.snapshots.some((s) => s.provider === providerSource.id);
    const result = updateAvailability(availability, observations, providerSource.id, date, baseline, timeline.length);
    availability = result.availability;
    timeline.push(...result.events);
    appendHistory(history, availability, providerSource.id, date);
  }

  for (let offset = 0; offset < curation.hfOrganizations.length; offset += 3) {
    await Promise.all(curation.hfOrganizations.slice(offset, offset + 3).map(async (organization) => {
      const id = `hf:${organization.org}`;
      const url = `https://huggingface.co/api/models?author=${encodeURIComponent(organization.org)}&sort=createdAt&direction=-1&limit=${curation.hfRecentPerOrganization}&full=true&config=true&cardData=true`;
      const existing = [...map.values()].filter((m) => m.hfId?.split("/")[0] === organization.org);
      const result = await collect(id, `Hugging Face official organization: ${organization.org}`, url, () => collectHF(organization, curation.hfRecentPerOrganization, existing, date));
      if (!result) return;
      if (result.errors.length) {
        const status = statuses.find((s) => s.id === id);
        status.status = "error";
        status.lastSuccess = oldStatus(id)?.lastSuccess ?? null;
        status.error = `Partial detail failure: ${result.errors.map((e) => `${e.id}: ${e.error}`).join("; ")}`;
      }
      for (const row of result.models) {
        const old = map.get(row.id);
        const next = mergeKnown(old, row);
        if (old?.license && !row.license) next.openness = old.openness;
        map.set(row.id, next);
      }
    }));
  }
  for (const reveal of curation.reveals) {
    if (!verified.has(reveal) || (revealDates.has(reveal.id) && !verified.has(revealDates.get(reveal.id)))) continue;
    applyReveal([...map.values()], availability, timeline, reveal, date);
  }
  if (zen) appendHistory(history, availability, "opencode", date);
  const limits = curation.limits.map((limit) => {
    const old = previous.limits.find((l) => l.provider === limit.provider && l.product === limit.product && l.plan === limit.plan);
    const { evidence, ...value } = limit;
    return verified.has(limit) ? { ...value, lastChecked: date } : old;
  }).filter(Boolean);
  const metadata = {
    schemaVersion: 1, generatedAt: date, sources: sorted(statuses),
    archive: { url: "/public/models.json", count: archive.length, sha256: digest(archiveBytes) },
    limitations: [
      "firstSeen is the first local observation, never an inferred launch date. API created timestamps and HF repository creation dates are not release dates.",
      "The first successful provider snapshot is a baseline, not a batch of new releases or availability-added events. History only covers observations since this pipeline began.",
      "models.dev is a secondary catalog. Only exact IDs in the live official Zen endpoint establish current Zen availability. API protocol and SDK packages never identify a maker.",
      "Unknown provider means no curated maker attribution, even for familiar names. Provider-scoped IDs are intentionally not fuzzy-merged with HF or legacy records; duplicate underlying models may remain.",
      "Legacy entities are unverified, have null release dates, and retain a separate legacyReportDate. Blog/product stories are separated from conservative model candidates; all archive reports remain unverified pending review; archive summaries and benchmarks are never imported.",
      "open_source is shorthand for a recognized permissive weight license, not full OSI AI certification. Restrictive recognized licenses are open_weights; missing, custom or ambiguous licenses stay unknown. HF hosting alone establishes neither.",
      `HF coverage is selected official organizations, latest ${curation.hfRecentPerOrganization} repositories per organization plus all previously observed repositories. Full per-repository metadata is fetched; this is not a complete release census. HF removals are not inferred from this rolling selection.`,
      "Fine-tunes, quantizations and optimizations are not foundation releases. Unclassified repositories use type=model, not foundation. No launch or benchmark claims are derived from names, parameter suffixes, or repository creation timestamps.",
      "Source failures retain known fields and prices. A greater-than-25-percent catalog contraction is rejected for review, which may delay real mass-removal detection. Individual HF metadata failures retain their prior rows.",
      "Prices are USD per million tokens; official documentation takes precedence over secondary catalog prices. Free does not mean unlimited. Conditional discounts, input length tiers and fees require checking the source. Unknown free status is neither free nor paid.",
      "Observation timestamps have UTC day precision to limit six-hour schedule churn. Same-day meaningful transitions append ordered snapshots/events; no-change checks refresh at most daily. Generated time is a build date, not evidence that every source succeeded.",
      "OpenRouter is collected from its official model catalog. Groq and Gemini API catalogs are optional and run only when their GitHub Actions secrets are configured; provider free-tier documentation is verified separately. Signals and verified release dates remain source-backed; published deprecation does not imply endpoint removal.",
    ],
  };
  const output = { models: sorted([...map.values()]), timeline: buildTimeline([...map.values()], availability, timeline), availability: sorted(availability), history, metadata, limits, signals: previous.signals, audit: migration.audit, cache };
  validateData(output, archive);
  await publishCurated(output, previous);
  if (digest(await readFile(join(root, "public", "models.json"))) !== digest(archiveBytes)) throw new Error("Legacy archive changed during collection");
  await mkdir(destination, { recursive: true });
  for (const name of names.filter((n) => n !== "metadata")) await save(name, output[name]);
  await save("metadata", metadata);
  console.log(`Validated ${output.models.length} entities, ${availability.length} availability rows, ${output.timeline.length} events; legacy ${archive.length} entries unchanged.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });


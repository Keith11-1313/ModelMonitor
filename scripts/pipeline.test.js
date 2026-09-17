import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { model, source, licenseOf, classify, migrateLegacy, resolveIdentity, mergeKnown, updateAvailability, appendHistory, reconstruct, digest, applyReveal } from "./pipeline.js";
import { guardRows, collectZen, collectCatalog, collectHF, collectOpenRouter, collectGroq, collectGemini, normalizeHF, parseDocs, request } from "./collectors.js";
import { validateData, validateCuration, validDate } from "./validation.js";

const date = "2026-09-17";
const provenance = [source("https://opencode.ai/zen/v1/models", "Official membership", "official", date)];
const price = (free) => ({ input: free ? 0 : 1, output: free ? 0 : 2, cachedInput: null, currency: "USD", unit: "1M tokens" });
const listing = (id = "a", free = false) => ({
  id: `opencode:${id}`, modelId: `opencode:${id}`, provider: "opencode", providerModelId: id,
  status: "available", free, pricing: free === null ? null : price(free),
  context: null, reasoning: null, tools: null, structuredOutput: null, modalities: [],
  confidence: "official", sources: provenance, firstSeen: date, lastChecked: date,
});
const response = (value) => async () => new Response(JSON.stringify(value), { status: 200 });
const emptyData = () => ({ models: [], timeline: [], availability: [], history: { snapshots: [] }, metadata: { schemaVersion: 1, generatedAt: date, sources: [], limitations: [] }, limits: [], signals: [], audit: [] });

 test("first snapshot establishes a baseline without invented releases", () => {
  const result = updateAvailability([], [listing()], "opencode", date, true);
  assert.deepEqual(result.events, []);
  const history = appendHistory({ snapshots: [] }, result.availability, "opencode", date);
  assert.equal(history.snapshots[0].baseline, true);
  assert.equal(history.snapshots[0].available, 1);
});

test("free and paid transitions are explicit and unknown is neither", () => {
  const initial = [listing()];
  const free = updateAvailability(initial, [listing("a", true)], "opencode", date, false);
  assert.deepEqual(free.events.map((e) => e.type), ["became_free", "price_change"]);
  const paid = updateAvailability(free.availability, [listing()], "opencode", date, false, 2);
  assert.deepEqual(paid.events.map((e) => e.type), ["no_longer_free", "price_change"]);
  const known = updateAvailability([listing("a", null)], [listing("a", true)], "opencode", date, false);
  assert.equal(known.events.some((e) => e.type === "became_free"), false);
  const history = appendHistory({ snapshots: [] }, [listing("a", null)], "opencode", date);
  assert.equal(history.snapshots[0].unknown, 1);
  assert.equal(history.snapshots[0].paid, 0);
});

test("removal and reappearance retain firstSeen and stable ID", () => {
  const first = [listing(), listing("b")];
  const removed = updateAvailability(first, [listing("b")], "opencode", "2026-09-18", false);
  assert.equal(removed.availability[0].status, "removed");
  assert.equal(removed.events[0].type, "availability_removed");
  const back = updateAvailability(removed.availability, first, "opencode", "2026-09-19", false);
  assert.equal(back.availability[0].firstSeen, date);
  assert.equal(back.availability[0].removedAt, undefined);
  assert.equal(back.events[0].type, "availability_added");
});

test("source failures and suspicious emptiness do not remove membership", async () => {
  assert.throws(() => guardRows([]), /Empty/);
  assert.throws(() => guardRows([{ id: "a" }], 10), /truncation/);
  assert.throws(() => guardRows([{ id: "a" }, { id: "a" }]), /duplicate/);
  await assert.rejects(collectZen(0, { fetcher: response({ object: "list", data: [] }) }), /Empty/);
  await assert.rejects(collectZen(0, { fetcher: response({ object: "list", has_more: true, data: [] }) }), /Incomplete/);
  await assert.rejects(collectCatalog(0, { fetcher: response({}) }), /Missing/);
  await assert.rejects(request("https://opencode.ai/zen/v1/models", { fetcher: async () => new Response("", { status: 503 }) }), /503/);
  for (const value of [null, []]) assert.deepEqual(updateAvailability([listing()], value, "opencode", date, false), { availability: [listing()], events: [] });
});

test("requests have isolated AbortSignals", async () => {
  const signals = [];
  const fetcher = async (url, options) => { signals.push(options.signal); return new Response("{}"); };
  await Promise.all([request("https://models.dev/api.json", { fetcher }), request("https://models.dev/api.json", { fetcher })]);
  assert.notEqual(signals[0], signals[1]);
  assert.ok(signals.every((s) => s instanceof AbortSignal));
});

test("failed or missing metadata preserves prices and known capabilities", () => {
  const old = { ...listing(), context: 1000, reasoning: true, modalities: ["text"] };
  const update = { ...listing("a", null), context: null, reasoning: null, modalities: [] };
  const result = updateAvailability([old], [update], "opencode", date, false);
  assert.deepEqual(result.events, []);
  assert.equal(result.availability[0].context, 1000);
  assert.equal(result.availability[0].reasoning, true);
  assert.deepEqual(result.availability[0].pricing, old.pricing);
});

test("exact canonical identity rejects ambiguity and does not fuzzy match", () => {
  const a = { ...model("hf:lab/A-B", "A B", "Lab", date), aliases: ["exact"] };
  const b = { ...model("hf:lab/AB", "AB", "Lab", date), aliases: ["exact"] };
  assert.equal(resolveIdentity("AB", [a]), "AB");
  assert.equal(resolveIdentity("exact", [a]), a.id);
  assert.throws(() => resolveIdentity("exact", [a, b]), /Ambiguous/);
  assert.equal(resolveIdentity("opencode:alias", [a], [{ alias: "opencode:alias", modelId: a.id }]), a.id);
  assert.equal(resolveIdentity("hf:lab/A-B", [a]), a.id);
});

test("license classification uses actual card or license tags only", () => {
  assert.deepEqual(licenseOf({ tags: ["mit", "llama", "safetensors"] }), { license: null, openness: "unknown" });
  assert.equal(licenseOf({ cardData: { license: "apache-2.0" } }).openness, "open_source");
  assert.equal(licenseOf({ tags: ["license:mit"] }).openness, "open_source");
  assert.equal(licenseOf({ tags: ["license:llama3.1"] }).openness, "open_weights");
  assert.equal(licenseOf({ cardData: { license: "other" } }).openness, "unknown");
  assert.equal(licenseOf({ cardData: { license: "mit" }, tags: ["license:other"] }).openness, "unknown");
});

test("derivative classification never calls variants foundation releases", () => {
  assert.equal(classify({ id: "nvidia/Model-NVFP4" }), "quantization");
  assert.equal(classify({ id: "lab/Model", tags: ["base_model:quantized:lab/Base"] }), "quantization");
  assert.equal(classify({ id: "lab/Model-DSpark" }), "optimization");
  assert.equal(classify({ id: "lab/Model", cardData: { base_model: "lab/Base" } }), "fine_tune");
  assert.equal(classify({ id: "lab/Model-Instruct" }), "fine_tune");
  assert.equal(classify({ id: "lab/Model-preview" }), "preview");
  assert.equal(classify({ id: "lab/Model" }), "model");
  assert.equal(classify({ id: 104, name: "Model-NVFP4" }), "quantization");
});

test("HF detail metadata does not infer release dates or parameters from names", () => {
  const result = normalizeHF({ id: "openai/Test-20B", createdAt: "2026-01-01T00:00:00.000Z", config: {}, tags: [] }, { org: "openai", provider: "OpenAI" }, date);
  assert.equal(result.releaseDate, null);
  assert.equal(result.parameters, null);
  assert.equal(result.openness, "unknown");
  assert.equal(result.firstSeen, date);
  assert.equal(result.identity, "known");
  assert.throws(() => normalizeHF({ id: "other/Test" }, { org: "openai" }, date), /mismatch/);
});

test("HF full-detail failures are isolated and old repositories are rechecked", async () => {
  const seen = [];
  const fetcher = async (url) => {
    seen.push(url);
    if (url.includes("?author=")) return new Response(JSON.stringify([{ id: "openai/New" }]));
    if (url.endsWith("/Old")) return new Response("", { status: 503 });
    return new Response(JSON.stringify({ id: "openai/New", config: {}, cardData: { license: "mit" } }));
  };
  const result = await collectHF({ org: "openai", provider: "OpenAI" }, 1, [{ hfId: "openai/Old" }], date, { fetcher });
  assert.equal(result.models.length, 1);
  assert.equal(result.errors[0].id, "openai/Old");
  assert.ok(seen.some((url) => url.endsWith("/Old")));
});

test("legacy audit retains every archive record without unsupported metadata", async () => {
  const bytes = await readFile(new URL("../public/models.json", import.meta.url));
  const archive = JSON.parse(bytes);
  const migration = migrateLegacy(archive, date);
  assert.equal(archive.length, 104);
  assert.equal(migration.models.length, 104);
  assert.equal(migration.audit.length, 104);
  assert.equal(migration.models.find((m) => m.id === "legacy:101").type, "product_announcement");
  assert.equal(migration.models.find((m) => m.id === "legacy:104").type, "quantization");
  assert.ok(migration.models.every((m) => m.summary === undefined && m.parameters === null && m.releaseDate === null && m.confidence === "unverified"));
  const data = { ...emptyData(), ...migration };
  assert.equal(validateData(data, archive), true);
  assert.equal(digest(bytes), digest(await readFile(new URL("../public/models.json", import.meta.url))));
});

test("curation keeps unknown identities neutral and requires sourced reveal dates", async () => {
  const curation = JSON.parse(await readFile(new URL("../data/curation.json", import.meta.url)));
  validateCuration(curation);
  for (const identity of curation.identities.filter((row) => row.identity === "unknown")) assert.equal(identity.provider, "Unknown");
  for (const reveal of curation.reveals) if (reveal.dateSourceUrl) assert.ok(reveal.dateEvidence.includes(reveal.date));
  const invalid = structuredClone(curation);
  invalid.identities[0].firstSeen = "2026-09-16";
  assert.throws(() => validateCuration(invalid), /fabricated dates/);
  invalid.identities[0] = curation.identities[0];
  const sourceUrl = curation.identities[0].sourceUrl;
  invalid.links = [{ alias: "a", modelId: "b", sourceUrl, evidence: "x" }, { alias: "a", modelId: "c", sourceUrl, evidence: "x" }];
  assert.throws(() => validateCuration(invalid), /Ambiguous/);
});

test("retained reveal aliases and redirect IDs survive subsequent enrichment", () => {
  const row = { ...model("hf:lab/Confirmed", "Confirmed", "Lab", date), identity: "known", aliases: ["opencode:stealth", "Stealth", "opencode/stealth"] };
  const enriched = mergeKnown(row, { aliases: ["lab/Confirmed"], firstSeen: "2026-09-18", context: 2000 });
  assert.equal(enriched.firstSeen, date);
  assert.ok(enriched.aliases.includes("Stealth"));
  assert.equal(resolveIdentity("opencode:stealth", [enriched]), enriched.id);
  assert.ok(enriched.aliases.includes("lab/Confirmed"));
});

test("source-backed reveals preserve historical entities, events and future resolution", () => {
  const from = { ...model("opencode:a", "Stealth", "Unknown", date), sources: provenance };
  const to = { ...model("hf:lab/Confirmed", "Confirmed", "Lab", date), identity: "known", sources: provenance };
  const models = [from, to];
  const availability = [listing()];
  const timeline = [];
  const reveal = { id: "reveal:test", fromId: from.id, toId: to.id, date, sourceUrl: "https://opencode.ai/docs/zen/" };
  applyReveal(models, availability, timeline, reveal, date);
  assert.equal(models.length, 2);
  assert.equal(from.canonicalId, to.id);
  assert.equal(availability[0].modelId, to.id);
  assert.equal(resolveIdentity(from.id, models), to.id);
  assert.ok(to.aliases.includes("Stealth"));
  assert.equal(timeline[0].previousAlias, "Stealth");
  const serialized = JSON.stringify(timeline);
  applyReveal(models, availability, timeline, reveal, "2026-09-18");
  assert.equal(JSON.stringify(timeline), serialized);
  assert.throws(() => applyReveal(models, availability, timeline, { ...reveal, fromId: to.id, toId: from.id }, date), /Cyclic/);
});

test("delta history reconstructs membership, unknowns, removals and reappearance", () => {
  const history = { snapshots: [] };
  appendHistory(history, [listing(), listing("b", true)], "opencode", date);
  appendHistory(history, [listing(), listing("b", true)], "opencode", date);
  assert.equal(history.snapshots.length, 1);
  appendHistory(history, [{ ...listing(), status: "removed" }, listing("b", false)], "opencode", date);
  appendHistory(history, [listing("a", null), listing("b", false)], "opencode", "2026-09-18");
  assert.deepEqual(reconstruct(history, "opencode", 0).map((r) => r.id), ["opencode:a", "opencode:b"]);
  assert.deepEqual(reconstruct(history, "opencode", 1).map((r) => r.id), ["opencode:b"]);
  assert.equal(reconstruct(history, "opencode")[0].free, null);
  assert.equal(history.snapshots[1].upsert.length, 1);
  appendHistory(history, [listing("a", null), listing("b", false)], "opencode", "2026-09-19");
  assert.deepEqual(history.snapshots.at(-1).upsert, []);
});

test("same-day repeated transitions have distinct immutable event IDs", () => {
  const first = updateAvailability([listing()], [listing("a", true)], "opencode", date, false, 0);
  const second = updateAvailability([listing()], [listing("a", true)], "opencode", date, false, first.events.length + 2);
  assert.notEqual(first.events[0].id, second.events[0].id);
});

test("same-day unchanged normalization and history are deterministic", () => {
  const first = updateAvailability([], [listing()], "opencode", date, true);
  const next = updateAvailability(first.availability, [listing()], "opencode", date, false);
  assert.deepEqual(next.availability, first.availability);
  assert.deepEqual(next.events, []);
});

test("documentation prices are exact-name joined, tiered and protocol-independent", () => {
  const endpoints = Array.from({ length: 10 }, (_, i) => `<tr><td>Model ${i}</td><td>model-${i}</td><td>@ai-sdk/anthropic</td></tr>`).join("");
  const prices = Array.from({ length: 10 }, (_, i) => `<tr><td>Model ${i}</td><td>${i ? "$1.00" : "Free"}</td><td>${i ? "$2.00" : "Free"}</td><td>-</td><td>-</td></tr>`).join("");
  const html = `<table><tr><th>Model ID</th></tr>${endpoints}</table><table><tr><th>Cached Read</th></tr>${prices}<tr><td>Model 1 (&gt; 200K tokens)</td><td>$3</td><td>$4</td><td>-</td><td>-</td></tr></table>`;
  const docs = parseDocs(html);
  assert.equal(docs.rows[0].pricing.input, 0);
  assert.equal(docs.rows[1].pricing.tiers[0].contextAbove, 200000);
  assert.equal(docs.rows[0].provider, undefined);
  assert.throws(() => parseDocs("<html>error</html>"), /truncated/);
});



test("OpenRouter normalizes official pricing and free variants without maker inference", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: `lab/model-${i}${i === 0 ? ":free" : ""}`, name: `Model ${i}`, context_length: 128000,
    pricing: { prompt: i === 0 ? "0" : "0.000001", completion: i === 0 ? "0" : "0.000002" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    supported_parameters: ["tools", "response_format"],
    reasoning: i === 0 ? { mandatory: false } : null,
  }));
  const result = await collectOpenRouter(0, { fetcher: response({ data: rows }) });
  assert.equal(result.length, 10);
  assert.equal(result[0].pricing.input, 0);
  assert.equal(result[1].pricing.input, 1);
  assert.equal(result[1].pricing.output, 2);
  assert.equal(result[0].reasoning, true);
  assert.equal(result[0].tools, true);
  assert.equal(result[0].structuredOutput, true);
});

test("Groq and Gemini live catalogs are optional authenticated collectors", async () => {
  assert.equal(await collectGroq(null), null);
  assert.equal(await collectGemini(null), null);
  const groq = await collectGroq("key", 0, { fetcher: response({ data: [{ id: "model-a", owned_by: "Lab", active: true, context_window: 8192 }] }) });
  assert.deepEqual(groq, [{ id: "model-a", name: "model-a", owner: "Lab", context: 8192 }]);
  const gemini = await collectGemini("key", 0, { fetcher: response({ models: [{ name: "models/gemini-test", displayName: "Gemini Test", inputTokenLimit: 1000, outputTokenLimit: 200, supportedGenerationMethods: ["generateContent"] }] }) });
  assert.equal(gemini[0].id, "gemini-test");
  assert.equal(gemini[0].context, 1000);
});
test("JSON validation accepts empty states and rejects broken references, dates and provenance", () => {
  assert.equal(validateData(emptyData()), true);
  assert.equal(validDate("2026-02-30"), false);
  const data = emptyData();
  const row = { ...model("opencode:a", "A", "Unknown", date), sources: provenance };
  data.models.push(row);
  data.availability.push(listing());
  appendHistory(data.history, data.availability, "opencode", date);
  assert.equal(validateData(JSON.parse(JSON.stringify(data))), true);
  const invalid = structuredClone(data);
  invalid.availability[0].modelId = "missing";
  assert.throws(() => validateData(invalid), /Dangling/);
  invalid.availability[0].modelId = row.id;
  invalid.models[0].sources = [];
  assert.throws(() => validateData(invalid), /provenance/);
  invalid.models[0].sources = provenance;
  invalid.models[0].firstSeen = "2026-02-30";
  assert.throws(() => validateData(invalid));
  const count = structuredClone(data);
  count.history.snapshots[0].available = 99;
  assert.throws(() => validateData(count), /membership/);
});

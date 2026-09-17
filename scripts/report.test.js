import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildReport } from "./report.js";
import { model, source } from "./pipeline.js";

const date = "2026-09-18";
const url = "https://opencode.ai/zen/v1/models";
const sources = [source(url, "Official membership and prices", "official", date)];
const listing = () => ({
  id: "opencode:a", modelId: "opencode:a", provider: "opencode", providerModelId: "a",
  status: "available", free: false, pricing: { input: 1, output: 2, cachedInput: null, currency: "USD", unit: "1M tokens" },
  context: null, reasoning: null, tools: null, structuredOutput: null, modalities: [],
  confidence: "official", sources: structuredClone(sources), firstSeen: date, lastChecked: date,
});
const fixture = () => ({
  models: [{ ...model("opencode:a", "A", "Lab", date), confidence: "official", sources: structuredClone(sources) }],
  availability: [listing()], timeline: [], milestones: { schemaVersion: 1, milestones: [] },
  metadata: { schemaVersion: 1, generatedAt: date, limitations: [], sources: [{ id: "opencode", name: "Zen", url, status: "ok", lastChecked: date, lastSuccess: date }] },
  history: { snapshots: [] }, limits: [], signals: [], audit: [], cache: {},
});
const baseline = (current = fixture()) => ({ ...structuredClone(current), report: buildReport({ current, date }) });
const run = (previous, current, observedAt = date) => buildReport({ previous, current, date: observedAt });
const zero = (report) => assert.ok(Object.values(report.summary).every((value) => value === 0));
const historical = () => ({ id: "release:a", modelId: "opencode:a", date: "2020-01-01", type: "model_release", title: "A release", notable: true, confidence: "official", sources: structuredClone(sources) });
const milestone = () => ({ id: "milestone:a", title: "A", date: "2020-01-01", eventType: "model_release", confidence: "official", sourceUrl: url, sourceLabel: "Official release" });

test("baseline and schema migration never fabricate launches or catalog changes", () => {
  const current = fixture();
  current.timeline.push(historical());
  current.milestones.milestones.push(milestone());
  for (const previous of [undefined, { ...fixture(), report: { schemaVersion: 1, generatedAt: "2010-01-01" } }]) {
    const report = run(previous, current);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.baseline, true);
    assert.equal(report.periodStart, null);
    zero(report);
    for (const key of ["modelChanges", "availabilityChanges", "pricingChanges", "openModelChanges", "historicalChanges", "changeLog", "highlights"]) assert.deepEqual(report[key], []);
    assert.deepEqual(Object.keys(report).sort(), ["schemaVersion", "baseline", "generatedAt", "periodStart", "periodEnd", "summary", "highlights", "modelChanges", "availabilityChanges", "pricingChanges", "openModelChanges", "historicalChanges", "changeLog", "watchlist", "health", "snapshot"].sort());
  }
});

test("same-day no-op is byte stable and ignores timestamps, ordering and popularity", () => {
  const current = fixture();
  current.models[0].aliases = ["b", "a"];
  current.models[0].modalities = ["text", "image"];
  const previous = baseline(current);
  const next = structuredClone(current);
  next.models[0].aliases.reverse();
  next.models[0].modalities.reverse();
  next.models[0].likes = 123;
  next.models[0].downloads = 456;
  next.models[0].lastChecked = `${date}T01:00:00Z`;
  assert.equal(JSON.stringify(run(previous, next)), JSON.stringify(previous.report));
  assert.deepEqual(previous.models, current.models);
});

test("daily checks only refresh health metadata when facts and freshness counts are unchanged", () => {
  const previous = baseline();
  const current = structuredClone(previous);
  current.metadata.generatedAt = "2026-09-19";
  current.metadata.sources[0].lastChecked = "2026-09-19";
  current.metadata.sources[0].lastSuccess = "2026-09-19";
  current.availability[0].lastChecked = "2026-09-19";
  current.availability[0].sources[0].lastChecked = "2026-09-19";
  const report = run(previous, current, "2026-09-19");
  assert.deepEqual({ ...report, health: previous.report.health }, previous.report);
  assert.equal(report.health.checkedAt, "2026-09-19");
});

test("actual normalized prior data detects same-day transitions with stable, distinct IDs", () => {
  const previous = baseline();
  previous.report.periodEnd = "2099-01-01";
  const current = fixture();
  current.availability[0].free = true;
  current.availability[0].pricing.input = 0;
  current.availability[0].pricing.output = 0;
  const report = run(previous, current);
  assert.deepEqual(report, run(previous, current));
  assert.equal(report.summary.becameFree, 1);
  assert.equal(report.summary.priceChanges, 1);
  assert.equal(report.snapshot.freeEndpoints, 1);
  assert.equal(report.snapshot.paidEndpoints, 0);
  assert.equal(report.pricingChanges.find((row) => row.type === "price_change").after.input, 0);
  const paid = fixture();
  paid.report = run({ ...current, report }, paid);
  assert.equal(paid.report.summary.noLongerFree, 1);
  const again = run(paid, current);
  assert.equal(again.changeLog.length, 3);
  assert.equal(new Set(again.changeLog.map((row) => row.id)).size, 3);
  assert.ok(again.changeLog.every((row) => row.observedAt === date));
  const unchanged = run({ ...current, report: again }, current, "2026-09-19");
  zero(unchanged);
  assert.deepEqual(unchanged.changeLog, again.changeLog);
  assert.equal(unchanged.generatedAt, again.generatedAt);
});

test("model changes include capabilities, license, identity, provider and lineage without releases", () => {
  const previous = baseline();
  const current = fixture();
  Object.assign(current.models[0], { context: 128000, capabilities: { code: true }, reasoning: true, tools: true, structuredOutput: false, modalities: ["text", "image"], license: "mit", openness: "open_source", status: "deprecated", type: "preview", identity: "known", provider: "Other Lab", providerModelId: "other-a", canonicalId: "known:a", lineage: { parent: "base:a" }, aliases: ["old-a"] });
  const report = run(previous, current);
  assert.equal(report.modelChanges.length, 1);
  for (const key of ["context", "capabilities", "reasoning", "tools", "structuredOutput", "modalities", "license", "openness", "status", "type", "identity", "provider", "providerModelId", "canonicalId", "lineage", "aliases"]) assert.ok(report.modelChanges[0].fields.includes(key), key);
  assert.equal(report.summary.newNotableReleases, 0);
  assert.equal(report.summary.deprecations, 1);
  assert.equal(report.openModelChanges.length, 1);
  const next = structuredClone(current);
  next.models[0].license = "apache-2.0";
  assert.equal(run({ ...current, report }, next).openModelChanges.length, 1);
});

test("old milestone additions and corrections are observed now, not counted as launches", () => {
  const previous = baseline();
  const current = fixture();
  current.milestones.milestones.push(milestone());
  current.timeline.push(historical());
  const added = run(previous, current);
  assert.equal(added.summary.historicalChanges, 2);
  assert.equal(added.summary.newNotableReleases, 0);
  assert.ok(added.historicalChanges.every((row) => row.date === date && row.observedAt === date && row.historicalDate === "2020-01-01"));
  const next = structuredClone(current);
  next.milestones.milestones[0].date = "2019-12-31";
  next.timeline[0].title = "Corrected title";
  const corrected = run({ ...current, report: added }, next);
  assert.equal(corrected.historicalChanges.length, 2);
  assert.ok(corrected.historicalChanges.every((row) => row.type.endsWith("corrected")));
  assert.deepEqual(corrected.historicalChanges.find((row) => row.dataset === "milestones").before, { date: "2020-01-01" });
  assert.equal(corrected.changeLog.length, 4);
  assert.equal(corrected.summary.newNotableReleases, 0);
});

test("only sourced releases dated today enter new notable releases", () => {
  const previous = baseline();
  const current = fixture();
  current.timeline.push({ ...historical(), date });
  assert.equal(run(previous, current).summary.newNotableReleases, 1);
  current.timeline[0].sources.push(source("https://models.dev/api.json", "Secondary", "observed", date));
  assert.equal(run(previous, current).summary.newNotableReleases, 0);
});


test("snapshot release totals include curated milestones and deduplicate matching timeline releases", () => {
  const current = fixture();
  current.milestones.milestones.push({
    id: "milestone:current", title: "Current release", date: "2026-09-10", eventType: "multimodal_release",
    confidence: "official", sourceUrl: url, sourceLabel: "Official release",
  });
  current.timeline.push({
    id: "timeline:current", date: "2026-09-10", type: "multimodal_release", title: "Current release", notable: true,
    confidence: "official", sources: structuredClone(sources),
  });
  const report = buildReport({ current, date });
  assert.equal(report.snapshot.notableReleasesThisYear, 1);
  assert.equal(report.snapshot.notableReleasesThisMonth, 1);
});

test("weakest provenance controls facts, derived observations and unverified signals", () => {
  for (const [confidence, level] of [["official", "fact"], ["confirmed", "fact"], ["observed", "derived"], ["unverified", "unverified"]]) {
    const current = fixture();
    current.models[0].sources.push(source("https://models.dev/api.json", "Capabilities", confidence, date));
    const previous = baseline(current);
    current.models[0].tools = true;
    const report = run(previous, current);
    assert.equal(report.modelChanges[0].confidence, confidence);
    assert.equal(report.highlights[0].level, level);
  }
  const previous = baseline();
  previous.models[0].sources = [];
  const current = fixture();
  current.models[0].tools = true;
  assert.equal(run(previous, current).highlights[0].level, "unverified");
  previous.availability[0].sources.push(source("https://models.dev/api.json", "Secondary prices", "observed", date));
  current.availability[0].pricing.input = 0;
  assert.equal(run(previous, current).pricingChanges[0].level, "derived");
});

test("48-hour freshness, failed, missing and future evidence exclude retained endpoints", () => {
  const current = fixture();
  assert.equal(buildReport({ current, date: "2026-09-20" }).snapshot.availableEndpoints, 1);
  const stale = buildReport({ current, date: "2026-09-21" });
  assert.equal(stale.snapshot.availableEndpoints, 0);
  assert.equal(stale.snapshot.paidEndpoints, 0);
  assert.ok(stale.watchlist.some((row) => row.kind === "stale"));
  const previous = baseline(current);
  for (const mutate of [
    (data) => { data.metadata.sources[0].status = "error"; },
    (data) => { data.metadata.sources = []; },
    (data) => { data.availability[0].sources = []; },
    (data) => { data.availability[0].sources[0].lastChecked = "2026-09-15"; },
    (data) => { data.metadata.sources[0].lastSuccess = "2026-09-19"; },
    (data) => { data.availability[0].lastChecked = "invalid"; },
  ]) {
    const next = fixture();
    mutate(next);
    const report = run(previous, next);
    assert.equal(report.snapshot.availableEndpoints, 0);
    assert.equal(report.snapshot.paidEndpoints, 0);
    assert.equal(report.summary.availabilityRemoved, 0);
  }
});

test("free and paid require fresh, explicit, consistent numeric pricing including zero", () => {
  for (const [free, input, output, expectedFree, expectedPaid] of [
    [true, 0, 0, 1, 0], [false, 0, 2, 0, 1], [false, 1, 0, 0, 1],
    [false, 0, 0, 0, 0], [true, 0, 1, 0, 0], [null, 0, 0, 0, 0],
    [true, null, 0, 0, 0], [false, "1", 2, 0, 0], [false, -1, 2, 0, 0],
  ]) {
    const current = fixture();
    Object.assign(current.availability[0], { free, pricing: { input, output } });
    const report = buildReport({ current, date });
    assert.equal(report.snapshot.freeEndpoints, expectedFree);
    assert.equal(report.snapshot.paidEndpoints, expectedPaid);
  }
  const current = fixture();
  current.availability[0].sources[0].label = "Membership only";
  assert.equal(buildReport({ current, date }).snapshot.paidEndpoints, 0);
  current.availability[0].status = "removed";
  assert.equal(buildReport({ current, date }).snapshot.availableEndpoints, 0);
});

test("availability deltas include membership, provider IDs, capabilities and unknown pricing", () => {
  const previous = baseline();
  const current = fixture();
  Object.assign(current.availability[0], { modelId: "known:a", provider: "other", providerModelId: "b", tools: false, context: 0, free: null, pricing: null });
  const report = run(previous, current);
  assert.equal(report.availabilityChanges.length, 1);
  assert.deepEqual(report.availabilityChanges[0].fields, ["context", "free", "modelId", "pricing", "provider", "providerModelId", "tools"]);
  assert.equal(report.summary.noLongerFree, 0);
  assert.equal(report.summary.becameFree, 0);
  current.availability = [];
  assert.equal(run(previous, current).summary.availabilityRemoved, 1);
  assert.equal(run(baseline({ ...fixture(), availability: [] }), fixture()).summary.availabilityAdded, 1);
});

test("canonical aggregates exclude legacy, products and aliases and never embed datasets", () => {
  const current = fixture();
  current.models[0].openness = "open_source";
  current.models[0].license = "mit";
  current.models.push(...[
    { id: "legacy:a" }, { id: "product:a", type: "product_announcement" },
    { id: "alias:a", canonicalId: "opencode:a" }, { id: "unknown:a", license: null },
  ].map((fields) => ({ ...current.models[0], ...fields })));
  const report = buildReport({ current, date });
  assert.equal(report.snapshot.trackedModels, 5);
  assert.equal(report.snapshot.canonicalModels, 2);
  assert.equal(report.snapshot.openModels, 1);
  assert.ok(Object.values(report.snapshot).every((value) => typeof value === "number"));
  assert.equal(report.models, undefined);
  assert.equal(report.availability, undefined);
});

test("pure report requires an injected valid date and does not mutate inputs", () => {
  const previous = baseline();
  const current = fixture();
  current.models[0].license = "mit";
  const before = JSON.stringify({ previous, current });
  run(previous, current);
  assert.equal(JSON.stringify({ previous, current }), before);
  assert.throws(() => buildReport({ current }), /explicit valid UTC date/);
  assert.throws(() => buildReport({ current, date: "2026-02-30" }), /explicit valid UTC date/);
});

test("offline end-to-end publishes exact report schema without polling or timestamp churn", async () => {
  const root = await mkdtemp(join(tmpdir(), "modelmonitor-report-"));
  try {
    await Promise.all([mkdir(join(root, "scripts")), mkdir(join(root, "data")), mkdir(join(root, "public", "data"), { recursive: true })]);
    for (const name of ["fetch-models.js", "report.js", "pipeline.js", "collectors.js", "validation.js", "timeline.js"]) await copyFile(new URL(name, import.meta.url), join(root, "scripts", name));
    const save = (path, value) => writeFile(join(root, path), JSON.stringify(value));
    const current = fixture();
    const curated = { schemaVersion: 1, milestones: [milestone()] };
    await save("package.json", { type: "module" });
    await save("public/models.json", []);
    await save("data/curation.json", { schemaVersion: 1, identities: [], links: [], reveals: [], limits: [], hfOrganizations: [], hfRecentPerOrganization: 1 });
    await save("data/glossary.json", { terms: [{ id: "context", term: "Context" }] });
    await save("data/milestones.json", curated);
    for (const [key, value] of Object.entries(current)) await save(`public/data/${key}.json`, value);
    await save("public/data/report.json", { schemaVersion: 1 });
    const guard = join(root, "guard.cjs");
    await writeFile(guard, `const RealDate = Date; global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ["${date}T00:00:00Z"])); } static now() { return RealDate.parse("${date}T00:00:00Z"); } }; global.fetch = () => { throw new Error("Offline attempted polling"); };`);
    const invoke = () => {
      const result = spawnSync(process.execPath, ["--require", guard, join(root, "scripts/fetch-models.js"), "--offline"], { encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!result.stderr.includes("Offline attempted polling"));
    };
    invoke();
    const read = async (name) => JSON.parse(await readFile(join(root, "public/data", `${name}.json`), "utf8"));
    const first = await read("report");
    assert.deepEqual(first, buildReport({ previous: { ...current, report: { schemaVersion: 1 } }, current: { ...current, milestones: curated }, date }));
    assert.deepEqual(await read("snapshot"), { schemaVersion: 2, generatedAt: date, snapshot: first.snapshot });
    invoke();
    assert.deepEqual(await read("report"), first);
    for (const key of ["models", "availability", "metadata", "cache", "timeline", "history"]) assert.deepEqual(await read(key), current[key]);
    curated.milestones[0].date = "2019-12-31";
    await save("data/milestones.json", curated);
    invoke();
    const corrected = await read("report");
    assert.equal(corrected.historicalChanges[0].type, "milestone_corrected");
    assert.equal(corrected.historicalChanges[0].observedAt, date);
    assert.equal(corrected.summary.newNotableReleases, 0);
    invoke();
    const noOp = await read("report");
    zero(noOp);
    assert.deepEqual(noOp.changeLog, corrected.changeLog);
    assert.deepEqual(await read("metadata"), current.metadata);
    assert.deepEqual(await read("snapshot"), { schemaVersion: 2, generatedAt: date, snapshot: first.snapshot });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

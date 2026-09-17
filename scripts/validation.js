import assert from "node:assert/strict";
import { reconstruct } from "./pipeline.js";

const confidences = ["official", "confirmed", "observed", "unverified"];
const openness = ["open_source", "open_weights", "proprietary", "unknown"];
const text = (value) => typeof value === "string" && value.trim().length > 0;
const numeric = (value) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const nullableBoolean = (value) => value === null || typeof value === "boolean";
const stringArray = (value) => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}
const url = (value, local = false) => {
  if (local && value === "/public/models.json") return true;
  try { const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { return false; }
};
function provenance(sources) {
  assert.ok(Array.isArray(sources) && sources.length, "Missing provenance");
  for (const s of sources) {
    assert.ok(url(s.url, true) && text(s.label) && confidences.includes(s.confidence) && validDate(s.lastChecked), "Invalid source provenance");
    if (s.url === "/public/models.json") assert.equal(s.confidence, "unverified");
    if (s.url === "https://models.dev/api.json") assert.equal(s.confidence, "observed");
  }
}
function unique(rows, label) {
  assert.ok(Array.isArray(rows), `${label} must be an array`);
  assert.ok(rows.every((r) => text(r.id)), `${label} missing ID`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, `${label} duplicate ID`);
}
function prices(price) {
  if (price === null) return;
  assert.ok(price && typeof price === "object", "Invalid pricing");
  assert.equal(price.currency, "USD");
  assert.equal(price.unit, "1M tokens");
  for (const key of ["input", "output", "cachedInput"]) assert.ok(numeric(price[key]), `Invalid price ${key}`);
  if (price.cachedOutput !== undefined) assert.ok(numeric(price.cachedOutput));
  if (price.tiers !== undefined) {
    assert.ok(Array.isArray(price.tiers));
    for (const tier of price.tiers) { assert.ok(numeric(tier.contextAbove) && tier.contextAbove > 0); prices(tier); }
  }
}

export function validateCuration(curation) {
  assert.equal(curation.schemaVersion, 1);
  for (const key of ["identities", "links", "reveals", "limits", "hfOrganizations"]) assert.ok(Array.isArray(curation[key]), `Invalid curation ${key}`);
  unique(curation.identities, "curated identities");
  unique(curation.reveals, "curated reveals");
  const allowedIdentity = new Set(["id", "providerModelId", "name", "provider", "identity", "type", "sourceUrl", "evidence", "summary"]);
  for (const entry of [...curation.identities, ...curation.links, ...curation.reveals, ...curation.limits]) {
    assert.ok(url(entry.sourceUrl) && text(entry.evidence), "Curation requires HTTPS source and verbatim evidence");
  }
  for (const entry of curation.identities) {
    assert.ok(Object.keys(entry).every((key) => allowedIdentity.has(key)), "Unrecognized identity fields or fabricated dates");
    assert.ok(text(entry.providerModelId) && text(entry.name) && text(entry.provider) && ["known", "unknown"].includes(entry.identity) && text(entry.type));
    if (entry.identity === "unknown") assert.equal(entry.provider, "Unknown");
  }
  const links = new Map();
  for (const link of curation.links) {
    assert.ok(text(link.alias) && text(link.modelId) && link.alias !== link.modelId);
    assert.ok(!links.has(link.alias), "Ambiguous curated link");
    links.set(link.alias, link.modelId);
  }
  for (const start of links.keys()) {
    const visited = new Set();
    let key = start;
    while (links.has(key)) { assert.ok(!visited.has(key), "Cyclic curated links"); visited.add(key); key = links.get(key); }
  }
  const revealFrom = new Set();
  for (const reveal of curation.reveals) {
    assert.ok(text(reveal.fromId) && text(reveal.toId) && reveal.fromId !== reveal.toId && validDate(reveal.date), "Reveal requires exact distinct IDs and documented date");
    assert.ok(!revealFrom.has(reveal.fromId), "Ambiguous reveal");
    revealFrom.add(reveal.fromId);
  }
  assert.ok(Number.isInteger(curation.hfRecentPerOrganization) && curation.hfRecentPerOrganization > 0 && curation.hfRecentPerOrganization <= 50);
  assert.equal(new Set(curation.hfOrganizations.map((o) => o.org)).size, curation.hfOrganizations.length);
  for (const entry of curation.hfOrganizations) assert.ok(/^[\w-]+$/.test(entry.org) && text(entry.provider));
}

export function validateData(data, archive = []) {
  for (const key of ["models", "timeline", "availability", "signals", "audit"]) unique(data[key], key);
  assert.ok(Array.isArray(data.limits));
  const models = new Map(data.models.map((m) => [m.id, m]));
  for (const row of data.models) {
    for (const key of ["name", "provider", "type"]) assert.ok(text(row[key]), `Invalid model ${key}: ${row.id}`);
    assert.ok(stringArray(row.aliases) && stringArray(row.modalities));
    assert.ok(openness.includes(row.openness) && confidences.includes(row.confidence) && ["known", "unknown"].includes(row.identity));
    for (const key of ["license", "architecture", "quantization", "hfId"]) assert.ok(row[key] === null || text(row[key]), `Invalid nullable text ${key}`);
    for (const key of ["context", "parameters", "activeParameters", "downloads", "likes"]) assert.ok(numeric(row[key]), `Invalid model ${key}`);
    for (const key of ["reasoning", "tools", "structuredOutput"]) assert.ok(nullableBoolean(row[key]), `Invalid model ${key}`);
    assert.ok(row.releaseDate === null || validDate(row.releaseDate), "Invalid releaseDate");
    assert.ok(validDate(row.firstSeen) && validDate(row.lastChecked) && row.firstSeen <= row.lastChecked);
    if (row.repositoryCreatedAt !== undefined) assert.ok(row.repositoryCreatedAt === null || validDate(row.repositoryCreatedAt));
    if (row.canonicalId) assert.ok(models.has(row.canonicalId) && row.canonicalId !== row.id);
    provenance(row.sources);
    if (row.openness === "open_source" || row.openness === "open_weights") assert.ok(text(row.license), "Openness requires license evidence");
    if (row.id.startsWith("legacy:")) {
      assert.equal(row.confidence, "unverified");
      assert.equal(row.releaseDate, null);
      assert.equal(row.license, null);
      assert.equal(row.openness, "unknown");
      assert.ok(validDate(row.legacyReportDate));
      assert.equal(row.dateBasis, "legacy_report");
      assert.equal(row.summary, undefined);
    }
  }
  const availability = new Map(data.availability.map((a) => [a.id, a]));
  for (const row of data.availability) {
    assert.ok(models.has(row.modelId), `Dangling availability ${row.modelId}`);
    assert.ok(text(row.provider) && text(row.providerModelId));
    assert.ok(["available", "removed"].includes(row.status) && confidences.includes(row.confidence));
    for (const key of ["free", "reasoning", "tools", "structuredOutput"]) assert.ok(nullableBoolean(row[key]));
    assert.ok(numeric(row.context) && stringArray(row.modalities));
    assert.ok(validDate(row.firstSeen) && validDate(row.lastChecked) && row.firstSeen <= row.lastChecked);
    if (row.status === "removed") assert.ok(validDate(row.removedAt) && row.removedAt >= row.firstSeen);
    else assert.equal(row.removedAt, undefined);
    prices(row.pricing);
    if (row.pricing?.input !== null && row.pricing?.output !== null && row.pricing && row.free !== null) assert.equal(row.free, row.pricing.input === 0 && row.pricing.output === 0);
    provenance(row.sources);
  }
  for (const row of data.timeline) {
    assert.ok(models.has(row.modelId), `Dangling timeline ${row.modelId}`);
    assert.ok(validDate(row.date) && text(row.type) && text(row.title) && text(row.provider));
    assert.equal(typeof row.notable, "boolean");
    assert.ok(confidences.includes(row.confidence));
    provenance(row.sources);
    for (const details of [row.before, row.after]) if (details?.modelId) assert.ok(models.has(details.modelId));
    if (row.type === "model_reveal") assert.ok(text(row.previousAlias) && row.confidence === "confirmed");
  }
  assert.ok(data.history && Array.isArray(data.history.snapshots));
  for (const [index, snapshot] of data.history.snapshots.entries()) {
    assert.ok(validDate(snapshot.date) && text(snapshot.provider));
    assert.equal(typeof snapshot.baseline, "boolean");
    assert.ok(Array.isArray(snapshot.upsert) && stringArray(snapshot.removed));
    const prior = data.history.snapshots.slice(0, index).filter((s) => s.provider === snapshot.provider);
    assert.equal(snapshot.baseline, prior.length === 0, "Exactly one initial baseline per provider");
    if (prior.length) assert.ok(prior.at(-1).date <= snapshot.date, "History is not chronological");
    for (const row of snapshot.upsert) {
      assert.ok(availability.has(row.id) && models.has(row.modelId) && nullableBoolean(row.free));
      assert.equal(availability.get(row.id).provider, snapshot.provider);
    }
    for (const id of snapshot.removed) assert.ok(availability.has(id));
    const members = reconstruct(data.history, snapshot.provider, index);
    assert.equal(snapshot.available, members.length, "Incorrect historical membership count");
    assert.equal(snapshot.free, members.filter((r) => r.free === true).length);
    assert.equal(snapshot.paid, members.filter((r) => r.free === false).length);
    assert.equal(snapshot.unknown, members.filter((r) => r.free === null).length);
  }
  for (const provider of new Set(data.history.snapshots.map((s) => s.provider))) {
    const actual = data.availability.filter((a) => a.provider === provider && a.status === "available").map((a) => ({ id: a.id, modelId: a.modelId, free: a.free })).sort((a, b) => a.id.localeCompare(b.id, "en"));
    assert.deepEqual(reconstruct(data.history, provider), actual, "Latest history must reconstruct current availability");
  }
  assert.equal(data.metadata.schemaVersion, 1);
  assert.ok(validDate(data.metadata.generatedAt));
  assert.ok(stringArray(data.metadata.limitations));
  unique(data.metadata.sources, "metadata sources");
  for (const status of data.metadata.sources) {
    assert.ok(text(status.name) && url(status.url) && ["ok", "error"].includes(status.status) && validDate(status.lastChecked));
    assert.ok(status.lastSuccess === null || validDate(status.lastSuccess));
    if (status.status === "error") assert.ok(text(status.error));
    else assert.ok(validDate(status.lastSuccess));
  }
  for (const limit of data.limits) {
    for (const key of ["provider", "product", "plan", "window"]) assert.ok(text(limit[key]));
    assert.ok(text(limit.reset?.type) && text(limit.reset?.description) && confidences.includes(limit.confidence) && url(limit.sourceUrl) && validDate(limit.lastChecked));
  }
  for (const signal of data.signals) {
    if (signal.modelId !== undefined) assert.ok(models.has(signal.modelId));
    assert.ok(validDate(signal.date) && text(signal.type));
    provenance(signal.sources);
  }
  for (const row of data.audit) {
    assert.ok(models.has(row.id) && text(row.reason) && validDate(row.legacyReportDate));
    assert.equal(row.archiveUrl, "/public/models.json");
  }
  for (const legacy of archive) {
    const id = `legacy:${legacy.id}`;
    assert.ok(models.has(id), `Lost legacy entity ${id}`);
    assert.equal(models.get(id).legacyReportDate, legacy.date);
    assert.ok(data.audit.some((a) => a.id === id), `Missing legacy audit ${id}`);
  }
  assert.doesNotThrow(() => JSON.stringify(data));
  return true;
}

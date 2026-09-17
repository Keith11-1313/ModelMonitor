import { digest } from "./pipeline.js";

const DAY = 86400000;
const list = (value) => Array.isArray(value) ? value : [];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const numeric = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const modelFields = ["name", "context", "capabilities", "reasoning", "tools", "structuredOutput", "modalities", "license", "openness", "status", "type", "identity", "provider", "providerModelId", "canonicalId", "lineage", "baseModel", "baseModels", "baseModelRelation", "aliases", "hfId", "parameters", "activeParameters", "architecture", "quantization", "releaseDate", "dateBasis", "confidence", "sources"];
const availabilityFields = ["modelId", "provider", "providerModelId", "status", "free", "pricing", "context", "capabilities", "reasoning", "tools", "structuredOutput", "modalities", "confidence", "sources"];
const historicalTypes = new Set(["model_release", "release", "preview_release", "open_source_release", "open_weight_release", "open_weights_release", "model_reveal", "model_deprecation", "model_retirement", "deprecation", "retirement", "stealth_model", "stealth_appearance", "stealth_observed"]);
const releaseTypes = new Set(["model_release", "release", "preview_release", "open_source_release", "open_weight_release", "open_weights_release"]);
const ignored = new Set(["lastChecked", "lastSuccess", "firstSeen", "generatedAt", "observedAt", "downloads", "likes"]);

function normalize(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return [...new Map(value.map((item) => { const next = normalize(item); return [JSON.stringify(next), next]; })).entries()].sort(([a], [b]) => compare(a, b)).map(([, item]) => item);
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).filter((key) => !ignored.has(key) && value[key] != null).sort(compare).map((key) => [key, normalize(value[key])]));
}

const equal = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const project = (row, fields) => Object.fromEntries(fields.map((key) => [key, normalize(row[key] ?? (["aliases", "modalities", "sources", "baseModels"].includes(key) ? [] : null))]));
const canonical = (row) => !String(row.id).startsWith("legacy:") && !row.legacyReportDate && !row.canonicalId && !["product_announcement", "model_update_report", "unverified_entity", "alias"].includes(row.type);
const isOpen = (row) => ["open_source", "open_weights"].includes(row.openness) && Boolean(row.license) && row.license !== "unknown";
const fresh = (value, now) => { const age = now - Date.parse(value); return Number.isFinite(age) && age >= 0 && age <= 2 * DAY; };

function currentEvidence(row, metadata, now) {
  if (row.status !== "available" || !fresh(row.lastChecked, now) || !list(row.sources).length) return false;
  return row.sources.every((source) => {
    const status = list(metadata.sources).find((item) => item.url === source.url || item.id === source.sourceId);
    return status?.status === "ok" && fresh(status.lastSuccess, now) && fresh(source.lastChecked, now);
  });
}

function currentPriced(row, metadata, now) {
  return currentEvidence(row, metadata, now) && numeric(row.pricing?.input) && numeric(row.pricing?.output) && list(row.sources).some((source) => /pric|cost/i.test(source.label ?? "") && fresh(source.lastChecked, now));
}

function evidence(...rows) {
  const ranks = { official: 0, confirmed: 1, observed: 2, unverified: 3 };
  const values = rows.filter(Boolean).flatMap((row) => [row.confidence ?? "unverified", ...(list(row.sources).length ? row.sources.map((source) => source.confidence ?? "unverified") : row.sourceUrl ? [row.confidence ?? "unverified"] : ["unverified"])]);
  const rank = Math.max(...values.map((value) => ranks[value] ?? 3));
  const confidence = Object.keys(ranks)[rank] ?? "unverified";
  return { confidence, level: rank < 2 ? "fact" : rank === 2 ? "derived" : "unverified" };
}

function aggregate(current, date) {
  const models = list(current.models);
  const availability = list(current.availability);
  const metadata = current.metadata ?? {};
  const now = Date.parse(date);
  const identities = models.filter(canonical);
  const available = availability.filter((row) => currentEvidence(row, metadata, now));
  const priced = available.filter((row) => currentPriced(row, metadata, now));
  const releases = list(current.timeline).filter((row) => row.notable && releaseTypes.has(row.type) && evidence(row).level === "fact" && row.date <= date);
  return {
    trackedModels: models.length,
    canonicalModels: identities.length,
    availableEndpoints: available.length,
    freeEndpoints: priced.filter((row) => row.free === true && row.pricing.input === 0 && row.pricing.output === 0).length,
    paidEndpoints: priced.filter((row) => row.free === false && (row.pricing.input > 0 || row.pricing.output > 0)).length,
    openModels: identities.filter(isOpen).length,
    openSource: identities.filter((row) => isOpen(row) && row.openness === "open_source").length,
    openWeights: identities.filter((row) => isOpen(row) && row.openness === "open_weights").length,
    proprietary: identities.filter((row) => row.openness === "proprietary").length,
    providers: new Set(identities.map((row) => row.provider).filter((provider) => provider && provider !== "Unknown")).size,
    notableReleasesThisYear: releases.filter((row) => row.date.slice(0, 4) === date.slice(0, 4)).length,
    notableReleasesThisMonth: releases.filter((row) => row.date.slice(0, 7) === date.slice(0, 7)).length,
  };
}

function watchItems(current, date) {
  const items = [];
  const models = [...list(current.models)].sort((a, b) => compare(a.name ?? a.id, b.name ?? b.id));
  const unknown = models.filter((row) => row.type === "stealth" && row.identity === "unknown");
  const previews = models.filter((row) => row.type === "preview");
  const restricted = models.filter((row) => isOpen(row) && row.openness === "open_weights");
  const names = (rows) => [...new Set(rows.map((row) => row.name ?? row.id))].slice(0, 3).join(", ");
  if (unknown.length) items.push({ kind: "unverified_signal", text: `${unknown.length} stealth ${unknown.length === 1 ? "model still has" : "models still have"} no confirmed public identity${unknown.length <= 3 ? `: ${names(unknown)}` : `, including ${names(unknown)}`}.` });
  if (previews.length) items.push({ kind: "unstable", text: `${previews.length} ${previews.length === 1 ? "model is" : "models are"} marked preview${previews.length <= 3 ? `: ${names(previews)}` : `, including ${names(previews)}`}. Pricing, behavior or availability may change.` });
  if (restricted.length) items.push({ kind: "license", text: `${restricted.length} tracked open-weight ${restricted.length === 1 ? "model uses" : "models use"} a license with conditions beyond simply publishing weights. Check the model license before reuse.` });

  const availability = list(current.availability);
  const metadata = current.metadata ?? {};
  const now = Date.parse(date);
  const excluded = availability.filter((row) => row.status === "available" && !currentEvidence(row, metadata, now)).length;
  const incomplete = availability.filter((row) => currentEvidence(row, metadata, now) && (!currentPriced(row, metadata, now) || row.free == null || row.free !== (row.pricing.input === 0 && row.pricing.output === 0))).length;
  if (excluded) items.push({ kind: "stale", text: `${excluded} ${excluded === 1 ? "endpoint is" : "endpoints are"} excluded from current counts because the supporting evidence is older than 48 hours or its source is unhealthy.` });
  if (incomplete) items.push({ kind: "incomplete", text: `${incomplete} current ${incomplete === 1 ? "endpoint does" : "endpoints do"} not have complete, fresh pricing evidence, so ${incomplete === 1 ? "it is" : "they are"} not counted as free or paid.` });
  for (const source of [...list(metadata.sources)].sort((a, b) => compare(a.id, b.id))) {
    if (source.status !== "ok") items.push({ kind: "source", text: `${source.name ?? source.id} failed during the latest check. Retained records from that source are not treated as proof of current availability.` });
  }
  return items.slice(0, 8);
}

const fieldLabels = {
  context: "context window", capabilities: "capabilities", reasoning: "reasoning support", tools: "tool support",
  structuredOutput: "structured output", modalities: "modalities", license: "license", openness: "openness",
  status: "status", type: "model type", identity: "identity", provider: "provider", providerModelId: "provider model ID",
  canonicalId: "canonical identity", lineage: "lineage", baseModel: "base model", baseModels: "base models",
  baseModelRelation: "base-model relationship", aliases: "aliases", hfId: "Hugging Face ID", parameters: "parameter count",
  activeParameters: "active parameter count", architecture: "architecture", quantization: "quantization", releaseDate: "release date",
  dateBasis: "date basis", confidence: "confidence", sources: "source evidence", free: "free/paid status", pricing: "pricing",
  modelId: "model identity",
};

function entityName(row, maps) {
  if (!row) return "A tracked model";
  if (row.dataset === "milestones") return maps.milestones.get(row.entityId)?.title ?? row.entityId;
  const modelId = row.modelId ?? (row.dataset === "models" ? row.entityId : null);
  return maps.models.get(modelId)?.name ?? row.after?.name ?? row.before?.name ?? row.entityId;
}

function providerSuffix(row) {
  return row.provider ? ` on ${row.provider}` : "";
}

function describeChange(row, maps) {
  const name = entityName(row, maps);
  if (row.type === "model_added") return `${name} was added to the tracked model catalog.`;
  if (row.type === "model_removed") return `${name} was removed from the tracked model catalog.`;
  if (row.type === "availability_added") return `${name} became available${providerSuffix(row)}.`;
  if (row.type === "availability_removed") return `${name} is no longer listed as available${providerSuffix(row)}.`;
  if (row.type === "became_free") return `${name} is now listed with zero input and output token pricing${providerSuffix(row)}.`;
  if (row.type === "no_longer_free") return `${name} is no longer listed as free${providerSuffix(row)}.`;
  if (row.type === "price_change") return `${name}'s token pricing changed${providerSuffix(row)}.`;
  if (row.type === "milestone_added") return `${name} was added to LLM History${row.historicalDate ? ` for ${row.historicalDate}` : ""}.`;
  if (row.type === "milestone_corrected") return `The LLM History entry for ${name} was corrected.`;
  if (row.type === "historical_added") return `${name} was added to the observed history${row.historicalDate ? ` for ${row.historicalDate}` : ""}.`;
  if (row.type === "historical_corrected") return `The historical record for ${name} was corrected.`;
  if (row.type === "historical_removed" || row.type === "milestone_removed") return `${name} was removed from the historical dataset.`;
  if (row.type === "model_updated") {
    const fields = row.fields.map((field) => fieldLabels[field] ?? field.replaceAll("_", " "));
    return `${name} changed: ${fields.slice(0, 4).join(", ")}${fields.length > 4 ? ` and ${fields.length - 4} more` : ""}.`;
  }
  if (row.type === "availability_updated") {
    const fields = row.fields.map((field) => fieldLabels[field] ?? field.replaceAll("_", " "));
    return `${name}'s availability record changed${providerSuffix(row)}: ${fields.slice(0, 4).join(", ")}${fields.length > 4 ? ` and ${fields.length - 4} more` : ""}.`;
  }
  return `${name}: ${row.type.replaceAll("_", " ")}.`;
}

function differences(previous, current, dataset, fields, emit) {
  const before = new Map(list(previous).map((row) => [row.id, row]));
  const after = new Map(list(current).map((row) => [row.id, row]));
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort(compare)) {
    const old = before.get(id);
    const next = after.get(id);
    const a = old ? fields ? project(old, fields) : normalize(old) : null;
    const b = next ? fields ? project(next, fields) : normalize(next) : null;
    if (equal(a, b)) continue;
    const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((key) => key !== "id" && !equal(a?.[key], b?.[key])).sort(compare);
    const patch = (value) => value ? Object.fromEntries(keys.map((key) => [key, value[key] ?? null])) : null;
    emit({ dataset, entityId: id, operation: !old ? "added" : !next ? "removed" : "updated", fields: keys, before: patch(a), after: patch(b) }, old, next);
  }
}

export function buildReport({ previous, previousSnapshot, current, date }) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}(T.*Z)?$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date.slice(0, 10)) throw new Error("Report requires an explicit valid UTC date");
  const priorReport = previous?.report ?? previousSnapshot;
  const baseline = priorReport?.schemaVersion !== 2 || !Array.isArray(previous?.models) || !Array.isArray(previous?.availability);
  const retained = baseline ? [] : list(priorReport.changeLog);
  const changes = [];
  const emit = (delta, old, next) => {
    const row = next ?? old;
    const historical = ["milestones", "timeline"].includes(delta.dataset);
    let type = historical ? `${delta.dataset === "milestones" ? "milestone" : "historical"}_${delta.operation === "updated" ? "corrected" : delta.operation}` : `${delta.dataset === "models" ? "model" : "availability"}_${delta.operation}`;
    if (delta.dataset === "availability") {
      if (old?.status === "available" && (!next || next.status !== "available")) type = "availability_removed";
      else if (next?.status === "available" && old?.status !== "available") type = "availability_added";
    }
    const provenance = evidence(old, next);
    const change = {
      ...delta, type, date, observedAt: date,
      modelId: delta.dataset === "models" ? row.id : row.modelId ?? null,
      provider: row.provider ?? row.organization ?? null,
      ...provenance,
      ...(historical ? { historicalDate: row.date ?? null, eventType: row.type ?? row.eventType, notable: row.notable === true, previousAlias: row.previousAlias ?? null } : {}),
    };
    const url = row.sourceUrl ?? list(row.sources)[0]?.url;
    if (url) change.url = url;
    change.id = `change:${digest([retained.at(-1)?.id ?? null, normalize(change)]).slice(0, 24)}`;
    changes.push(change);
  };
  if (!baseline) {
    differences(previous.models, current.models, "models", modelFields, emit);
    differences(previous.availability, current.availability, "availability", availabilityFields, emit);
    differences(list(previous.milestones?.milestones ?? previous.milestones), list(current.milestones?.milestones ?? current.milestones), "milestones", null, emit);
    differences(list(previous.timeline).filter((row) => historicalTypes.has(row.type)), list(current.timeline).filter((row) => historicalTypes.has(row.type)), "timeline", null, emit);
  }
  const modelChanges = changes.filter((row) => row.dataset === "models");
  const availabilityChanges = changes.filter((row) => row.dataset === "availability");
  const historicalChanges = changes.filter((row) => ["timeline", "milestones"].includes(row.dataset));
  const pricingChanges = availabilityChanges.flatMap((row) => {
    if (row.operation !== "updated") return [];
    const entries = [];
    if (typeof row.before?.free === "boolean" && typeof row.after?.free === "boolean" && row.before.free !== row.after.free) entries.push({ ...row, id: `${row.id}:free`, type: row.after.free ? "became_free" : "no_longer_free", before: row.before.free, after: row.after.free });
    if (row.fields.includes("pricing")) entries.push({ ...row, id: `${row.id}:pricing`, type: "price_change", before: row.before.pricing, after: row.after.pricing });
    return entries;
  });
  const openIds = new Set([...list(previous?.models), ...list(current.models)].filter(isOpen).map((row) => row.id));
  const openModelChanges = modelChanges.filter((row) => openIds.has(row.entityId) && ["license", "openness"].some((field) => row.fields.includes(field)));
  const newModels = modelChanges.filter((row) => row.operation === "added" && canonical({ id: row.entityId, ...row.after }));
  const summary = {
    newModels: newModels.length,
    newNotableReleases: historicalChanges.filter((row) => row.dataset === "timeline" && row.operation === "added" && releaseTypes.has(row.eventType) && row.notable && row.level === "fact" && row.historicalDate?.slice(0, 10) === date.slice(0, 10)).length,
    becameFree: pricingChanges.filter((row) => row.type === "became_free").length,
    noLongerFree: pricingChanges.filter((row) => row.type === "no_longer_free").length,
    priceChanges: pricingChanges.filter((row) => row.type === "price_change").length,
    availabilityAdded: availabilityChanges.filter((row) => row.type === "availability_added").length,
    availabilityRemoved: availabilityChanges.filter((row) => row.type === "availability_removed").length,
    newOpenModels: newModels.filter((row) => isOpen(row.after)).length,
    deprecations: new Set([...modelChanges.filter((row) => row.fields.includes("status") && ["deprecated", "retired"].includes(row.after?.status)), ...historicalChanges.filter((row) => row.operation === "added" && ["model_deprecation", "model_retirement", "deprecation", "retirement"].includes(row.eventType) && row.historicalDate?.slice(0, 10) === date.slice(0, 10))].map((row) => row.modelId ?? row.entityId)).size,
    historicalChanges: historicalChanges.length,
    modelUpdates: modelChanges.filter((row) => row.operation === "updated").length,
    modelRemovals: modelChanges.filter((row) => row.operation === "removed").length,
    availabilityUpdates: availabilityChanges.filter((row) => row.type === "availability_updated").length,
  };
  const modelMap = new Map([...list(previous?.models), ...list(current.models)].map((row) => [row.id, row]));
  const milestoneMap = new Map([...list(previous?.milestones?.milestones ?? previous?.milestones), ...list(current.milestones?.milestones ?? current.milestones)].map((row) => [row.id, row]));
  const maps = { models: modelMap, milestones: milestoneMap };
  const highlightCandidates = [...pricingChanges, ...changes.filter((row) => !pricingChanges.some((price) => price.entityId === row.entityId && row.dataset === "availability" && (row.fields.includes("free") || row.fields.includes("pricing"))))];
  const highlights = highlightCandidates.slice(0, 25).map((row) => ({
    id: row.id, level: row.level,
    text: describeChange(row, maps),
    ...(row.url ? { url: row.url } : {}),
  }));
  return {
    schemaVersion: 2, baseline: baseline || (!changes.length && priorReport.baseline === true),
    generatedAt: baseline || changes.length ? date : priorReport.generatedAt,
    periodStart: baseline ? null : changes.length ? priorReport.periodEnd ?? priorReport.generatedAt : priorReport.periodStart,
    periodEnd: baseline || changes.length ? date : priorReport.periodEnd,
    summary, highlights, modelChanges, availabilityChanges, pricingChanges, openModelChanges, historicalChanges,
    changeLog: [...retained, ...changes],
    watchlist: watchItems(current, date),
    health: { checkedAt: date.slice(0, 10), sources: list(current.metadata?.sources).length, failedSources: list(current.metadata?.sources).filter((row) => row.status !== "ok").length },
    snapshot: aggregate(current, date),
  };
}

export function snapshotFingerprint(history) {
  return history.snapshots.at(-1) ?? null;
}

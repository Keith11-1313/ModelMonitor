import { createHash } from "node:crypto";

export const day = (value = new Date()) => new Date(value).toISOString().slice(0, 10);
export const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
export const boolean = (value) => typeof value === "boolean" ? value : null;
export const strings = (value) => Array.isArray(value) ? [...new Set(value.filter((v) => typeof v === "string"))].sort() : [];
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const digest = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
export const source = (url, label, confidence, date) => ({ url, label, confidence, lastChecked: date });
export const sorted = (rows) => rows.sort((a, b) => a.id.localeCompare(b.id, "en"));

export function model(id, name, provider, date) {
  return {
    id, name, provider, aliases: [], type: "model", releaseDate: null,
    license: null, openness: "unknown", context: null, parameters: null,
    activeParameters: null, architecture: null, quantization: null,
    reasoning: null, tools: null, structuredOutput: null, modalities: [],
    hfId: null, downloads: null, likes: null, identity: "unknown",
    confidence: "observed", sources: [], firstSeen: date, lastChecked: date,
  };
}

export function mergeKnown(old, update) {
  if (!old) {
    const initial = structuredClone(update);
    if (initial.sources) initial.sources.sort((a, b) => a.url.localeCompare(b.url));
    return initial;
  }
  const result = { ...old };
  for (const [key, value] of Object.entries(update)) {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) result[key] = mergeKnown(old[key], value);
    else result[key] = value;
  }
  if (old.firstSeen) result.firstSeen = old.firstSeen;
  if (update.sources) result.sources = [...new Map([...(old.sources ?? []), ...update.sources].map((s) => [s.url, s])).values()].sort((a, b) => a.url.localeCompare(b.url));
  if (update.aliases) result.aliases = strings([...(old.aliases ?? []), ...update.aliases]);
  return result;
}

export function licenseOf(hf) {
  const licenses = strings([
    ...([hf.cardData?.license].flat().filter((v) => typeof v === "string")),
    ...(hf.tags ?? []).filter((t) => t.startsWith("license:")).map((t) => t.slice(8)),
  ]);
  if (!licenses.length) return { license: null, openness: "unknown" };
  const permissive = new Set(["apache-2.0", "mit", "bsd-2-clause", "bsd-3-clause", "isc", "cc0-1.0", "unlicense"]);
  const restrictive = /^(llama[234]([.-].*)?|gemma|gemma3|gemma4|bigscience-bloom-rail-1\.0|bigscience-openrail-m|creativeml-openrail-m|cc-by-nc-4\.0|cc-by-nc-sa-4\.0|nvidia-open-model-license|nvidia-open-model-license-v1|qwen|qwen-research)$/;
  return {
    license: licenses.join(" AND "),
    openness: licenses.every((l) => permissive.has(l)) ? "open_source" : licenses.every((l) => permissive.has(l) || restrictive.test(l)) ? "open_weights" : "unknown",
  };
}

export function classify(hf) {
  const name = typeof hf.id === "string" ? hf.id : hf.name ?? "";
  const tags = hf.tags ?? [];
  const base = hf.cardData?.base_model;
  const relation = hf.cardData?.base_model_relation;
  if (/(?:^|[-_])(gguf|gptq|awq|nvfp4|fp8|int[48])(?:$|[-_])/i.test(name) || tags.some((t) => /^(gguf|gptq|awq|quantization|base_model:quantized:)/.test(t))) return "quantization";
  if (/(dspark|dflash|draft|speculative|model optimizer|modelopt)/i.test([name, ...tags].join(" ")) || relation === "quantized") return "optimization";
  if (base || relation === "finetune" || tags.some((t) => /^base_model:(finetune|adapter|merge):/.test(t)) || /(?:^|[-_])(instruct|chat|it|sft|dpo|lora|rl)(?:$|[-_])/i.test(name)) return "fine_tune";
  if (/preview|(?:^|[-_])exp(?:$|[-_])/i.test(name)) return "preview";
  return "model";
}

export function migrateLegacy(archive, date) {
  const models = [];
  const audit = [];
  for (const entry of archive) {
    const id = `legacy:${entry.id}`;
    const candidate = /^(?:Previewing\s+)?GPT[-‑][\d.]+(?:\s+(?:Astra|Sol|Terra|Luna))?$|^GPT-Live$/i.test(entry.name);
    const update = /^(?:Improving GPT[-‑][\d.]+|GPT[-‑][\d.]+ is now the preferred model|Advancing the price-performance frontier with GPT[-‑][\d.]+)/i.test(entry.name);
    const type = entry.link && !candidate && !update ? "product_announcement" : update ? "model_update_report" : classify(entry);
    const row = model(id, entry.name, entry.company, date);
    Object.assign(row, {
      type, confidence: "unverified", legacyReportDate: entry.date,
      dateBasis: "legacy_report", identity: "unknown",
      sources: [source("/public/models.json", "Unverified legacy archive; original report date, not a verified launch", "unverified", date)],
    });
    models.push(row);
    audit.push({
      id, legacyId: entry.id, disposition: type === "product_announcement" ? "separate_product_announcement" : "unverified_entity",
      legacyReportDate: entry.date, archiveUrl: "/public/models.json",
      originalLink: entry.link ?? null,
      reason: type === "product_announcement" ? "RSS/blog title is not sufficient evidence of a model release; isolated from model release counts pending source review." : "Legacy report retained without verification; original license, summary, highlights and benchmark claims are not imported.",
    });
  }
  return { models: sorted(models), audit: sorted(audit) };
}

export function resolveIdentity(key, models, links = []) {
  const direct = models.find((m) => m.id === key);
  const curated = links.filter((l) => l.alias === key);
  if (curated.length > 1 && new Set(curated.map((l) => l.modelId)).size > 1) throw new Error(`Ambiguous curated identity: ${key}`);
  if (curated.length) return curated[0].modelId;
  if (direct) return direct.canonicalId ?? direct.id;
  const matches = models.filter((m) => !m.id.startsWith("legacy:") && m.aliases.includes(key));
  if (matches.length > 1) throw new Error(`Ambiguous exact alias: ${key}`);
  return matches[0]?.id ?? key;
}

export function applyReveal(models, availability, timeline, reveal, date) {
  const from = models.find((m) => m.id === reveal.fromId);
  const to = models.find((m) => m.id === reveal.toId);
  if (!from || !to || to.identity !== "known" || from.id.startsWith("legacy:") || to.id.startsWith("legacy:")) throw new Error(`Reveal requires retained source and known non-legacy target: ${reveal.id}`);
  let target = to;
  const visited = new Set([from.id]);
  while (target) {
    if (visited.has(target.id)) throw new Error("Cyclic reveal");
    visited.add(target.id);
    target = models.find((m) => m.id === target.canonicalId);
  }
  to.aliases = strings([...to.aliases, from.id, from.name, ...from.aliases]);
  from.canonicalId = to.id;
  from.identity = "known";
  from.confidence = "confirmed";
  from.sources = mergeKnown(from, { sources: [source(reveal.sourceUrl, "Confirmed identity reveal", "confirmed", date)] }).sources;
  for (const row of availability) if (row.modelId === from.id) row.modelId = to.id;
  if (!timeline.some((e) => e.id === reveal.id)) timeline.push({
    id: reveal.id, date: reveal.date, type: "model_reveal", modelId: to.id,
    title: `${from.name} revealed as ${to.name}`, previousAlias: from.name,
    provider: to.provider, notable: true, confidence: "confirmed",
    sources: [source(reveal.sourceUrl, "Confirmed identity reveal", "confirmed", date)],
    before: { modelId: from.id }, after: { modelId: to.id },
  });
}

export function event(type, row, date, before, after, sequence = 0) {
  return {
    id: `event:${digest([type, row.id, date, before ?? null, after ?? null, sequence]).slice(0, 24)}`,
    date, type, modelId: row.modelId ?? row.id, title: `${type.replaceAll("_", " ")}: ${row.providerModelId ?? row.name}`,
    provider: row.provider, notable: true, confidence: row.confidence, sources: structuredClone(row.sources),
    description: "Observed by ModelMonitor on this date; not an asserted launch date.",
    ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}),
  };
}

export function updateAvailability(previous, observations, provider, date, baseline, sequence = 0) {
  if (!Array.isArray(observations) || !observations.length) return { availability: structuredClone(previous), events: [] };
  const map = new Map(previous.map((r) => [r.id, structuredClone(r)]));
  const events = [];
  const seen = new Set();
  for (const observation of observations) {
    seen.add(observation.id);
    const old = map.get(observation.id);
    const next = mergeKnown(old, { ...observation, status: "available", lastChecked: date });
    delete next.removedAt;
    map.set(next.id, next);
    if (!baseline) {
      if (!old || old.status === "removed") events.push(event("availability_added", next, date, old?.status ?? null, "available", sequence));
      if (old?.status === "available") {
        if (old.free !== null && next.free !== null && old.free !== next.free) events.push(event(next.free ? "became_free" : "no_longer_free", next, date, old.free, next.free, sequence));
        for (const [field, type] of [["pricing", "price_change"], ["context", "context_change"], ["reasoning", "capability_update"], ["tools", "capability_update"], ["structuredOutput", "capability_update"], ["modalities", "capability_update"]]) {
          if (old[field] !== null && !(Array.isArray(old[field]) && !old[field].length) && !equal(old[field], next[field])) events.push(event(type, next, date, { [field]: old[field] }, { [field]: next[field] }, sequence));
        }
      }
    }
  }
  for (const row of map.values()) {
    if (row.provider !== provider || row.status === "removed" || seen.has(row.id)) continue;
    row.status = "removed";
    row.removedAt = date;
    row.lastChecked = date;
    if (!baseline) events.push(event("availability_removed", row, date, "available", "removed", sequence));
  }
  return { availability: sorted([...map.values()]), events };
}

export function reconstruct(history, provider, through = Infinity) {
  const membership = new Map();
  for (const [index, snapshot] of history.snapshots.entries()) {
    if (index > through || snapshot.provider !== provider) continue;
    if (snapshot.baseline) membership.clear();
    for (const id of snapshot.removed ?? []) membership.delete(id);
    for (const row of snapshot.upsert ?? []) membership.set(row.id, row);
  }
  return sorted([...membership.values()]);
}

export function appendHistory(history, availability, provider, date) {
  const old = reconstruct(history, provider);
  const current = sorted(availability.filter((a) => a.provider === provider && a.status === "available").map((a) => ({ id: a.id, modelId: a.modelId, free: a.free })));
  const previous = new Map(old.map((a) => [a.id, a]));
  const ids = new Set(current.map((a) => a.id));
  const baseline = !history.snapshots.some((s) => s.provider === provider);
  const upsert = current.filter((a) => !equal(a, previous.get(a.id)));
  const removed = old.filter((a) => !ids.has(a.id)).map((a) => a.id);
  const latest = history.snapshots.filter((s) => s.provider === provider).at(-1);
  if (!baseline && !upsert.length && !removed.length && latest.date === date) return history;
  history.snapshots.push({
    date, provider, available: current.length, free: current.filter((a) => a.free === true).length,
    paid: current.filter((a) => a.free === false).length, unknown: current.filter((a) => a.free === null).length,
    baseline, upsert, removed,
  });
  return history;
}

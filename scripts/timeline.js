import { digest } from "./pipeline.js";

export function isNotableEvent(record) {
  if (record.notable !== true || !["official", "confirmed", "observed"].includes(record.confidence)) return false;
  if (["legacy_report", "repository_created", "catalog_baseline", "observation", "product_announcement"].includes(record.type)) return false;
  if (["model_release", "release", "preview_release", "open_source_release", "open_weight_release", "open_weights_release", "model_reveal"].includes(record.type)) return ["official", "confirmed"].includes(record.confidence);
  if (record.type === "price_change") {
    const before = record.before?.pricing;
    const after = record.after?.pricing;
    if (!before || !after || before.currency !== after.currency || before.unit !== after.unit) return false;
    return ["input", "output", "cachedInput", "cachedOutput"].some((key) => {
      const old = before[key];
      const next = after[key];
      return typeof old === "number" && typeof next === "number" && Number.isFinite(old) && Number.isFinite(next) && old >= 0 && next >= 0 && old !== next && (old === 0 || Math.abs(next - old) / old >= 0.1);
    });
  }
  return ["stealth_model", "stealth_appearance", "stealth_observed", "availability_added", "availability_removed", "became_free", "no_longer_free", "model_deprecation", "model_retirement", "deprecation", "retirement"].includes(record.type);
}

export function buildTimeline(entities, availability = [], previous = []) {
  const events = new Map(previous.map((record) => [record.id, record]));
  for (const entity of entities) {
    let type;
    let date;
    let description;
    let confidence = entity.confidence;
    let notable = !["quantization", "optimization", "fine_tune", "product_announcement"].includes(entity.type);
    if (entity.legacyReportDate) {
      type = entity.type === "product_announcement" ? "product_announcement" : "legacy_report";
      date = entity.legacyReportDate;
      confidence = "unverified";
      notable = false;
      description = "Preserved archive report. This date and the reported model identity are unverified, not a verified launch. Original claims have not been promoted to model metadata.";
    } else if (entity.releaseDate) {
      type = entity.type === "preview" ? "preview_release" : "model_release";
      date = entity.releaseDate;
      description = "Release date recorded with the linked evidence. Confidence applies to this report.";
    } else if (["stealth", "stealth_model"].includes(entity.type)) {
      const observation = availability.find((row) => row.modelId === entity.id);
      if (!observation) continue;
      type = "stealth_model";
      date = observation.firstSeen;
      description = "First local catalog observation by ModelMonitor, not the global first appearance or release date. Original alias retained; this event makes no claim about the maker.";
    } else if (entity.repositoryCreatedAt) {
      type = "repository_created";
      date = entity.repositoryCreatedAt;
      notable = false;
      description = "Hugging Face repository creation date, not a verified model launch. Derivative checkpoints remain separate from foundation releases.";
    } else continue;
    if (!date || !Number.isFinite(Date.parse(date))) continue;
    date = date.slice(0, 10);
    const id = `history:${digest([entity.id, type, date]).slice(0, 24)}`;
    if (events.has(id)) continue;
    events.set(id, {
      id, date, type, modelId: entity.id,
      title: `${type === "legacy_report" ? "Archived report" : type.replaceAll("_", " ")}: ${entity.name}`,
      provider: type === "stealth_model" ? "opencode" : entity.provider,
      notable, confidence, description, sources: structuredClone(entity.sources),
    });
  }
  return [...events.values()].map((record) => ({ ...record, notable: isNotableEvent(record) })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

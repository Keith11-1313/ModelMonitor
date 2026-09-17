import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTimeline } from "./timeline.js";
import { migrateLegacy, model, source, applyReveal } from "./pipeline.js";

const checked = "2026-09-17";
const sources = [source("https://opencode.ai/zen/v1/models", "Test evidence", "observed", checked)];

test("two models and availability rows produce exact, repeatable historical events", () => {
  const entities = [
    { ...model("fixture:legacy", "Archived model", "Test", checked), legacyReportDate: "2026-04-02", confidence: "unverified", sources },
    { ...model("fixture:stealth", "Anonymous model", "Unknown", checked), type: "stealth", sources },
  ];
  const availability = entities.map((entity) => ({ id: `endpoint:${entity.id}`, modelId: entity.id, firstSeen: checked }));
  const result = buildTimeline(entities, availability);
  assert.deepEqual(result.map(({ type, modelId, date, confidence, notable }) => ({ type, modelId, date, confidence, notable })), [
    { type: "stealth_model", modelId: "fixture:stealth", date: checked, confidence: "observed", notable: true },
    { type: "legacy_report", modelId: "fixture:legacy", date: "2026-04-02", confidence: "unverified", notable: true },
  ]);
  assert.match(result[0].description, /not the global first appearance/);
  assert.match(result[1].description, /not a verified launch/);
  assert.deepEqual(buildTimeline(entities, availability, result), result);
});

test("repository creation is distinct from launch and derivatives are not notable", () => {
  const entities = ["model", "quantization", "fine_tune", "optimization"].map((type) => ({
    ...model(`fixture:${type}`, type, "Test", checked), type, likes: 100,
    repositoryCreatedAt: "2026-08-01T12:00:00.000Z", sources,
  }));
  const result = buildTimeline(entities);
  assert.equal(result.length, 4);
  assert.equal(result.filter((event) => event.notable).length, 1);
  assert.ok(result.every((event) => event.date === "2026-08-01" && event.type === "repository_created"));
  assert.ok(entities.every((entity) => entity.releaseDate === null));
  assert.deepEqual(buildTimeline([], [], result), result);
});

test("existing archive retains every report and separates model candidates from customer stories", async () => {
  const archive = JSON.parse(await readFile(new URL("../public/models.json", import.meta.url)));
  const { models } = migrateLegacy(archive, checked);
  const result = buildTimeline(models);
  assert.equal(result.length, archive.length);
  for (const id of [94, 38, 36, 19, 64, 37, 62]) {
    assert.equal(result.find((event) => event.modelId === `legacy:${id}`).type, "legacy_report");
  }
  assert.equal(result.find((event) => event.modelId === "legacy:101").type, "product_announcement");
  assert.ok(result.every((event) => event.confidence === "unverified"));
  assert.deepEqual(buildTimeline(models, [], result), result);
});

test("confirmed reveal preserves the original stealth observation and alias", () => {
  const original = { ...model("fixture:alias", "Original alias", "Unknown", checked), type: "stealth", sources };
  const revealed = { ...model("fixture:confirmed", "Confirmed identity", "Test", checked), identity: "known", sources };
  const entities = [original, revealed];
  const availability = [{ id: "fixture:endpoint", modelId: original.id, firstSeen: checked }];
  const events = buildTimeline(entities, availability);
  const first = structuredClone(events[0]);
  applyReveal(entities, availability, events, { id: "fixture:reveal", fromId: original.id, toId: revealed.id, date: checked, sourceUrl: sources[0].url }, checked);
  const result = buildTimeline(entities, availability, events);
  assert.deepEqual(result.find((event) => event.id === first.id), first);
  assert.ok(revealed.aliases.includes("Original alias"));
  assert.equal(result.filter((event) => event.type === "model_reveal").length, 1);
});

test("empty or undated catalogs do not invent events", () => {
  assert.deepEqual(buildTimeline([]), []);
  assert.deepEqual(buildTimeline([model("fixture:unknown", "Unknown", "Unknown", checked)]), []);
});

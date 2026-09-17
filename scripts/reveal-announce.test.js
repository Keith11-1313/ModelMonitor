import test from "node:test";
import assert from "node:assert/strict";
import { validateCuration } from "./validation.js";
import { model, source, applyReveal } from "./pipeline.js";
import { buildTimeline } from "./timeline.js";

const checked = "2026-09-18";
const sourceUrl = "https://lab.example.org/model-announcement";
const reveal = {
  id: "reveal:mystery-confirmed",
  fromId: "provider:mystery-alpha",
  toId: "hf:lab/confirmed-model",
  date: "2026-08-26",
  sourceUrl,
  evidence: "The anonymous preview called mystery-alpha was the model now released as Confirmed Model.",
  dateSourceUrl: "https://lab.example.org/announcement-metadata",
  dateEvidence: "publication date: 2026-08-26",
  announcementUrl: sourceUrl,
  dateBasis: "announcement_publication",
};
const fixtureCuration = () => ({
  schemaVersion: 1,
  identities: [
    { id: reveal.fromId, providerModelId: "mystery-alpha", name: "Mystery Alpha", provider: "Unknown", identity: "unknown", type: "stealth", sourceUrl, evidence: "Anonymous preview model.", summary: "Anonymous model with no confirmed maker at first observation." },
    { id: "provider:unrelated-stealth", providerModelId: "unrelated", name: "Unrelated Stealth", provider: "Unknown", identity: "unknown", type: "stealth", sourceUrl, evidence: "Separate anonymous model.", summary: "Unrelated anonymous model." },
  ],
  links: [], reveals: [reveal], limits: [], hfOrganizations: [], hfRecentPerOrganization: 1,
});

test("generic announcement-backed reveal preserves alias history without changing unrelated unknown identities", () => {
  const curation = fixtureCuration();
  validateCuration(curation);
  const evidence = [source(reveal.sourceUrl, "Official identity evidence", "official", checked)];
  const alias = { ...model(reveal.fromId, "Mystery Alpha", "Unknown", checked), type: "stealth", sources: evidence };
  const target = { ...model(reveal.toId, "Confirmed Model", "Lab", checked), identity: "known", sources: evidence };
  const unrelated = { ...model("provider:unrelated-stealth", "Unrelated Stealth", "Unknown", checked), type: "stealth", sources: evidence };
  const originalUnrelated = structuredClone(unrelated);
  const entities = [alias, target, unrelated];
  const events = [];

  applyReveal(entities, [], events, reveal, checked);
  const timeline = buildTimeline(entities, [], events);
  assert.equal(timeline.length, 1);
  const event = timeline[0];
  assert.equal(event.type, "model_reveal");
  assert.equal(event.notable, true);
  assert.equal(event.date, reveal.date);
  assert.equal(event.dateBasis, "announcement_publication");
  assert.equal(event.previousAlias, "Mystery Alpha");
  assert.equal(event.before.modelId, alias.id);
  assert.equal(event.after.modelId, target.id);
  assert.ok(event.sources.some((entry) => entry.url === reveal.dateSourceUrl));
  assert.ok(target.aliases.includes("Mystery Alpha"));
  assert.equal(alias.canonicalId, target.id);
  assert.deepEqual(unrelated, originalUnrelated);

  applyReveal(entities, [], timeline, reveal, checked);
  assert.deepEqual(buildTimeline(entities, [], timeline), timeline);

  const invalid = fixtureCuration();
  invalid.reveals[0].date = "2026-08-29";
  assert.throws(() => validateCuration(invalid), /date requires matching source evidence/);
});

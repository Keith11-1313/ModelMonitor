import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCuration, validateData, validateGlossary, validateMilestones, validateReport, validateSnapshot } from "./validation.js";
import { digest } from "./pipeline.js";

const load = async (name) => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));
const names = ["models", "timeline", "availability", "history", "metadata", "limits", "signals", "audit"];
const data = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await load(`public/data/${name}.json`)])));
const archive = await load("public/models.json");
const curation = await load("data/curation.json");
const glossary = await load("data/glossary.json");
const milestones = await load("data/milestones.json");
const publicGlossary = await load("public/data/glossary.json");
const publicMilestones = await load("public/data/milestones.json");
const report = await load("public/data/report.json");
const snapshot = await load("public/data/snapshot.json");

validateCuration(curation);
validateGlossary(glossary);
validateMilestones(milestones);
assert.deepEqual(publicGlossary, glossary, "Published glossary differs from curated source");
assert.deepEqual(publicMilestones, milestones, "Published milestones differ from curated source");
validateReport(report);
validateSnapshot(snapshot);
validateData(data, archive);

const bytes = await readFile(new URL("../public/models.json", import.meta.url));
if (data.metadata.archive.sha256 !== digest(bytes) || data.metadata.archive.count !== archive.length) throw new Error("Legacy archive checksum/count mismatch");
console.log(`Validated ${data.models.length} entities, ${data.availability.length} availability rows, ${data.timeline.length} events, ${milestones.milestones.length} curated milestones, ${glossary.terms.length} glossary terms and ${archive.length} archived records.`);

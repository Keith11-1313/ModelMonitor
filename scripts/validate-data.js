import { readFile } from "node:fs/promises";
import { validateCuration, validateData } from "./validation.js";
import { digest } from "./pipeline.js";

const load = async (name) => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));
const names = ["models", "timeline", "availability", "history", "metadata", "limits", "signals", "audit"];
const data = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await load(`public/data/${name}.json`)])));
const archive = await load("public/models.json");
validateCuration(await load("data/curation.json"));
validateData(data, archive);
const bytes = await readFile(new URL("../public/models.json", import.meta.url));
if (data.metadata.archive.sha256 !== digest(bytes) || data.metadata.archive.count !== archive.length) throw new Error("Legacy archive checksum/count mismatch");
console.log(`Validated ${data.models.length} entities, ${data.availability.length} availability rows, ${data.timeline.length} events and ${archive.length} archived records.`);

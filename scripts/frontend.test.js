import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformSync } from "@babel/core";

const readText = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("frontend JSX parses offline and does not depend on runtime test CDNs", async () => {
  const source = await readText("index.jsx");
  assert.doesNotThrow(() => transformSync(source, {
    filename: "index.jsx",
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ["jsx"] },
  }));
  assert.ok(source.includes('fetch(`./public/data/${key}.json`'));
});

test("primary navigation exposes the intended seven dashboard views", async () => {
  const source = await readText("index.jsx");
  const match = /const NAV = (\[[^;]+\]);/.exec(source);
  assert.ok(match, "NAV declaration missing");
  const nav = JSON.parse(match[1].replaceAll("'", '"'));
  assert.deepEqual(nav, [
    ["overview", "Overview"],
    ["history", "LLM History"],
    ["releases", "Releases"],
    ["free", "Free Models"],
    ["open", "Open Models"],
    ["analysis", "Analysis"],
    ["glossary", "Glossary"],
  ]);
  assert.ok(source.includes("All Observations"), "secondary raw-observation view is missing");
});

test("frontend logic stays model-neutral instead of hardcoding example models", async () => {
  const files = ["index.jsx", "scripts/report.js", "scripts/timeline.js"];
  const text = (await Promise.all(files.map(readText))).join("\n").toLowerCase();
  for (const name of ["union alpha", "big pickle", "ox-alpha", "glm-5.3-flash"]) {
    assert.ok(!text.includes(name), `${name} is hardcoded in generic frontend/report/timeline logic`);
  }
});

test("LLM History has configurable eras, unique milestones and current coverage", async () => {
  const data = await readJson("data/milestones.json");
  assert.equal(data.schemaVersion, 1);
  assert.ok(Array.isArray(data.eras) && data.eras.length >= 6);
  assert.ok(Array.isArray(data.milestones) && data.milestones.length >= 30);
  assert.equal(new Set(data.eras.map((row) => row.id)).size, data.eras.length);
  assert.equal(new Set(data.milestones.map((row) => row.id)).size, data.milestones.length);
  const eraIds = new Set(data.eras.map((row) => row.id));
  for (const row of data.milestones) {
    assert.ok(eraIds.has(row.era), `unknown era: ${row.id}`);
    assert.match(row.sourceUrl, /^https:\/\//, `non-HTTPS historical source: ${row.id}`);
  }
  const dates = data.milestones.map((row) => row.date).sort();
  assert.ok(dates[0] <= "2013-12-31", `history starts too late: ${dates[0]}`);
  assert.ok(dates.at(-1) >= "2026-09-01", `history is not current enough: ${dates.at(-1)}`);
});

test("glossary is searchable data with stable IDs and richer key definitions", async () => {
  const data = await readJson("data/glossary.json");
  assert.equal(data.schemaVersion, 1);
  assert.ok(data.categories.length >= 8);
  assert.ok(data.terms.length >= 100);
  assert.equal(new Set(data.terms.map((row) => row.id)).size, data.terms.length);
  const map = new Map(data.terms.map((row) => [row.id, row]));
  for (const id of ["context-window", "open-weights", "mixture-of-experts", "quantization", "reasoning-model"]) {
    const row = map.get(id);
    assert.ok(row, `missing glossary term ${id}`);
    assert.ok(row.definition?.length > 20, `${id} has a weak definition`);
    assert.ok(row.explanation?.length > 20, `${id} should have a deeper explanation`);
  }
});

test("Overview supports structured report data and browser-local last-visit state", async () => {
  const source = await readText("index.jsx");
  assert.ok(source.includes("schemaVersion === 2"), "Overview does not recognize the current report schema");
  assert.ok(source.includes("localStorage"), "last-visit state is not browser-local");
  assert.ok(/since your last visit/i.test(source), "missing since-last-visit UI copy");
  assert.ok(/ModelMonitor Intelligence Brief/.test(source), "missing intelligence brief heading");
});

test("glossary UI uses explanation, examples and related-term links when present", async () => {
  const source = await readText("index.jsx");
  for (const token of ["term.explanation", "term.example", "term.related"]) assert.ok(source.includes(token), `Glossary UI does not use ${token}`);
  assert.ok(source.includes("glossary-related"));
});

test("Free Models separates provider free-access programs from model-level zero pricing", async () => {
  const source = await readText("index.jsx");
  assert.ok(source.includes("Provider programs"));
  assert.ok(source.includes("Verified $0/token endpoints"));
  assert.ok(source.includes("daily_compute_allowance"));
  assert.ok(source.includes("monthly_credits"));
});

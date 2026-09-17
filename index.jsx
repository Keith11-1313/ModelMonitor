const { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } = React;

const DATASETS = ["models", "timeline", "availability", "history", "metadata", "limits", "signals", "audit", "report", "glossary", "milestones"];
const NAV = [["overview", "Overview"], ["history", "LLM History"], ["releases", "Releases"], ["free", "Free Models"], ["open", "Open Models"], ["analysis", "Analysis"], ["glossary", "Glossary"]];
const RELEASE_TYPES = new Set(["model_release", "release", "family_introduction", "preview_release", "open_source_release", "open_weight_release", "open_weights_release", "reasoning_release", "multimodal_release", "agentic_release"]);
const FEATURES = [["reasoning", "Reasoning"], ["tools", "Tools"], ["multimodal", "Multimodal"], ["structuredOutput", "Structured output"]];
const EVENT_LABELS = { foundational_research: "Foundational research", family_introduction: "Model family introduced", legacy_report: "Legacy report · unverified", repository_created: "Repository created · not a launch", catalog_baseline: "Catalog baseline · first observation", model_release: "Model release", release: "Model release", preview_release: "Preview release", open_source_release: "Open-source release", open_weight_release: "Open-weight release", reasoning_release: "Reasoning model release", multimodal_release: "Multimodal release", agentic_release: "Agentic release", stealth_model: "Stealth model observed", model_reveal: "Identity revealed", availability_added: "Availability added", availability_removed: "Availability removed", became_free: "Became free", no_longer_free: "No longer free", price_change: "Price changed", context_change: "Context changed", capability_update: "Capabilities updated", deprecated: "Deprecated", retired: "Retired" };
const EMPTY = [];
const DAY = 86400000;

function list(value) { return Array.isArray(value) ? value : EMPTY; }
function human(value) { return value == null || value === "" ? "Unknown" : String(value).replaceAll("_", " "); }
function numeric(value) { return typeof value === "number" && Number.isFinite(value); }
function number(value) { return numeric(value) ? value.toLocaleString("en-US") : "Unknown"; }
function truth(value) { return value === true ? "Yes" : value === false ? "No" : "Unknown"; }
function day(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value)) ? value.slice(0, 10) : ""; }
function date(value) { return day(value) ? new Date(`${day(value)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Unknown"; }
function fresh(value, now) { const age = now - Date.parse(value); return Number.isFinite(age) && age >= 0 && age <= 2 * DAY; }
function safeUrl(value) {
  if (typeof value !== "string") return null;
  if (value.startsWith("/public/")) return `.${value}`;
  if (value.startsWith("./public/")) return value;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function canonical(model, modelMap) {
  const seen = new Set();
  let current = model;
  while (current?.canonicalId && !seen.has(current.id)) {
    seen.add(current.id);
    const next = modelMap.get(current.canonicalId);
    if (!next) break;
    current = next;
  }
  return current;
}
function isOpen(model) { return ["open_source", "open_weights"].includes(model.openness) && Boolean(model.license) && model.license !== "unknown"; }
function openness(model) { return isOpen(model) ? model.openness === "open_source" ? "Permissive weight license" : "Open weights · restrictions" : model.openness === "proprietary" ? "Proprietary" : "Unknown"; }
function canonicalRecord(model) { return !String(model.id).startsWith("legacy:") && !model.legacyReportDate && !model.canonicalId && !["product_announcement", "model_update_report", "unverified_entity", "alias"].includes(model.type); }
function evidenceLevel(row) {
  const ranks = { official: 0, confirmed: 1, observed: 2, unverified: 3 };
  const sources = list(row.sources);
  const rank = Math.max(ranks[row.confidence] ?? 3, ...sources.map(source => ranks[source.confidence] ?? 3), sources.length || safeUrl(row.sourceUrl) ? 0 : 3);
  return rank < 2 ? "fact" : rank === 2 ? "derived" : "unverified";
}
function verifiedRelease(model) { return canonicalRecord(model) && ["model", "preview", "base_model", "fine_tune", "finetune"].includes(model.type) && Boolean(day(model.releaseDate)) && evidenceLevel(model) === "fact"; }
function notableRelease(event, modelMap, now) {
  const model = modelMap.get(event.modelId);
  return event.notable === true && RELEASE_TYPES.has(event.type) && evidenceLevel(event) === "fact" && Boolean(day(event.date)) && Date.parse(event.date) <= now && (!model || canonicalRecord(model));
}
function milestoneRows(dataset) { return Array.isArray(dataset) ? dataset : list(dataset?.milestones); }
function notableMilestoneRelease(row, now) {
  return RELEASE_TYPES.has(row.eventType) && evidenceLevel(row) === "fact" && Boolean(day(row.date)) && Date.parse(row.date) <= now;
}
function releaseKey(row) { return `${day(row.date)}|${String(row.title || row.name || row.id || "").trim().toLowerCase()}`; }
function combinedReleases(events, milestones, modelMap, now) {
  const rows = [
    ...events.filter(event => notableRelease(event, modelMap, now)).map(event => ({ ...event, eventType: event.type, organization: event.provider, sources: list(event.sources) })),
    ...milestoneRows(milestones).filter(row => notableMilestoneRelease(row, now)).map(row => ({ ...row, type: row.eventType, provider: row.organization || row.provider, sources: milestoneSources(row) })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const seen = new Set();
  return rows.filter(row => { const key = releaseKey(row); if (seen.has(key)) return false; seen.add(key); return true; });
}
function feature(row, key) { return key === "multimodal" ? (list(row.modalities).length ? row.modalities.some(m => m !== "text") : null) : row[key] ?? null; }
function coverage(row) { return FEATURES.filter(([key]) => feature(row, key) === true).length; }
function price(row) { const p = row.pricing; return p && numeric(p.input) && numeric(p.output) ? `${p.currency || "Unknown currency"} ${p.input} / ${p.output}` : "Unknown"; }
function currentEvidence(row, metadata, now) {
  if (row.status !== "available" || !fresh(row.lastChecked, now)) return false;
  const health = list(metadata?.sources);
  const sources = list(row.sources);
  if (!health.length || !sources.length) return false;
  return sources.every(source => {
    const status = health.find(item => item.url === source.url || item.id === source.sourceId);
    return status?.status === "ok" && fresh(status.lastSuccess, now) && fresh(source.lastChecked, now);
  });
}
function currentPriced(row, metadata, now) {
  return currentEvidence(row, metadata, now) && numeric(row.pricing?.input) && numeric(row.pricing?.output) && row.pricing.input >= 0 && row.pricing.output >= 0 && list(row.sources).some(source => /pric|cost/i.test(source.label || "") && fresh(source.lastChecked, now));
}
function currentFree(row, metadata, now) { return row.free === true && row.pricing?.input === 0 && row.pricing?.output === 0 && currentPriced(row, metadata, now); }
function searchable(model, availability = EMPTY) { return [model.name, model.id, model.canonicalId, model.provider, model.hfId, model.license, model.type, ...list(model.aliases), ...availability.flatMap(row => [row.provider, row.providerModelId, row.id])].filter(Boolean).join(" ").toLowerCase(); }
function countBy(rows, getKey) { const counts = new Map(); rows.forEach(row => { const key = getKey(row); counts.set(key, (counts.get(key) || 0) + 1); }); return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); }
function emptyData(key) { return key === "history" ? { snapshots: [] } : key === "metadata" ? { sources: [], limitations: [] } : key === "report" ? null : key === "glossary" ? { terms: [], categories: [] } : key === "milestones" ? { milestones: [] } : []; }
function validData(key, data) {
  if (key === "metadata") return data && !Array.isArray(data) && Array.isArray(data.sources);
  if (key === "history") return data && Array.isArray(data.snapshots) && data.snapshots.every(row => row && typeof row === "object");
  if (key === "report") return data == null || (data && !Array.isArray(data) && data.summary && data.snapshot && (data.schemaVersion === 1 || (data.schemaVersion === 2 && ["changeLog", "modelChanges", "availabilityChanges", "pricingChanges", "openModelChanges", "historicalChanges", "highlights", "watchlist"].every(field => Array.isArray(data[field])))));
  if (key === "glossary") return data && Array.isArray(data.terms) && data.terms.every(term => term && term.id && term.term && term.definition);
  if (key === "milestones") return data && (Array.isArray(data) || (Array.isArray(data.milestones) && data.milestones.every(row => row && row.id && row.date && row.title)));
  return Array.isArray(data) && data.every(row => row && typeof row === "object" && !Array.isArray(row) && (!["models", "availability", "timeline"].includes(key) || typeof row.id === "string"));
}
function useDatasets() {
  const [state, setState] = useState(() => Object.fromEntries(DATASETS.map(key => [key, { status: "loading", data: emptyData(key) }])));
  const controllers = useRef(new Map());
  const load = useCallback(async key => {
    controllers.current.get(key)?.abort();
    const controller = new AbortController();
    controllers.current.set(key, controller);
    setState(old => ({ ...old, [key]: { status: "loading", data: emptyData(key) } }));
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`./public/data/${key}.json`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!validData(key, data)) throw new Error("Unexpected dataset format");
      if (controllers.current.get(key) === controller) setState(old => ({ ...old, [key]: { status: "ready", data } }));
    } catch (error) {
      if (controllers.current.get(key) === controller) setState(old => ({ ...old, [key]: { status: "error", data: emptyData(key), error: error.name === "AbortError" ? "Request timed out" : error.message } }));
    } finally { clearTimeout(timeout); }
  }, []);
  useEffect(() => {
    DATASETS.forEach(key => load(key));
    return () => { const active = [...controllers.current.values()]; controllers.current.clear(); active.forEach(controller => controller.abort()); };
  }, [load]);
  return [state, load];
}

function SourceLink({ url, children }) { const href = safeUrl(url); return href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{children || url}</a> : <span>{children || "Source unavailable"}</span>; }
function Tag({ children, warning = false }) { return <span className={`tag${warning ? " warning" : ""}`}>{children}</span>; }
function Empty({ children = "No records match these filters. Try clearing the filters." }) { return <div className="empty">{children}</div>; }
function Table({ caption, headers, children }) { return <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}><table><caption>{caption}</caption><thead><tr>{headers.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Sources({ sources }) { return list(sources).length ? <ul className="source-list">{sources.map((source, i) => <li key={`${source.url}-${i}`}><SourceLink url={source.url}>{source.label || source.url || "Source"}</SourceLink><small>{human(source.confidence)} · {source.lastChecked ? `Checked ${date(source.lastChecked)}` : "Check date not recorded"}{source.field ? ` · Field: ${human(source.field)}` : ""}</small></li>)}</ul> : <p className="muted">No source evidence is attached to this record.</p>; }
function RecordFields({ record }) {
  if (record == null) return <span className="muted">Unknown</span>;
  if (typeof record !== "object") return typeof record === "boolean" ? truth(record) : <span>{String(record)}</span>;
  if (Array.isArray(record)) return record.length ? <ul className="record-list">{record.map((item, index) => <li key={index}><RecordFields record={item} /></li>)}</ul> : <span className="muted">None documented</span>;
  return <dl className="record-fields">{Object.entries(record).map(([key, value]) => <React.Fragment key={key}><dt>{human(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}</dt><dd>{/url|link/i.test(key) && typeof value === "string" ? <SourceLink url={value} /> : <RecordFields record={value} />}</dd></React.Fragment>)}</dl>;
}
function LoadStatus({ state, retry }) {
  const loading = DATASETS.filter(key => state[key].status === "loading");
  const errors = DATASETS.filter(key => state[key].status === "error");
  return <div aria-live="polite">{loading.length > 0 && <p className="notice">Loading {loading.join(", ")}… Other sections remain usable.</p>}{errors.map(key => <div className="notice warning" key={key}><span><strong>{human(key)} unavailable.</strong> {state[key].error}. This dataset is empty; no replacement records are shown.</span><button className="secondary" onClick={() => retry(key)}>Retry {key}</button></div>)}</div>;
}
function SearchFilters({ query, setQuery, provider, setProvider, providers = EMPTY, children, reset, placeholder = "Name, alias, provider ID, HF ID, license" }) { return <div className="filters"><label className="search">Search<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} /></label>{setProvider && <label>Provider<select value={provider} onChange={event => setProvider(event.target.value)}><option value="">All providers</option>{providers.map(value => <option key={value} value={value}>{human(value)}</option>)}</select></label>}{children}<button className="secondary filter-reset" onClick={reset}>Clear filters</button></div>; }
function DateFacts({ model }) { return <dl className="date-facts"><dt>Release</dt><dd>{date(model.releaseDate)}{model.releaseDate && !verifiedRelease(model) ? " · unverified" : ""}</dd><dt>Legacy report</dt><dd>{date(model.legacyReportDate)}</dd><dt>Repository created</dt><dd>{date(model.repositoryCreatedAt)}</dd><dt>Date basis</dt><dd>{human(model.dateBasis)}</dd></dl>; }
function ModelButton({ model, onSelect, children }) { return <button className="text-button" onClick={() => onSelect(model)}>{children || model.name || model.id}</button>; }
const VISIT_KEY = "modelmonitor.lastVisit";
function readLastVisit() {
  try { const value = localStorage.getItem(VISIT_KEY); return day(value) && Date.parse(value) <= Date.now() ? value : null; } catch { return null; }
}
function saveLastVisit(value) { try { localStorage.setItem(VISIT_KEY, value); } catch {} }
function unreadChanges(changes, cutoff, now) { return cutoff ? list(changes).filter(row => Date.parse(row.observedAt) > Date.parse(cutoff) && Date.parse(row.observedAt) <= now) : []; }
function ChangeList({ changes, modelMap, onSelect }) {
  return changes.length ? <ul className="change-list">{changes.map(row => {
    const model = modelMap.get(row.modelId);
    const level = ["fact", "derived"].includes(row.level) ? row.level : "unverified";
    return <li key={row.id}><details><summary><Tag warning={level === "unverified"}>{human(level)}</Tag> {model?.name || row.after?.name || row.before?.name || row.entityId} · {human(row.type)}<small>Observed {row.observedAt || "Unknown"}{row.historicalDate ? ` · Historical date ${date(row.historicalDate)}` : ""}</small></summary><p>{human(row.provider)} · {human(row.confidence)} · Fields: {list(row.fields).map(human).join(", ") || "None supplied"}</p>{model && <ModelButton model={model} onSelect={onSelect} />}{row.url ? <p><SourceLink url={row.url}>Change evidence</SourceLink></p> : <p className="muted">No direct evidence link supplied; inspect the recorded fields below.</p>}<RecordFields record={{ dataset: row.dataset, operation: row.operation, before: row.before ?? null, after: row.after ?? null }} /></details></li>;
  })}</ul> : <Empty>No changes recorded for this section in the report interval. This does not establish that nothing changed elsewhere.</Empty>;
}
function SinceLastVisit({ report, cutoff, now, modelMap, onSelect, onMarkSeen }) {
  const changes = unreadChanges(report?.changeLog, cutoff, now);
  const since = cutoff ? date(cutoff) : null;
  return <section className="section" id="since-last-visit"><div className="section-toolbar"><h2>Since your last visit</h2><button className="secondary" onClick={onMarkSeen} disabled={!changes.length}>Mark all as seen</button></div><p className="muted">{cutoff ? `This browser last checked ModelMonitor on ${since}. Historical corrections count when ModelMonitor recorded them, not when the original event happened.` : "This looks like your first visit on this browser. ModelMonitor will remember this point locally so the next visit can show only what changed."}</p><p role="status"><strong>{report ? number(changes.length) : "Unknown"}</strong> {report ? changes.length === 1 ? "unread change" : "unread changes" : "— the current report has not been generated yet"}</p>{changes.length > 0 && <details><summary>See unread changes ({changes.length})</summary><ChangeList changes={changes} modelMap={modelMap} onSelect={onSelect} /></details>}</section>;
}

function milestoneEras(dataset) {
  const configured = Array.isArray(dataset.eras) ? dataset.eras : [];
  const map = new Map(configured.filter(row => row?.id).map(row => [row.id, { id: row.id, label: row.label || human(row.id), description: row.description || "", range: row.range }]));
  list(dataset.milestones).slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(row => {
    const id = row.era || "uncategorized";
    if (!map.has(id)) map.set(id, { id, label: human(id), description: "", range: null });
  });
  return [...map.values()];
}
function milestoneSources(row) { return list(row.sources).length ? row.sources : row.sourceUrl ? [{ url: row.sourceUrl, label: row.sourceLabel, confidence: row.confidence, lastChecked: row.lastChecked ?? row.checkedAt }] : []; }
function HistoryPage({ dataset }) {
  const [era, setEra] = useState("");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const search = useDeferredValue(query.trim().toLowerCase());
  const milestones = list(dataset.milestones);
  const eras = milestoneEras(dataset);
  const providers = [...new Set(milestones.map(row => row.organization || row.provider).filter(Boolean))].sort();
  const invalid = Boolean(start && end && start > end);
  const rows = milestones.filter(row => !invalid && (!era || (row.era || "uncategorized") === era) && (!provider || (row.organization || row.provider) === provider) && (!start || day(row.date) >= start) && (!end || day(row.date) <= end) && (!search || [row.title, row.organization, row.provider, row.description, row.whyItMatters, row.eventType].join(" ").toLowerCase().includes(search))).sort((a, b) => a.date.localeCompare(b.date));
  const grouped = new Map();
  rows.forEach(row => { const id = row.era || "uncategorized"; if (!grouped.has(id)) grouped.set(id, []); grouped.get(id).push(row); });
  return <><PageHeading title="LLM History" description="A curated path from the ideas that led to Transformers to today’s reasoning, multimodal and agentic models. It is a history guide, not a list of every model ever released." /><SearchFilters {...{ query, setQuery, provider, setProvider, providers }} placeholder="Milestone, organization, or idea" reset={() => { setQuery(""); setEra(""); setProvider(""); setStart(""); setEnd(""); }}><label>Era<select value={era} onChange={event => setEra(event.target.value)}><option value="">All eras</option>{eras.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>From<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>Through<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label></SearchFilters><p className="result-count" role="status">{number(rows.length)} curated milestones</p>{invalid && <p role="alert" className="notice warning">The start date must be on or before the end date.</p>}{rows.length ? <div className="history">{[...grouped].map(([eraId, group]) => { const eraInfo = eras.find(item => item.id === eraId); return <section className="history-era" key={eraId}><div className="history-era-heading"><h2>{eraInfo?.label || human(eraId)}</h2>{eraInfo?.range && <small>{eraInfo.range[0]}{eraInfo.range[1] !== eraInfo.range[0] ? `–${eraInfo.range[1] >= 2100 ? "present" : eraInfo.range[1]}` : ""}</small>}{eraInfo?.description && <p>{eraInfo.description}</p>}</div><ol>{group.map(row => <li key={row.id}><time dateTime={row.date}>{date(row.date)}</time><div className="event-body"><div className="event-meta"><Tag>{EVENT_LABELS[row.eventType] || human(row.eventType)}</Tag><Tag warning={evidenceLevel(row) === "unverified"}>{human(evidenceLevel(row))} · {human(row.confidence)}</Tag><span>{row.organization || row.provider || "Unknown organization"}</span></div><h3>{row.title}</h3>{row.description && <p>{row.description}</p>}{row.whyItMatters && <p className="event-caveat"><strong>Why it matters:</strong> {row.whyItMatters}</p>}<details><summary>Source</summary><Sources sources={milestoneSources(row)} /><p className="footnote">Date basis: {human(row.dateBasis)}</p></details></div></li>)}</ol></section>; })}</div> : <Empty>No milestones match these filters.</Empty>}</>;
}

function hashRoute(hash, terms = EMPTY) {
  let id;
  try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch { return { view: "overview", term: "" }; }
  if (id.startsWith("glossary/")) return { view: "glossary", term: id.slice(9) };
  if (id === "context-window" || terms.some(term => term.id === id)) return { view: "glossary", term: id };
  return { view: id === "timeline" || NAV.some(([key]) => key === id) ? id : "overview", term: "" };
}
function GlossaryPage({ glossary, target }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [letter, setLetter] = useState("");
  const search = query.trim().toLowerCase();
  const allTerms = list(glossary.terms);
  const termMap = new Map(allTerms.map(term => [term.id, term]));
  const terms = allTerms.filter(term => (!category || term.category === category) && (!letter || term.term[0].toUpperCase() === letter) && (!search || [term.term, term.definition, term.explanation, term.example, ...list(term.aliases)].filter(Boolean).join(" ").toLowerCase().includes(search))).sort((a, b) => a.term.localeCompare(b.term));
  const categories = [...new Set([...list(glossary.categories).filter(value => typeof value === "string"), ...allTerms.map(term => term.category).filter(Boolean)])].sort();
  useEffect(() => { if (!target) return; const frame = requestAnimationFrame(() => { const entry = document.getElementById(target); entry?.focus({ preventScroll: true }); entry?.scrollIntoView({ block: "start" }); }); return () => cancelAnimationFrame(frame); }, [target, glossary, query, category, letter]);
  return <><PageHeading title="Glossary" description="Plain-language definitions for the terms used across ModelMonitor and the wider LLM ecosystem." /><SearchFilters {...{ query, setQuery }} placeholder="Search a term, definition, or example" reset={() => { setQuery(""); setCategory(""); setLetter(""); }}><label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{human(value)}</option>)}</select></label></SearchFilters><div className="alphabet" role="group" aria-label="Filter terms A to Z"><button className="secondary" aria-pressed={!letter} onClick={() => setLetter("")}>All</button>{"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(value => <button key={value} className="secondary" aria-pressed={letter === value} onClick={() => setLetter(value)}>{value}</button>)}</div><p className="result-count" role="status">{number(terms.length)} terms</p>{target && !termMap.has(target) && <p className="notice">That glossary link does not exist in the loaded data. Try searching for the term instead.</p>}<div className="glossary">{terms.map(term => <article key={term.id} id={term.id} tabIndex={-1} className="glossary-entry"><h3><a href={`#glossary/${encodeURIComponent(term.id)}`} className="anchor">{term.term}</a><Tag>{human(term.category)}</Tag></h3><p className="glossary-definition">{term.definition}</p>{term.explanation && <p className="glossary-explanation">{term.explanation}</p>}{term.example && <p className="glossary-example"><strong>Example:</strong> {term.example}</p>}{list(term.related).length > 0 && <p className="glossary-related"><strong>Related:</strong> {term.related.map((id, index) => <React.Fragment key={id}>{index > 0 && ", "}{termMap.has(id) ? <a href={`#glossary/${encodeURIComponent(id)}`}>{termMap.get(id).term}</a> : human(id)}</React.Fragment>)}</p>}</article>)}</div>{!terms.length && <Empty>No glossary terms match those filters.</Empty>}</>;
}

function EventList({ events, modelMap, onSelect }) {
  if (!events.length) return <Empty>No timeline events to show. Switch to all observations or broaden your filters. An empty timeline does not mean no models were released.</Empty>;
  const groups = new Map();
  events.forEach(event => { const key = day(event.date).slice(0, 7) || "unknown"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(event); });
  return <div className="timeline">{[...groups].map(([month, rows]) => <section className="timeline-month" key={month}><h2>{month === "unknown" ? "Date unknown" : new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2><ol>{rows.map(event => {
    const model = modelMap.get(event.modelId);
    const caveat = event.type === "legacy_report" ? "Unverified archive report date, not a verified release." : event.type === "repository_created" ? "Hugging Face repository creation, not a launch date." : event.type === "catalog_baseline" ? "Initial catalog observation, not a release or a newly added endpoint." : null;
    return <li key={event.id}><time dateTime={day(event.date) || undefined}>{date(event.date)}</time><div className="event-body"><div className="event-meta"><Tag warning={event.confidence === "unverified" || event.type === "legacy_report"}>{EVENT_LABELS[event.type] || human(event.type)}</Tag><span>{human(event.provider)} · {human(event.confidence)}</span></div><h3>{event.type === "model_reveal" && event.previousAlias ? <>{event.previousAlias}<br /><span aria-label="revealed as">↓</span><br />{modelMap.get(event.after?.modelId)?.name || model?.name || "Identity unavailable"}<small>Identity revealed</small></> : event.title || human(event.type)}</h3>{caveat && <p className="event-caveat">{caveat}</p>}{event.description && <p>{event.description}</p>}{event.previousAlias && <p>Original alias: <strong>{event.previousAlias}</strong></p>}{model ? <ModelButton model={model} onSelect={onSelect}>View identity and evidence for {model.name}</ModelButton> : <p className="muted">Linked entity: {event.modelId || "Unknown"} · details unavailable</p>}<details><summary>Event evidence and changes</summary><Sources sources={event.sources} />{(event.before !== undefined || event.after !== undefined) && <RecordFields record={{ before: event.before ?? null, after: event.after ?? null }} />}</details></div></li>;
  })}</ol></section>)}</div>;
}
function TimelinePage({ events, models, modelMap, availability, onSelect }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const [category, setCategory] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [all, setAll] = useState(true);
  const search = useDeferredValue(query.trim().toLowerCase());
  const providers = [...new Set(events.map(event => event.provider).filter(Boolean))].sort();
  const categories = [...new Set(events.map(event => event.type).filter(Boolean))].sort();
  const invalid = Boolean(start && end && start > end);
  const filtered = useMemo(() => events.filter(event => {
    const model = modelMap.get(event.modelId) || {};
    const text = `${searchable(model, availability.filter(row => row.modelId === model.id))} ${event.title || ""} ${event.description || ""} ${event.previousAlias || ""} ${event.provider || ""} ${event.type || ""}`.toLowerCase();
    return !invalid && (all || event.notable === true) && (!provider || event.provider === provider) && (!category || event.type === category) && (!start || day(event.date) >= start) && (!end || (day(event.date) && day(event.date) <= end)) && (!search || text.includes(search));
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), [events, models, modelMap, availability, search, provider, category, start, end, all, invalid]);
  return <><PageHeading title="Timeline" description="A dated record of reports, discoveries and meaningful changes. Each event states what its date actually represents." /><p className="footnote">Notable shows verified releases, sourced stealth appearances and reveals, availability changes, retirements and base/cache price changes of at least 10% (including transitions to or from zero). Archive reports, repository creation and baselines remain under All observations; feature flags and minor price changes are not major events.</p><SearchFilters {...{ query, setQuery, provider, setProvider, providers }} reset={() => { setQuery(""); setProvider(""); setCategory(""); setStart(""); setEnd(""); setAll(false); }}><label>Event category<select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{EVENT_LABELS[value] || human(value)}</option>)}</select></label><label>From<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>Through<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label></SearchFilters><div className="section-toolbar"><label className="checkbox"><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)} />All observations (includes archived reports, repository creation and baselines)</label><span role="status">{number(filtered.length)} events · {all ? "All observations" : "Notable only"}</span></div>{invalid && <p role="alert" className="notice warning">The start date must be on or before the end date.</p>}<EventList events={filtered} modelMap={modelMap} onSelect={onSelect} /></>;
}
function PageHeading({ title, description }) { return <header className="page-heading"><h1>{title}</h1><p>{description}</p></header>; }
function CatalogPage({ mode, models, availability, onSelect }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState(mode === "open" ? "observed" : "release");
  const search = useDeferredValue(query.trim().toLowerCase());
  const open = mode === "open";
  const [allEntities, setAllEntities] = useState(false);
  const eligible = useMemo(() => open ? models.filter(model => canonicalRecord(model) && isOpen(model)) : allEntities ? models : models.filter(model => verifiedRelease(model) && Date.parse(model.releaseDate) <= Date.now()), [models, open, allEntities]);
  const providers = [...new Set(eligible.map(model => model.provider).filter(Boolean))].sort();
  const rows = useMemo(() => eligible.filter(model => (!provider || model.provider === provider) && (!kind || (open ? model.openness === kind : kind === "verified" ? verifiedRelease(model) : model.type === kind)) && (!search || searchable(model, availability.filter(row => row.modelId === model.id)).includes(search))).sort((a, b) => sort === "name" ? String(a.name || a.id).localeCompare(String(b.name || b.id)) : sort === "downloads" ? (b.downloads ?? -1) - (a.downloads ?? -1) : String(b[sort === "release" ? "releaseDate" : "firstSeen"] || "").localeCompare(String(a[sort === "release" ? "releaseDate" : "firstSeen"] || "")) || a.id.localeCompare(b.id)), [eligible, provider, kind, open, search, availability, sort]);
  return <><PageHeading title={open ? "Open Models" : "Releases"} description={open ? "Documented weight licenses, not assumptions based on hosting. Permissive licenses and restricted open weights stay separate." : "Source-backed model release dates by default. Product announcements, unverified entities, aliases and legacy reports remain available under all observations."} /><p className="notice">{open ? `${models.filter(model => !model.openness || model.openness === "unknown" || (["open_source", "open_weights"].includes(model.openness) && !isOpen(model))).length} entities have unknown or undocumented openness and are excluded. “Permissive” describes weight licensing, not full OSI AI certification. Free hosted access is a separate question.` : "Release date, legacy report date and repository creation are separate fields. First observed is only the start of local tracking; none of these other dates is substituted for a release."}</p>{!open && <label className="checkbox"><input type="checkbox" checked={allEntities} onChange={event => { setAllEntities(event.target.checked); setKind(""); setProvider(""); }} />All observations: include legacy, product and unverified entities</label>}<SearchFilters {...{ query, setQuery, provider, setProvider, providers }} reset={() => { setQuery(""); setProvider(""); setKind(""); setSort(open ? "observed" : "release"); setAllEntities(false); }}><label>{open ? "Weight license class" : "Entity type"}<select value={kind} onChange={event => setKind(event.target.value)}><option value="">All {open ? "documented licenses" : "entities"}</option>{open ? <><option value="open_source">Permissive weight license</option><option value="open_weights">Restricted open weights</option></> : <><option value="verified">Verified release dates only</option>{[...new Set(models.map(model => model.type).filter(Boolean))].sort().map(value => <option key={value} value={value}>{human(value)}</option>)}</>}</select></label><label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="observed">First observed, newest</option><option value="release">Release date, newest</option><option value="name">Name</option>{open && <option value="downloads">Downloads, highest</option>}</select></label></SearchFilters><p className="result-count" role="status">{number(rows.length)} {open ? "documented open entities" : "tracked entities"}</p>{rows.length ? <Table caption={open ? "Documented open models" : "Discovered entities and separate date evidence"} headers={open ? ["Model / provider", "Weight license", "Architecture / parameters", "Context / popularity", "Date evidence"] : ["Entity / provider", "Type / confidence", "Date evidence", "First observed", "License"]}>{rows.map(model => <tr key={model.id}><th scope="row"><ModelButton model={model} onSelect={onSelect} /><small>{human(model.provider)}</small><small className="mono">{model.id}</small></th>{open ? <><td><Tag>{openness(model)}</Tag><small>{model.license}</small></td><td>{human(model.architecture)}<small>Total: {number(model.parameters)}</small><small>Active: {number(model.activeParameters)}</small><small>Quantization: {human(model.quantization)}</small></td><td>{number(model.context)} tokens<small>{number(model.downloads)} downloads</small><small>{number(model.likes)} likes · popularity only</small></td><td><DateFacts model={model} /></td></> : <><td>{human(model.type)}<small><Tag warning={model.confidence === "unverified"}>{human(model.confidence)}</Tag></small></td><td><DateFacts model={model} /></td><td>{date(model.firstSeen)}</td><td>{human(model.license)}<small>{openness(model)}</small></td></>}</tr>)}</Table> : <Empty />}</>;
}
function AvailabilityTable({ rows, modelMap, onSelect, current = false }) { return <Table caption={current ? "Current free endpoints with fresh zero-price evidence" : "Not current: retained free claims"} headers={["Endpoint / identity", "Price: input / output", "Documented features", "Context", "Evidence / conditions"]}>{rows.map(row => {
  const model = modelMap.get(row.modelId);
  return <tr key={row.id}><th scope="row">{model ? <ModelButton model={model} onSelect={onSelect}>{row.providerModelId || model.name}</ModelButton> : row.providerModelId || row.id}<small>{human(row.provider)}</small><small className="mono">{row.modelId}</small></th><td>{price(row)}<small>per {row.pricing?.unit || "unknown unit"}</small><Tag warning={!current}>{current ? "Current free token pricing" : "Not current / not verified"}</Tag></td><td>{FEATURES.map(([key, label]) => <small key={key}>{label}: {truth(feature(row, key))}</small>)}</td><td>{number(row.context)} tokens</td><td><small>Checked {date(row.lastChecked)}</small><small>Status: {human(row.status)} · Free: {truth(row.free)}</small><p>{row.notes || "Tier conditions and quotas are not documented in this record. Check the provider source."}</p><Sources sources={row.sources} /></td></tr>;
})}</Table>; }
function FreeAccessCards({ programs }) {
  if (!programs.length) return <Empty>No verified provider free-access programs match these filters.</Empty>;
  const labels = { zero_price_models: "Zero-price models", free_tier: "Free tier", daily_compute_allowance: "Daily allowance", monthly_credits: "Monthly credits" };
  return <div className="limit-grid free-program-grid">{programs.map((record, index) => <article className="limit-card free-program-card" key={record.id || index}><div className="limit-card-top"><span className="eyebrow">{human(record.provider)}</span><Tag>{labels[record.accessType] || human(record.accessType)}</Tag></div><h3>{record.product || "Free access"}</h3><p>{record.allowance || "The provider documents a free-access path; check the source for current limits."}</p><dl><dt>Plan</dt><dd>{record.plan || "Unknown"}</dd><dt>Window</dt><dd>{human(record.window)}</dd><dt>Reset</dt><dd>{record.reset?.description || human(record.reset?.type)}</dd></dl><SourceLink url={record.sourceUrl}>Check current provider terms</SourceLink><small>Verified {date(record.lastChecked)}</small></article>)}</div>;
}
function FreePage({ availability, metadata, limits, now, modelMap, onSelect }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const search = useDeferredValue(query.trim().toLowerCase());
  const freePrograms = limits.filter(row => ["zero_price_models", "free_tier", "daily_compute_allowance", "monthly_credits"].includes(row.accessType));
  const providers = [...new Set([...availability.map(row => row.provider), ...freePrograms.map(row => row.provider)].filter(Boolean))].sort();
  const matches = row => (!provider || row.provider === provider) && (!search || `${searchable(modelMap.get(row.modelId) || {}, [row])} ${row.notes || ""}`.toLowerCase().includes(search));
  const programMatches = row => (!provider || row.provider === provider) && (!search || `${row.provider} ${row.product} ${row.plan} ${row.allowance || ""} ${row.reset?.description || ""}`.toLowerCase().includes(search));
  const rows = availability.filter(row => currentFree(row, metadata, now) && matches(row));
  const excluded = availability.filter(row => row.free === true && !currentFree(row, metadata, now) && matches(row));
  const programs = freePrograms.filter(programMatches);
  return <><PageHeading title="Free Models" description="Two different things are shown here: provider free tiers or allowances, and specific endpoints with verified $0 token pricing. They are not interchangeable." /><p className="notice">A provider can offer a free tier without making every model free. Likewise, a $0/token endpoint can still have request, token, credit or capacity limits. ModelMonitor keeps those cases separate.</p><SearchFilters {...{ query, setQuery, provider, setProvider, providers }} reset={() => { setQuery(""); setProvider(""); }} /><section className="section free-programs"><span className="eyebrow">Provider programs</span><h2>Ways to use models without normal pay-as-you-go charges</h2><p className="muted">These are provider-level programs verified from official documentation. They may be quota-limited, credit-based, or exclude some models.</p><FreeAccessCards programs={programs} /></section><section className="section"><div className="section-toolbar"><div><span className="eyebrow">Model-level evidence</span><h2>Verified $0/token endpoints</h2></div><p role="status">{rows.length} current endpoints</p></div><p className="muted">These rows require available status, an explicit free flag, zero input/output token prices, fresh evidence and healthy contributing sources. Evidence older than 48 hours is excluded.</p>{rows.length ? <AvailabilityTable rows={rows} modelMap={modelMap} onSelect={onSelect} current /> : <Empty>No current zero-token-price endpoints satisfy the evidence and freshness checks yet. OpenRouter data will appear after a successful collector run.</Empty>}</section><section className="section"><h2>Not current</h2><p className="muted">Retained $0/token claims with removed availability, stale or failed sources, or insufficient price evidence. These do not contribute to the current free count.</p>{excluded.length ? <AvailabilityTable rows={excluded} modelMap={modelMap} onSelect={onSelect} /> : <Empty>No excluded free claims match these filters.</Empty>}<p className="footnote">{availability.filter(row => row.free == null).length} endpoints have unknown model-level free status across the loaded catalog. Provider free-tier cards above do not change those unknowns into free models.</p></section></>;
}
function AnalysisSnapshot({ free, paid, open, models }) {
  const providers = new Set(models.filter(canonicalRecord).map(model => model.provider).filter(Boolean));
  const cards = [
    ["Free now", free.length, "Current endpoints with fresh evidence and $0 input/output token prices."],
    ["Paid now", paid.length, "Current endpoints with fresh non-zero token pricing."],
    ["Open models", open.length, "Tracked canonical models with a documented open-source or open-weight license."],
    ["Providers", providers.size, "Organizations currently represented by canonical model records."],
  ];
  return <section className="analysis-snapshot" aria-label="Analysis snapshot"><div className="analysis-snapshot-heading"><div><span className="eyebrow">Quick read</span><h2>What does the dataset say right now?</h2></div><p>These are counts from the records loaded in your browser. They are not model-quality rankings.</p></div><div className="analysis-stat-grid">{cards.map(([label, value, description]) => <article className="analysis-stat" key={label}><strong className="analysis-stat-value">{number(value)}</strong><h3>{label}</h3><p>{description}</p></article>)}</div></section>;
}
function AnalysisGuide() {
  return <section className="analysis-guide"><div><span className="eyebrow">How to read this page</span><h2>Three things to keep in mind</h2></div><div className="analysis-guide-grid"><article><span className="guide-number">1</span><h3>Bars = how much</h3><p>Longer bars mean a larger count or value. They do not mean a model is smarter.</p></article><article><span className="guide-number">2</span><h3>Dots = price vs features</h3><p>Move left for lower token price. Move up for more of the four tracked features we have documented.</p></article><article><span className="guide-number">3</span><h3>Unknown stays unknown</h3><p>If a source does not document a feature, price or license, ModelMonitor does not guess.</p></article></div></section>;
}
function Bars({ title, description, rows, format = number, eyebrow = "Comparison" }) { const maximum = Math.max(1, ...rows.map(row => row[1])); return <section className="chart-panel"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p>{rows.length ? <ol className="bars">{rows.map(([label, value], index) => <li key={`${label}-${index}`}><div className="bar-label"><span>{label}</span><strong className="mono">{format(value)}</strong></div><div className="bar-track" aria-hidden="true"><div style={{ width: `${Math.max(0, value) / maximum * 100}%` }} /></div></li>)}</ol> : <Empty>No documented data for this comparison.</Empty>}</section>; }
function FeatureChart({ free, paid }) {
  const groups = [["Free", free, "free"], ["Paid", paid, "paid"]];
  return <section className="chart-panel wide feature-visual"><span className="eyebrow">Feature coverage</span><h2>What can free and paid endpoints do?</h2><p>Each bar shows the share of current endpoints explicitly documented as supporting a feature. Unknown means the source did not tell us.</p><div className="feature-legend"><span><i className="legend-swatch free-swatch" />Free</span><span><i className="legend-swatch paid-swatch" />Paid</span></div><div className="feature-compare">{FEATURES.map(([key, label]) => <article className="feature-row" key={key}><div className="feature-name"><h3>{label}</h3><small>Explicit support in provider metadata</small></div><div className="feature-groups">{groups.map(([groupLabel, group, tone]) => { const yes = group.filter(row => feature(row, key) === true).length; const no = group.filter(row => feature(row, key) === false).length; const unknown = group.length - yes - no; const percent = group.length ? yes / group.length * 100 : 0; return <div className="feature-group" key={groupLabel}><div className="feature-group-label"><strong>{groupLabel}</strong><span>{yes} of {group.length} · {Math.round(percent)}%</span></div><div className="feature-bar" aria-label={`${groupLabel}: ${yes} of ${group.length} documented as supported`}><span className={tone} style={{ width: `${percent}%` }} /></div><small>{unknown ? `${unknown} unknown` : "No unknowns"}{no ? ` · ${no} marked no` : ""}</small></div>; })}</div></article>)}</div><p className="footnote">This measures documentation coverage only. It does not measure how well a feature works.</p></section>;
}
function Scatter({ rows }) {
  const points = rows.filter(row => row.pricing?.currency === "USD" && row.pricing?.unit === "1M tokens").map(row => ({ row, x: row.pricing.input + row.pricing.output, y: coverage(row) }));
  const maximum = Math.max(1, ...points.map(point => point.x));
  return <section className="chart-panel wide"><span className="eyebrow">Price map</span><h2>What do you get for the token price?</h2><p>Each dot is one hosted endpoint. Farther left means a lower combined input + output price. Higher means more of the four tracked features are explicitly documented.</p><div className="plot-key"><span className="plot-direction">← Lower price</span><span className="plot-direction">More documented features ↑</span><span><i className="dot-key free-dot" />Free</span><span><i className="dot-key paid-dot" />Paid</span></div>{points.length ? <><svg className="plot" viewBox="0 0 760 300" role="img" aria-label={`Price versus documented feature count for ${points.length} endpoints. Exact values follow in the data table.`}><title>Price versus documented feature coverage</title><text className="plot-zone" x="82" y="28">lower price + more documented features</text><text className="plot-zone" x="722" y="232" textAnchor="end">higher price + fewer documented features</text>{[0, 1, 2, 3, 4].map(value => <g key={value}><line className="grid-line" x1="65" x2="735" y1={245 - value * 50} y2={245 - value * 50} /><text x="48" y={250 - value * 50} textAnchor="end">{value}</text></g>)}{[0, 0.25, 0.5, 0.75, 1].map(ratio => <text key={ratio} x={65 + ratio * 660} y="268" textAnchor="middle">${(maximum * ratio).toFixed(2)}</text>)}{points.map(point => <circle key={point.row.id} cx={65 + point.x / maximum * 660} cy={245 - point.y * 50} r="6" className={point.row.free === true ? "free-point" : "paid-point"}><title>{point.row.providerModelId}: ${point.x}, {point.y}/4 documented features</title></circle>)}<text x="400" y="294" textAnchor="middle">USD for 1M input + 1M output tokens</text><text transform="translate(16 150) rotate(-90)" textAnchor="middle">Features documented (0–4)</text></svg><div className="plain-note"><strong>Read it like this:</strong><span>A dot near the upper-left is cheaper and has more tracked features documented. That still does not mean it is the better or smarter model.</span></div><details><summary>Show exact endpoint values ({points.length})</summary><Table caption="Price and documented feature data" headers={["Endpoint", "USD input + output", "Features documented", "Unknown features"]}>{points.map(point => <tr key={point.row.id}><th scope="row">{point.row.providerModelId || point.row.id}</th><td>{number(point.x)}</td><td>{point.y} / 4</td><td>{FEATURES.filter(([key]) => feature(point.row, key) == null).length}</td></tr>)}</Table></details></> : <Empty>No fresh comparable price records. No price or capability points have been invented.</Empty>}</section>;
}
function HistoryChart({ history }) {
  const providers = [...new Set(list(history.snapshots).map(row => row.provider).filter(Boolean))].sort();
  const [provider, setProvider] = useState("");
  const selected = providers.includes(provider) ? provider : providers[0] || "";
  const rows = list(history.snapshots).filter(row => row.provider === selected && day(row.date) && numeric(row.free)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const maximum = Math.max(1, ...rows.map(row => row.free));
  const first = rows.length ? Date.parse(rows[0].date) : 0;
  const last = rows.length ? Date.parse(rows[rows.length - 1].date) : 0;
  const x = row => last === first ? 380 : 70 + (Date.parse(row.date) - first) / (last - first) * 640;
  const y = row => 225 - row.free / maximum * 175;
  return <section className="chart-panel wide"><span className="eyebrow">Trend</span><h2>How has free availability changed?</h2><label className="history-provider">Provider<select value={selected} onChange={event => setProvider(event.target.value)}>{providers.length ? providers.map(value => <option key={value} value={value}>{human(value)}</option>) : <option value="">No provider snapshots</option>}</select></label><p>Each point is what ModelMonitor observed at that update. We do not fill in dates we never checked.</p>{rows.length ? <><svg className="plot" viewBox="0 0 760 280" role="img" aria-label={`${human(selected)} free endpoint history: ${rows.length} snapshots. Exact observations are listed below.`}><title>{`Observed ${human(selected)} free endpoints`}</title>{[0, 0.5, 1].map(ratio => <g key={ratio}><line className="grid-line" x1="70" x2="710" y1={225 - ratio * 175} y2={225 - ratio * 175} /><text x="55" y={230 - ratio * 175} textAnchor="end">{number(maximum * ratio)}</text></g>)}{rows.map((row, index) => <circle className="free-point" key={index} cx={x(row)} cy={y(row)} r="7"><title>{`${date(row.date)}: ${row.free} free${row.baseline ? " (baseline)" : ""}`}</title></circle>)}<text x={last === first ? 380 : 70} y="256" textAnchor="middle">{date(rows[0].date)}</text>{last !== first && <text x="710" y="256" textAnchor="end">{date(rows[rows.length - 1].date)}</text>}</svg><div className="plain-note"><strong>What this means:</strong><span>Higher points mean more free endpoints were observed for this provider on that date. Gaps are simply dates ModelMonitor did not observe.</span></div><details><summary>Show exact observations ({rows.length})</summary><Table caption={`${human(selected)} historical observations`} headers={["Observation date", "Basis", "Free", "Paid", "Unknown", "Available"]}>{rows.map((row, index) => <tr key={index}><th scope="row">{date(row.date)}</th><td>{row.baseline ? "Initial baseline" : "Observation"}</td><td>{number(row.free)}</td><td>{number(row.paid)}</td><td>{number(row.unknown)}</td><td>{number(row.available)}</td></tr>)}</Table></details></> : <Empty>No historical snapshots loaded. No preceding history is assumed.</Empty>}</section>;
}
function Methodology({ metadata, state, retry }) {
  const sources = list(metadata.sources);
  const healthy = sources.filter(source => source.status === "ok").length;
  return <section className="section" id="methodology"><span className="eyebrow">Data quality</span><h2>Can I trust these numbers?</h2><div className="health-strip"><div><strong>{healthy} / {sources.length || 0}</strong><span>sources healthy</span></div><div><strong>{date(metadata.generatedAt)}</strong><span>dataset build date</span></div></div><p>ModelMonitor only treats a current price or free claim as current when its supporting source is healthy and recent. Missing evidence stays unknown.</p><details className="methodology-details"><summary>Show technical methodology and source status</summary><ul className="prose-list"><li>Canonical identities follow explicit links only. Familiar aliases and compatible APIs do not establish a maker; duplicates may remain.</li><li>Sources are field-specific: official availability does not make secondary capability metadata official. Unknown means missing evidence, not false.</li><li>Free results require available status, free=true, zero input and output prices, fresh price evidence and healthy contributing sources within 48 hours.</li><li>Feature counts, context size and downloads are not intelligence measurements.</li>{list(metadata.limitations).map((text, index) => <li key={index}>{text}</li>)}</ul>{sources.length ? <Table caption="Source status and evidence timestamps" headers={["Source", "Status", "Last checked", "Last successful", "Records"]}>{sources.map((source, index) => <tr key={source.id || index}><th scope="row"><SourceLink url={source.url}>{source.name || source.id}</SourceLink>{source.error && <small>{source.error}</small>}</th><td><Tag warning={source.status !== "ok"}>{human(source.status)}</Tag></td><td>{date(source.lastChecked)}</td><td>{date(source.lastSuccess)}</td><td>{number(source.count)}</td></tr>)}</Table> : <Empty>No source-health metadata loaded. Current availability cannot be established.</Empty>}<details className="section"><summary>Published datasets and reload controls</summary><ul className="dataset-list">{DATASETS.map(key => <li key={key}><a href={`./public/data/${key}.json`}>{key}.json</a><span>{state[key].status}</span><button className="secondary" onClick={() => retry(key)} disabled={state[key].status === "loading"}>Reload {key}</button></li>)}</ul></details></details></section>;
}
function LimitCards({ limits }) {
  if (!limits.length) return <Empty>No documented usage limits loaded.</Empty>;
  return <div className="limit-grid">{limits.map((record, index) => <article className="limit-card" key={record.id || index}><div className="limit-card-top"><span className="eyebrow">{human(record.provider)}</span><Tag warning={record.confidence === "unverified"}>{human(record.confidence)}</Tag></div><h3>{record.product || "Product unknown"}</h3><dl><dt>Plan</dt><dd>{record.plan || "Unknown"}</dd><dt>Window</dt><dd>{human(record.window)}</dd><dt>Reset</dt><dd>{record.reset?.description || human(record.reset?.type)}</dd></dl><SourceLink url={record.sourceUrl}>Check provider source</SourceLink><small>Last checked {date(record.lastChecked)}</small></article>)}</div>;
}
function AnalysisPage({ models, availability, metadata, history, limits, signals, audit, state, retry, now }) {
  const free = availability.filter(row => currentFree(row, metadata, now));
  const paid = availability.filter(row => row.free === false && currentPriced(row, metadata, now) && (row.pricing.input > 0 || row.pricing.output > 0));
  const open = models.filter(isOpen);
  const contextRows = [...models.filter(model => numeric(model.context)).map(model => [model.name || model.id, model.context]), ...availability.filter(row => numeric(row.context)).map(row => [`${row.provider}/${row.providerModelId} (endpoint)`, row.context])].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return <><PageHeading title="Analysis" description="A visual summary of the model data ModelMonitor can actually verify. Use it to compare availability, features, price, popularity and context — not to decide which model is smartest." /><AnalysisSnapshot {...{ free, paid, open, models }} /><AnalysisGuide /><div className="chart-grid"><FeatureChart free={free} paid={paid} /><Scatter rows={[...free, ...paid]} /><Bars eyebrow="Popularity" title="Most downloaded open models" description="Download counts from tracked open-model records. A bigger bar means more recorded downloads, not better quality." rows={open.filter(model => numeric(model.downloads)).sort((a, b) => b.downloads - a.downloads).slice(0, 10).map(model => [model.name || model.id, model.downloads])} /><Bars eyebrow="Dataset mix" title="Who appears most in the catalog?" description="How many tracked model records are attributed to each provider. This is dataset coverage, not market share." rows={countBy(models, model => human(model.provider))} /><Bars eyebrow="Capacity" title="Biggest documented context windows" description="The largest token limits ModelMonitor has recorded. More context means more information can fit at once; it does not automatically mean a smarter model." rows={contextRows} format={value => `${number(value)} tokens`} /><Bars eyebrow="Licensing" title="How are tracked models licensed?" description="Counts grouped by the license information ModelMonitor has. Unknown means the source did not establish the license." rows={countBy(models, model => openness(model))} /><HistoryChart history={history} /></div><section className="section"><span className="eyebrow">Usage rules</span><h2>Free does not always mean unlimited</h2><p>Some providers have spending, request or time-window limits even when token pricing is zero. These cards only show conditions we have a source for.</p><LimitCards limits={limits} /></section><section className="section"><span className="eyebrow">Unverified</span><h2>Things worth checking, but not confirmed</h2><p>These are leads only. They are kept separate so they do not quietly turn into facts.</p>{signals.length ? <details><summary>Show {signals.length} unverified signal{signals.length === 1 ? "" : "s"}</summary>{signals.map((record, index) => <article className="record-panel" key={record.id || index}><Tag warning>Unverified signal</Tag><RecordFields record={record} /></article>)}</details> : <Empty>No unverified signals in the loaded dataset.</Empty>}</section><section className="section"><span className="eyebrow">Archive</span><h2>Old records kept for traceability</h2><p>{audit.length} legacy records are retained so you can see what the old tracker reported. They are not automatically treated as verified launches or benchmarks.</p><details><summary>Inspect legacy records ({audit.length})</summary>{audit.length ? <Table caption="Legacy archive provenance and dispositions" headers={["Entity", "Disposition", "Report date", "Reason / source"]}>{audit.map((record, index) => <tr key={record.id || index}><th scope="row">{record.id}</th><td>{human(record.disposition)}</td><td>{date(record.legacyReportDate)}</td><td>{record.reason}<small><SourceLink url={record.archiveUrl}>Original archive</SourceLink></small>{record.originalLink && <small><SourceLink url={record.originalLink}>Original reported link (unverified)</SourceLink></small>}</td></tr>)}</Table> : <Empty>No audit records loaded.</Empty>}</details></section><Methodology metadata={metadata} state={state} retry={retry} /></>;
}
const SUMMARY_LABELS = { newModels: "New canonical models", newNotableReleases: "New notable releases", becameFree: "Became free", noLongerFree: "No longer free", priceChanges: "Price changes", availabilityAdded: "Availability added", availabilityRemoved: "Availability removed", newOpenModels: "New open models", deprecations: "Deprecations / retirements", historicalChanges: "History additions / corrections / removals", modelUpdates: "Model updates", modelRemovals: "Model removals", availabilityUpdates: "Availability updates" };
const SNAPSHOT_LABELS = { trackedModels: "Tracked entities", canonicalModels: "Canonical models", availableEndpoints: "Current available endpoints", freeEndpoints: "Current free endpoints", paidEndpoints: "Current paid endpoints", openModels: "Documented open models", openSource: "Permissive weight licenses", openWeights: "Restricted open weights", proprietary: "Documented proprietary models", providers: "Attributed providers", notableReleasesThisYear: "Notable releases this UTC year", notableReleasesThisMonth: "Notable releases this UTC month" };
function liveSnapshot(models, availability, metadata, events, milestones, modelMap, now) {
  const identities = models.filter(canonicalRecord);
  const releases = combinedReleases(events, milestones, modelMap, now);
  const today = new Date(now).toISOString();
  const unknownOpenness = identities.filter(row => !["open_source", "open_weights", "proprietary"].includes(row.openness) || (["open_source", "open_weights"].includes(row.openness) && !isOpen(row))).length;
  return {
    trackedModels: models.length, canonicalModels: identities.length,
    availableEndpoints: availability.filter(row => currentEvidence(row, metadata, now)).length,
    freeEndpoints: availability.filter(row => currentFree(row, metadata, now)).length,
    paidEndpoints: availability.filter(row => row.free === false && currentPriced(row, metadata, now) && (row.pricing.input > 0 || row.pricing.output > 0)).length,
    openModels: identities.filter(isOpen).length,
    openSource: identities.filter(row => isOpen(row) && row.openness === "open_source").length,
    openWeights: identities.filter(row => isOpen(row) && row.openness === "open_weights").length,
    proprietary: identities.filter(row => row.openness === "proprietary").length,
    unknownOpenness,
    providers: new Set(identities.map(row => row.provider).filter(value => value && value !== "Unknown")).size,
    notableReleasesThisYear: releases.filter(row => row.date.slice(0, 4) === today.slice(0, 4)).length,
    notableReleasesThisMonth: releases.filter(row => row.date.slice(0, 7) === today.slice(0, 7)).length,
  };
}
function snapshotCard(key, snapshot) {
  const unknown = snapshot.unknownOpenness || 0;
  const uncertainZero = ["openWeights", "proprietary"].includes(key) && snapshot[key] === 0 && unknown > 0;
  const notes = {
    trackedModels: "All loaded entity records",
    canonicalModels: "Aliases and legacy reports excluded",
    availableEndpoints: "Fresh, healthy availability evidence",
    freeEndpoints: "Fresh $0 token-price evidence",
    paidEndpoints: "Fresh non-zero token-price evidence",
    openModels: unknown ? `${unknown} canonical models still lack an openness classification` : "All canonical models classified",
    openSource: unknown ? `${unknown} canonical models still unclassified` : "Permissive weight-license evidence",
    openWeights: uncertainZero ? `${unknown} canonical models are still unclassified` : "Restricted weight-license evidence",
    proprietary: uncertainZero ? `${unknown} canonical models are still unclassified` : "Explicit proprietary classification",
    providers: "Known provider attribution",
    notableReleasesThisYear: "Curated LLM History + live release events",
    notableReleasesThisMonth: "Curated LLM History + live release events",
  };
  return { value: uncertainZero ? "—" : number(snapshot[key]), note: notes[key] || "Loaded evidence" };
}
function Overview({ models, events, availability, metadata, milestones, now, state, modelMap, onSelect, report: loadedReport, onMarkSeen, cutoff }) {
  const report = loadedReport?.schemaVersion === 2 ? loadedReport : null;
  const snapshot = liveSnapshot(models, availability, metadata, events, milestones, modelMap, now);
  const releases = combinedReleases(events, milestones, modelMap, now);
  const ready = key => (key.includes("Endpoints") ? ["availability", "metadata"] : key.startsWith("notableReleases") ? ["timeline", "models", "milestones"] : ["models"]).every(dataset => state[dataset].status === "ready");
  const movement = [...list(report?.pricingChanges).filter(row => ["became_free", "no_longer_free"].includes(row.type)), ...list(report?.openModelChanges)];
  const common = { modelMap, onSelect };
  return <><header className="overview-heading"><div><h1>ModelMonitor Intelligence Brief</h1><p>Dataset build: {date(metadata.generatedAt)}. Report generated: {date(report?.generatedAt)}.</p><p>A quick read of what changed, what is available now, and what still needs verification.</p></div></header>
    {!report && <p className="notice">{loadedReport ? "The saved report is from an older format. Current catalogs and history still work, but change summaries need to be regenerated." : "No update report is available yet. The catalogs and LLM History can still be used normally."}</p>}
    <SinceLastVisit {...common} report={report} cutoff={cutoff} now={now} onMarkSeen={onMarkSeen} />
    <section className="section"><h2>Since the previous update</h2>{report ? <><p className="muted">{report.baseline ? "Baseline report: this is the starting snapshot, so existing catalog entries are not counted as new releases." : `Report interval: ${report.periodStart || "Unknown"} to ${report.periodEnd || "Unknown"}. These counts compare scheduled updates; the section above is specific to your last visit.`}</p><ul className="since-list">{Object.entries(SUMMARY_LABELS).map(([key, label]) => <li key={key}><strong>{number(report.summary[key])}</strong> {label}</li>)}</ul><details><summary>Model changes ({list(report.modelChanges).length})</summary><ChangeList changes={list(report.modelChanges)} {...common} /></details></> : <Empty>Update counts require a schema v2 report. Missing counts are not zero.</Empty>}</section>
    {list(report?.highlights).length > 0 && <section className="section"><h2>Key changes</h2><ul className="prose-list">{report.highlights.map((item, index) => <li key={item.id || index}><Tag warning={!["fact", "derived"].includes(item.level)}>{["fact", "derived"].includes(item.level) ? human(item.level) : "Unverified"}</Tag> {item.text}{item.url && <> <SourceLink url={item.url}>Evidence</SourceLink></>}</li>)}</ul></section>}
    <section className="section"><h2>Current ecosystem snapshot</h2><p className="muted"><Tag>Derived</Tag> Recalculated from the records loaded in this browser. An endpoint counts as current only when its source evidence is healthy and recent.</p>{snapshot.unknownOpenness > 0 && <p className="notice"><strong>License classification is incomplete.</strong> {number(snapshot.unknownOpenness)} of {number(snapshot.canonicalModels)} canonical models do not yet have enough evidence to classify them as permissive open, restricted open-weight, or proprietary. A dash means “not established,” not zero.</p>}<div className="stats">{Object.entries(SNAPSHOT_LABELS).map(([key, label]) => { const card = snapshotCard(key, snapshot); return <a href={key.includes("Endpoints") ? "#free" : /open|Source|Weights|proprietary/i.test(key) ? "#open" : key.startsWith("notableReleases") ? "#history" : "#releases"} key={key}><span className="stat-value">{ready(key) ? card.value : "Unknown"}</span><strong>{label}</strong><small>{ready(key) ? card.note : "Required dataset not loaded"}</small></a>; })}</div>{report && <details><summary>Published report snapshot (historical, not live)</summary><p>As of {report.periodEnd || report.generatedAt}. These saved counts may no longer satisfy freshness checks.</p><RecordFields record={report.snapshot} /><RecordFields record={report.health} /></details>}<p className="footnote"><a href="#analysis">Inspect source health and methodology</a>. Unknown pricing is neither free nor paid.</p></section>
    <section className="section"><div className="section-toolbar"><h2>Important releases</h2><a href="#history">Explore LLM History</a></div><p className="muted">Recent source-backed releases from the curated history and live timeline. The same release is counted once when both datasets contain it.</p>{releases.length ? <div className="release-highlights">{releases.slice(0, 8).map(row => <article className="release-highlight" key={`${row.id || releaseKey(row)}:${row.date}`}><div><time dateTime={day(row.date)}>{date(row.date)}</time><Tag>{EVENT_LABELS[row.type || row.eventType] || human(row.type || row.eventType)}</Tag></div><h3>{row.title}</h3><p className="muted">{row.provider || row.organization || "Unknown organization"}</p>{row.description && <p>{row.description}</p>}<details><summary>Source</summary><Sources sources={list(row.sources).length ? row.sources : milestoneSources(row)} /></details></article>)}</div> : <Empty>No sourced notable releases are loaded. This is a coverage gap, not evidence that no releases occurred.</Empty>}</section>
    <section className="section"><h2>Free and open-model changes</h2><p className="muted">Changes to free access, licenses, and openness recorded during the report interval.</p><ChangeList changes={movement} {...common} /></section>
    <section className="section"><h2>Pricing and availability</h2><p className="muted">Price changes and endpoints that appeared, disappeared, or changed during the report interval.</p><ChangeList changes={[...list(report?.pricingChanges).filter(row => row.type === "price_change"), ...list(report?.availabilityChanges)]} {...common} /></section>
    <section className="section"><div className="section-toolbar"><h2>History updates</h2><a href="#history">Sourced milestones</a></div><p className="muted">History edits are counted when ModelMonitor records them. Adding a 2019 event today does not make it a new 2026 release.</p><ChangeList changes={list(report?.historicalChanges)} {...common} /></section>
    {report && <details className="section"><summary>Complete observed change log ({list(report.changeLog).length})</summary><ChangeList changes={list(report.changeLog).slice().sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))} {...common} /></details>}
    {list(report?.watchlist).length > 0 && <section className="section"><h2>What to watch</h2><p className="muted">Things worth checking because the evidence is incomplete, stale, preview-only, or recently changed. This is not a prediction list.</p><ul className="prose-list">{report.watchlist.map((item, index) => <li key={index}><Tag warning={item.kind === "unverified_signal"}>{item.kind === "unverified_signal" ? "Unverified" : "Derived"}</Tag> {item.text}</li>)}</ul></section>}
    <div className="overview-notes"><section><h2>Release date, first seen, and repository date are different.</h2><p>ModelMonitor keeps those dates separate so an API appearance or repository creation is not silently rewritten as a launch. <a href="#timeline">All Observations</a> keeps the raw trail.</p></section><section><h2>Want the bigger picture?</h2><p><a href="#history">LLM History</a> follows the important milestones from embeddings and Transformers to current reasoning and agentic models. New terminology is explained in the <a href="#glossary">Glossary</a>.</p></section></div>
  </>;
}
function ModelDialog({ model, modelMap, availability, events, limits, audit, metadata, now, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  const identity = canonical(model, modelMap) || model;
  const relatedIds = new Set([model.id, identity.id, ...[...modelMap.values()].filter(item => canonical(item, modelMap)?.id === identity.id).map(item => item.id)]);
  const endpoints = availability.filter(row => relatedIds.has(row.modelId));
  const related = events.filter(event => relatedIds.has(event.modelId) || relatedIds.has(event.before?.modelId) || relatedIds.has(event.after?.modelId)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return <dialog ref={ref} aria-labelledby="model-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}><div className="dialog-header"><div><p className="muted">Entity details & evidence</p><h2 id="model-dialog-title">{identity.name || identity.id}</h2></div><button className="secondary" onClick={onClose} autoFocus>Close</button></div><div className="dialog-content"><div className="tags"><Tag>{human(identity.type)}</Tag><Tag warning={identity.confidence === "unverified"}>{human(identity.confidence)}</Tag><Tag>{openness(identity)}</Tag></div><section><h3>Canonical identity</h3><dl className="record-fields"><dt>Canonical ID</dt><dd className="mono">{identity.canonicalId || identity.id}</dd><dt>Selected / original alias</dt><dd>{model.name || model.id} <span className="mono">({model.id})</span></dd><dt>Provider attribution</dt><dd>{human(identity.provider)}</dd><dt>Identity status</dt><dd>{human(identity.identity)}. Names and API compatibility do not establish a maker.</dd><dt>Aliases</dt><dd>{list(identity.aliases).join(", ") || "None documented"}</dd><dt>Hugging Face ID</dt><dd>{identity.hfId || "Unknown"}</dd></dl>{identity.canonicalId && !modelMap.has(identity.canonicalId) && <p className="notice warning">The linked canonical record is not loaded. Identity details are incomplete.</p>}</section><section><h3>Dates, not interchangeable</h3><DateFacts model={identity} /><p className="footnote">Legacy report and repository creation dates are not launch dates. Baselines are first observations.</p><p>First observed: {date(identity.firstSeen)} · Last checked: {date(identity.lastChecked)}</p></section><section><h3>Documented specifications</h3><RecordFields record={{ license: identity.license ?? null, openness: openness(identity), contextTokens: identity.context ?? null, parameters: identity.parameters ?? null, activeParameters: identity.activeParameters ?? null, architecture: identity.architecture ?? null, quantization: identity.quantization ?? null, reasoning: identity.reasoning ?? null, tools: identity.tools ?? null, structuredOutput: identity.structuredOutput ?? null, modalities: list(identity.modalities), downloads: identity.downloads ?? null, likes: identity.likes ?? null }} /></section>{Object.keys(identity).some(key => /family|lineage|baseModel|derivative|variant|relation/i.test(key)) && <section><h3>Family & lineage</h3><p className="muted">Recorded relationships only; names do not establish a model family or foundation release.</p><RecordFields record={Object.fromEntries(Object.entries(identity).filter(([key]) => /family|lineage|baseModel|derivative|variant|relation/i.test(key)))} /></section>}<section><h3>Sources & field confidence</h3><p className="muted">Confidence belongs to the cited claim. Official availability is not official capability or maker evidence. Missing fields are unknown.</p><Sources sources={identity.sources} />{identity.fieldConfidence && <RecordFields record={identity.fieldConfidence} />}{identity.fieldSources && <RecordFields record={identity.fieldSources} />}{model.id !== identity.id && <><h4>Original alias provenance</h4><Sources sources={model.sources} /></>}</section><section><h3>Hosted availability, prices & conditions</h3>{endpoints.length ? endpoints.map(row => <article className="record-panel" key={row.id}><h4>{row.provider} / {row.providerModelId}</h4><Tag warning={!currentEvidence(row, metadata, now)}>{currentFree(row, metadata, now) ? "Current free token pricing" : currentEvidence(row, metadata, now) ? "Fresh availability evidence" : "Not established as current"}</Tag><RecordFields record={row} /></article>) : <p>No linked provider availability loaded. This does not establish unavailability.</p>}</section><section><h3>Usage limits</h3>{limits.filter(limit => endpoints.some(row => row.provider === limit.provider) && (!limit.modelId || relatedIds.has(limit.modelId))).map((limit, index) => <RecordFields key={index} record={limit} />)}<p className="footnote">Provider-wide limits may not describe this model or every plan. Undocumented quotas, tiers and reset conditions remain unknown; consult the cited terms.</p></section><section><h3>Related timeline</h3>{related.length ? <ul className="related-events">{related.map(event => <li key={event.id}><strong>{date(event.date)} · {EVENT_LABELS[event.type] || human(event.type)}</strong><p>{event.title}</p>{event.previousAlias && <p>Original alias: {event.previousAlias}</p>}<Sources sources={event.sources} /></li>)}</ul> : <p>No related timeline events loaded.</p>}</section>{audit.some(row => relatedIds.has(row.id)) && <section><h3>Archive audit</h3>{audit.filter(row => relatedIds.has(row.id)).map(row => <RecordFields key={row.id} record={row} />)}</section>}</div></dialog>;
}
function App() {
  const [state, retry] = useDatasets();
  const [hash, setHash] = useState(() => window.location.hash);
  const [cutoff, setCutoff] = useState(readLastVisit);
  const [mountedAt] = useState(() => new Date().toISOString());
  useEffect(() => { saveLastVisit(mountedAt); }, [mountedAt]);
  const { view, term } = hashRoute(hash, list(state.glossary.data.terms));
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const mainRef = useRef(null);
  const models = state.models.data;
  const events = state.timeline.data;
  const availability = state.availability.data;
  const metadata = state.metadata.data;
  const modelMap = useMemo(() => new Map(models.map(model => [model.id, model])), [models]);
  useEffect(() => {
    const handler = () => { const next = window.location.hash; if (next === "#main-content") { mainRef.current?.focus(); return; } setHash(next); setSelected(null); setMenuOpen(false); if (NAV.some(([id]) => next === `#${id}`) || next === "#timeline") requestAnimationFrame(() => { mainRef.current?.focus(); window.scrollTo(0, 0); }); };
    window.addEventListener("hashchange", handler);
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => { window.removeEventListener("hashchange", handler); clearInterval(timer); };
  }, []);
  useEffect(() => { document.title = `${NAV.find(([id]) => id === view)?.[1] || "Overview"} — ModelMonitor`; }, [view]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = event => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);
const common = { models, events, availability, metadata, now, modelMap, onSelect: setSelected };
const markAllSeen = () => { const value = new Date().toISOString(); setCutoff(value); setNow(Date.parse(value)); saveLastVisit(value); };
const close = useCallback(() => setSelected(null), []);
const failures = list(metadata.sources).filter(source => source.status !== "ok");
  return <><a className="skip-link" href="#main-content">Skip to content</a><header className={`masthead${menuOpen ? " menu-open" : ""}`}><div className="masthead-bar"><a className="brand" href="#overview" aria-label="ModelMonitor overview"><svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M0 2h32v4H0zm0 6h32v4H0zm4 6h24v4H4zm0 6h24v4H4zm-4 6h32v4H0z" /></svg>ModelMonitor</a><button className="menu-toggle" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(open => !open)}><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></button></div><nav id="main-navigation" aria-label="Main navigation">{NAV.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)} aria-current={view === id || (id === "history" && view === "timeline") ? "page" : undefined}>{label}</a>)}</nav></header><main id="main-content" ref={mainRef} tabIndex={-1}><LoadStatus state={state} retry={retry} />{["history", "timeline"].includes(view) && <nav className="subnav" aria-label="History navigation"><a href="#history" aria-current={view === "history" ? "page" : undefined}>Milestones</a><a href="#timeline" aria-current={view === "timeline" ? "page" : undefined}>All Observations</a></nav>}{failures.length > 0 && <p className="notice warning">{failures.length} upstream sources report a failure or degraded status. Retained records may be stale; affected endpoints are not counted as current. <a href="#analysis">Inspect source health</a>.</p>}{view === "overview" && <Overview {...common} milestones={state.milestones.data} state={state} report={state.report.data} onMarkSeen={markAllSeen} cutoff={cutoff} />}{view === "history" && <HistoryPage dataset={state.milestones.data} />}{view === "timeline" && <TimelinePage {...common} />}{view === "releases" && <CatalogPage key="releases" mode="releases" {...common} />}{view === "free" && <FreePage {...common} limits={state.limits.data} />}{view === "open" && <CatalogPage key="open" mode="open" {...common} />}{view === "analysis" && <AnalysisPage {...common} history={state.history.data} limits={state.limits.data} signals={state.signals.data} audit={state.audit.data} state={state} retry={retry} />}{view === "glossary" && <GlossaryPage glossary={state.glossary.data} target={term} />}</main><footer><strong>ModelMonitor</strong><span>Evidence before attribution. Unknown stays unknown.</span><a href="./public/data/metadata.json">Source metadata</a></footer>{selected && <ModelDialog model={selected} {...common} limits={state.limits.data} audit={state.audit.data} onClose={close} />}</>;
}

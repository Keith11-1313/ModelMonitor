# ModelMonitor

An AI model release, availability and market-intelligence dashboard. The original React/CDN, static-hosting architecture and white Carbon-inspired interface remain intact. Browsing is continuous, not tied to a month or week.

## Run locally

Node.js 20+ is required for collectors and checks. Serve the **repository root**, not just `public/`:

```sh
npm ci
python -m http.server 8000 --bind 127.0.0.1
```

Visit `http://localhost:8000`. Do not use `file://`. The frontend needs network access to the existing React/Babel and font CDNs. No bundler, database, account credentials or backend service is required.

```sh
npm run fetch
npm test
npm run lint
npm run validate
```

`fetch` updates generated JSON locally and never runs Git commands. `lint` checks script syntax and parses JSX; this JavaScript project does not have a separate static type checker. `validate` checks data schemas, provenance, references, history consistency and the legacy archive checksum.

## Architecture

```text
public/models.json (preserved legacy archive)
public APIs + data/curation.json
                 |
scripts/collectors.js + scripts/pipeline.js
                 |
scripts/timeline.js (deterministic historical normalization)
                 |
public/data/*.json
                 |
index.html + index.jsx + styles.css
```

| File | Purpose |
| --- | --- |
| `public/models.json` | Original archive, preserved without deleting reports or rewriting claims |
| `public/data/models.json` | Canonical, provider-scoped entities and field evidence |
| `public/data/timeline.json` | Persisted chronological events referencing entity IDs |
| `public/data/availability.json` | Current/removed endpoints, prices and capabilities |
| `public/data/history.json` | Initial membership baseline, compact deltas and daily counts |
| `public/data/metadata.json` | Build date, per-source health and limitations |
| `public/data/audit.json` | Legacy dispositions and reasons; links to original reports |
| `public/data/limits.json` | Source-backed public usage-limit records |
| `public/data/signals.json` | Separate community evidence; initially empty |
| `public/data/cache.json` | Collector-only normalized fallback metadata, not a UI dataset |
| `data/curation.json` | Tracked HF organizations, identity assertions, exact links, reveals and limits |

Generated files should normally be refreshed with the collector, not edited individually. The frontend loads datasets independently; a failed fetch has an explicit empty state and retry control rather than invented fallback models.

## Timeline and identity

Timeline groups are derived from event dates and span all retained history. Search, provider, event-type and date filters work across months and years. Notable events are the default; all observations include derivatives and product announcements.

Dates are deliberately separate:

- `releaseDate`: only an explicitly documented model launch date. Currently unknown for collected entities.
- `legacyReportDate`: an **unverified** date from the original archive. These appear as `legacy_report`, not verified releases.
- `repositoryCreatedAt`: HF repository creation, not launch. The timeline labels these `repository_created`.
- `firstSeen`: first local catalog observation. Initial membership is a baseline, not a batch of new releases.

The initial timeline is built from existing local records, with no exhaustive historical research. Unsupported legacy benchmark summaries and license guesses are not promoted into the normalized catalog. Conservative model-title candidates stay unverified; customer stories and other articles are separated as product announcements. Classification can still require review.

Quantizations, fine-tunes and optimizations are not treated as foundation models. HF non-derivative repositories need at least 50 likes for the notable timeline; that is an editorial discovery threshold, not a quality score.

Stable IDs use `legacy:`, `hf:` and `opencode:` namespaces. Exact IDs and explicitly sourced aliases are matched; no loose fuzzy matching merges models. Duplicate underlying models across sources are possible and preferable to incorrect identity merges.

Union Alpha and Big Pickle retain unknown underlying identities. Their `stealth_model` events mark first **local** observation only. No ox-alpha reveal has been added without supporting evidence. `model_reveal` support preserves the original entity, prior events and aliases, redirects availability to the confirmed entity and adds a separate reveal event.

For a future reveal, add a `reveals` record with `id`, `fromId`, `toId`, documented `date`, `sourceUrl` and a verbatim `evidence` quotation. Both entities must already exist, and the target must have known identity. The collector checks the quotation against the public source; this is a drift guard, not a substitute for editorial verification of identity and date. Exact cross-source links use `alias`, `modelId`, `sourceUrl`, `evidence`. Identity assertions and limits follow the existing examples in `data/curation.json`.

## Sources and confidence

- **Official:** direct provider endpoint/documentation or official organization model metadata.
- **Confirmed:** manually reviewed, source-backed identity evidence.
- **Observed:** secondary catalog metadata or reproducible observations, not provider attribution.
- **Unverified:** archived unsupported claims or community reports. Repetition never upgrades confidence.

Sources:

1. `https://opencode.ai/zen/v1/models`: authoritative Zen endpoint membership.
2. `https://opencode.ai/docs/zen/`: public token pricing, tier conditions and curated stealth/limit evidence.
3. `https://models.dev/api.json`: secondary **opencode-provider-only** capability/price metadata joined by exact ID.
4. Hugging Face API: selected official organizations, five recent repositories each plus previously observed repositories. Full per-repository metadata supplies license, popularity and available specifications.

The OpenCode provider list is collected, not hardcoded. This is **Zen coverage**, not every provider that can be configured in the OpenCode client. Protocol/SDK compatibility never establishes a stealth model's maker. Familiar but unattributed endpoint names remain provider `Unknown`.

Official membership does not make secondary pricing/capabilities official. Detail panels show field-specific source labels and dates. Source requests have timeouts, preserve previous good records on failure and continue independently. Empty/malformed catalogs and contractions greater than 25% are rejected for review rather than mass-removing models. Real bulk removals can consequently be delayed.

The documentation price parser is guarded but depends on published table structure. It uses official base input/output and cache rates plus available long-context tiers; temporary discounts, fees and account terms must still be checked at the source. RSS and Semantic Scholar title-search enrichment are no longer used.

## Free and open models

Free results require available status, zero input/output token prices, explicit free status, healthy contributing sources and evidence no older than 48 hours. Stale/failed-source claims move to a separate retained-claims section. Unknown pricing is neither free nor paid. Free token pricing does not promise unlimited requests or permanent availability.

Weight licensing is distinct from hosted access:

- `open_source`: recognized permissive weight license (MIT, Apache-2.0, etc.), displayed as **Permissive weight license**. This is not certification against the full Open Source AI Definition.
- `open_weights`: recognized restrictive weight license, displayed separately.
- Missing, custom or ambiguous licenses remain unknown. HF hosting alone proves neither classification.

No private sessions, browser cookies or personal usage accounts are accessed. Public limits currently cover Zen spending controls; ChatGPT, Claude and Antigravity limits need source-backed curation. Account-specific reset times must never become a universal countdown. Community signals remain a separate manually maintained dataset.

## Analysis methodology

There are no fabricated benchmarks or universal winners. Best free, paid, open and value rankings explicitly lack sufficient comparable evidence.

Seven comparisons use collected values:

1. Free versus paid endpoint feature-support counts, including unknowns.
2. Price versus feature coverage: count of reasoning, tools, multimodality and structured-output support (0–4), **not intelligence**. Price is USD for 1M input + 1M output tokens, not a workload-adjusted value score.
3. Open-model downloads: popularity only, not a capability leaderboard.
4. Observed OpenCode free availability over time, beginning at the local baseline.
5. Attributed provider distribution, not market share.
6. Largest documented context windows, not effective recall or quality.
7. Documented weight-license distribution, with unknown separate.

Each chart states scope and missing-data rules. Detail panels and Analysis expose source timestamps. Entity/endpoint aliases may appear separately in context comparisons. No proprietary benchmark dataset is redistributed.

## Automation and history

`.github/workflows/update-models.yml` runs at **00:17, 06:17, 12:17 and 18:17 UTC**, plus manual dispatch. It installs development dependencies, runs tests/syntax checks, collects, validates and publishes only changed `public/data/` files. Unchanged output exits successfully. Publishing requires repository write permission; overlapping jobs are serialized.

The workflow's future publishing step uses Git commits/pushes in Actions, as the original automation did. Local collector and test commands do not commit or push.

Observation timestamps have UTC **day precision** to reduce no-change churn. Same-day meaningful transitions have ordered deltas; unchanged scans update evidence at most daily. History can reconstruct observed membership using the initial baseline and upsert/removal deltas. It cannot answer pre-baseline availability questions or infer exact transition times between scans. Full model event history is retained; daily counts/deltas grow linearly, without duplicating the entire catalog per scan.

## Limitations

Coverage is intentionally incomplete. Verified release-date enrichment, benchmark winners, unknown makers, custom licenses, broader usage-limit records and community evidence remain manual review work. Timeline date bases must not be conflated. Name/type heuristics can misclassify articles or derivative variants; the original archive and audit trail are retained for correction. This is an evidence dashboard, not a complete census of AI releases.

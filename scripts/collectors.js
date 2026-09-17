import { boolean, number, strings, source, model, licenseOf, classify } from "./pipeline.js";

export const ZEN = "https://opencode.ai/zen/v1/models";
export const CATALOG = "https://models.dev/api.json";
export const DOCS = "https://opencode.ai/docs/zen/";
export const OPENROUTER = "https://openrouter.ai/api/v1/models";
export const GROQ = "https://api.groq.com/openai/v1/models";
export const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

export async function request(url, { fetcher = fetch, timeout = 20000, text = false, headers = {} } = {}) {
  const response = await fetcher(url, { headers: { "User-Agent": "ModelMonitor/2.0", ...headers }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const value = text ? await response.text() : await response.json();
  return { value, headers: response.headers };
}

export function guardRows(rows, previousCount = 0, minimum = 1) {
  if (!Array.isArray(rows) || rows.length < minimum) throw new Error("Empty or invalid source response");
  if (previousCount && rows.length < Math.ceil(previousCount * 0.75)) throw new Error(`Suspicious truncation: ${rows.length} rows, previously ${previousCount}`);
  const ids = rows.map((r) => r?.id);
  if (ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) throw new Error("Invalid or duplicate source IDs");
  return rows;
}

export async function collectZen(previousCount = 0, options = {}) {
  const { value } = await request(ZEN, options);
  if (value.object !== "list" || value.has_more === true || value.next) throw new Error("Incomplete Zen listing");
  return guardRows(value.data, previousCount, 10).map(({ id }) => ({ id }));
}

export async function collectCatalog(previousCount = 0, options = {}) {
  const { value } = await request(CATALOG, options);
  if (value.opencode?.id !== "opencode" || !value.opencode.models || Array.isArray(value.opencode.models)) throw new Error("Missing opencode catalog");
  const rows = guardRows(Object.values(value.opencode.models), previousCount, 10);
  return rows.map((r) => ({
    id: r.id, name: typeof r.name === "string" ? r.name : r.id,
    context: number(r.limit?.context), reasoning: boolean(r.reasoning), tools: boolean(r.tool_call), structuredOutput: boolean(r.structured_output),
    modalities: strings([...(r.modalities?.input ?? []), ...(r.modalities?.output ?? [])]),
    pricing: pricing(r.cost),
  }));
}

export function pricing(cost) {
  if (!cost || number(cost.input) === null || number(cost.output) === null) return null;
  return {
    input: cost.input, output: cost.output, cachedInput: number(cost.cache_read), cachedOutput: number(cost.cache_write),
    currency: "USD", unit: "1M tokens",
    ...(cost.context_over_200k ? { tiers: [{ contextAbove: 200000, ...pricing(cost.context_over_200k) }] } : {}),
  };
}



const perMillion = (value) => {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount * 1_000_000 : null;
};

export async function collectOpenRouter(previousCount = 0, options = {}) {
  const headers = options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {};
  const { value } = await request(OPENROUTER, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const rows = guardRows(value?.data, previousCount, 10);
  return rows.map((r) => {
    const input = perMillion(r.pricing?.prompt);
    const output = perMillion(r.pricing?.completion);
    const pricing = input !== null && output !== null ? {
      input, output, cachedInput: perMillion(r.pricing?.input_cache_read), cachedOutput: perMillion(r.pricing?.input_cache_write),
      currency: "USD", unit: "1M tokens",
    } : null;
    const parameters = Array.isArray(r.supported_parameters) ? r.supported_parameters : [];
    const modalities = strings([...(r.architecture?.input_modalities ?? []), ...(r.architecture?.output_modalities ?? [])]);
    return {
      id: r.id, name: typeof r.name === "string" ? r.name : r.id,
      context: number(r.context_length), pricing, modalities,
      reasoning: typeof r.reasoning === "object" || parameters.some((v) => /reasoning/i.test(v)) ? true : null,
      tools: parameters.includes("tools") || parameters.includes("tool_choice") ? true : null,
      structuredOutput: parameters.includes("structured_outputs") || parameters.includes("response_format") ? true : null,
      hfId: typeof r.hugging_face_id === "string" ? r.hugging_face_id : null,
    };
  });
}

export async function collectGroq(apiKey, previousCount = 0, options = {}) {
  if (!apiKey) return null;
  const { value } = await request(GROQ, { ...options, headers: { Authorization: `Bearer ${apiKey}`, ...(options.headers ?? {}) } });
  const rows = guardRows(value?.data, previousCount, 1);
  return rows.filter((r) => r.active !== false).map((r) => ({
    id: r.id, name: r.id, owner: typeof r.owned_by === "string" ? r.owned_by : null, context: number(r.context_window),
  }));
}

export async function collectGemini(apiKey, previousCount = 0, options = {}) {
  if (!apiKey) return null;
  const rows = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) params.set("pageToken", pageToken);
    const { value } = await request(`${GEMINI}?${params}`, { ...options, headers: { "x-goog-api-key": apiKey, ...(options.headers ?? {}) } });
    if (!Array.isArray(value?.models)) throw new Error("Invalid Gemini model listing");
    rows.push(...value.models);
    pageToken = value.nextPageToken || null;
  } while (pageToken);
  guardRows(rows.map((r) => ({ id: String(r.name || "").replace(/^models\//, "") })), previousCount, 1);
  return rows.map((r) => ({
    id: String(r.name).replace(/^models\//, ""), name: r.displayName || String(r.name).replace(/^models\//, ""),
    context: number(r.inputTokenLimit), outputLimit: number(r.outputTokenLimit),
    methods: strings(r.supportedGenerationMethods ?? r.supportedActions ?? []),
  }));
}

export const plain = (html) => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function parseDocs(html) {
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)].map((m) => m[0]);
  const rows = (table) => [...(table ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => plain(c[1])));
  const endpoint = rows(tables.find((t) => t.includes("Model ID"))).slice(1);
  const prices = rows(tables.find((t) => t.includes("Cached Read"))).slice(1);
  if (endpoint.length < 10 || prices.length < 10) throw new Error("Documentation tables missing or truncated");
  const names = new Map();
  for (const [name, id] of endpoint) {
    if (names.has(name) || !/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error("Ambiguous documentation model identity");
    names.set(name, id);
  }
  const amount = (s) => s === "Free" ? 0 : /^\$\d+(\.\d+)?$/.test(s) ? Number(s.slice(1)) : null;
  const mapped = new Map(endpoint.map(([name, id]) => [id, { id, name, pricing: null }]));
  for (const [label, input, output, cachedInput, cachedOutput] of prices) {
    const match = label.match(/^(.*?) \(([≤>]) ([\d.]+)K tokens\)$/);
    const name = match ? match[1] : label;
    const id = names.get(name);
    if (!id) continue;
    const row = mapped.get(id);
    const price = { input: amount(input), output: amount(output), cachedInput: amount(cachedInput), cachedOutput: amount(cachedOutput), currency: "USD", unit: "1M tokens" };
    if (price.input === null || price.output === null) throw new Error(`Invalid documented pricing: ${label}`);
    if (match?.[2] === ">") {
      if (!row.pricing) throw new Error(`Missing base price: ${label}`);
      row.pricing.tiers = [...(row.pricing.tiers ?? []), { contextAbove: Number(match[3]) * 1000, ...price }];
    } else row.pricing = price;
  }
  return { rows: [...mapped.values()], text: plain(html) };
}

export async function collectDocs(previousCount = 0, options = {}) {
  const { value } = await request(DOCS, { ...options, text: true });
  const result = parseDocs(value);
  guardRows(result.rows, previousCount, 10);
  return result;
}

export function normalizeHF(hf, organization, date) {
  if (hf.id?.split("/")[0] !== organization.org || hf.private || hf.disabled) throw new Error("HF detail identity or visibility mismatch");
  const row = model(`hf:${hf.id}`, hf.id.split("/")[1], organization.provider, date);
  const quantization = hf.config?.quantization_config?.quant_method;
  Object.assign(row, {
    aliases: [hf.id], type: classify(hf), ...licenseOf(hf), hfId: hf.id,
    identity: "known", confidence: "official", downloads: number(hf.downloads), likes: number(hf.likes),
    parameters: number(hf.safetensors?.total), architecture: typeof hf.config?.model_type === "string" ? hf.config.model_type : null,
    quantization: typeof quantization === "string" ? quantization : null,
    context: number(hf.config?.max_position_embeddings),
    sources: [source(`https://huggingface.co/${hf.id}`, "Official organization model card and Hub metadata", "official", date)],
    repositoryCreatedAt: typeof hf.createdAt === "string" ? hf.createdAt : null,
    dateBasis: "repository_creation_not_release",
  });
  const modalities = {
    "text-generation": ["text"], "image-text-to-text": ["image", "text"],
    "text-to-image": ["image", "text"], "image-to-image": ["image"],
    "automatic-speech-recognition": ["audio", "text"], "text-to-speech": ["audio", "text"],
    "text-to-video": ["text", "video"], "feature-extraction": [],
  };
  row.modalities = modalities[hf.pipeline_tag] ?? [];
  return row;
}

export async function collectHF(organization, limit, previousModels, date, options = {}) {
  const url = `https://huggingface.co/api/models?author=${encodeURIComponent(organization.org)}&sort=createdAt&direction=-1&limit=${limit}&full=true&config=true&cardData=true`;
  const { value } = await request(url, options);
  guardRows(value);
  if (value.some((r) => r.id.split("/")[0] !== organization.org)) throw new Error("HF organization listing mismatch");
  if (value.length < limit && previousModels.length >= limit) throw new Error("Suspicious truncated HF selection");
  const ids = strings([...value.map((r) => r.id), ...previousModels.map((r) => r.hfId)]);
  const models = [];
  const errors = [];
  for (let offset = 0; offset < ids.length; offset += 4) {
    await Promise.all(ids.slice(offset, offset + 4).map(async (id) => {
      try {
        const { value: detail } = await request(`https://huggingface.co/api/models/${id}`, options);
        if (detail.id !== id) throw new Error("HF detail ID mismatch");
        models.push(normalizeHF(detail, organization, date));
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }));
  }
  return { models, errors: errors.sort((a, b) => a.id.localeCompare(b.id)), selected: ids.length, url };
}

import test from "node:test";
import assert from "node:assert/strict";
import { collectOpenRouter } from "./collectors.js";

function openRouterRows() {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `provider/model-${index}`,
    name: `Model ${index}`,
    context_length: 32768,
    pricing: {
      prompt: "0.000001",
      completion: "0.000002",
      input_cache_read: null,
      input_cache_write: null,
    },
    supported_parameters: [],
    architecture: {
      input_modalities: ["text"],
      output_modalities: ["text"],
    },
    hugging_face_id: null,
  }));
}

test("OpenRouter blank Hugging Face IDs normalize to null", async () => {
  const rows = openRouterRows();
  rows[0].hugging_face_id = "";
  rows[1].hugging_face_id = "   ";
  rows[2].hugging_face_id = "  Qwen/Qwen3  ";

  const fetcher = async () => ({
    ok: true,
    headers: {},
    json: async () => ({ data: rows }),
  });

  const result = await collectOpenRouter(0, { fetcher });

  assert.equal(result[0].hfId, null);
  assert.equal(result[1].hfId, null);
  assert.equal(result[2].hfId, "Qwen/Qwen3");
});

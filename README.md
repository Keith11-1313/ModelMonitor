# ModelMonitor 🧠

> **April 2026 AI Model Release Tracker** — A weekly-updated dashboard of notable AI model releases, organized by company, week, and license type.

![Dashboard](public/preview.png)

---

## What It Does

ModelMonitor is a React dashboard that tracks significant AI model releases each month. It shows:

- **Grid / List / Summary** views of all releases
- **Week-by-week** filtering
- **Per-model detail modals** with highlights and license info
- **Auto-updating** via GitHub Actions every Monday

---

## Project Structure

```
ModelMonitor/
├── index.jsx                          # Main React app (fetches data, renders UI)
├── public/
│   └── models.json                    # ← THE ONLY FILE YOU EDIT TO ADD MODELS
├── scripts/
│   └── fetch-models.js                # Weekly automation script (HF API + Semantic Scholar)
├── .github/
│   └── workflows/
│       └── update-models.yml          # GitHub Actions cron job (runs every Monday)
└── package.json
```

---

## Running Locally

This project uses plain React (no bundler). Open `index.jsx` in your dev environment or serve it with any static server:

```bash
# Using Node's built-in http server
npx serve .

# Or with Python
python -m http.server 8080
```

Then visit `http://localhost:3000` (or whichever port).

> **Note:** The app fetches `/models.json` on load. Make sure your server serves the `public/` directory at the root, or update the fetch path in `index.jsx`.

---

## How to Add a New Model Manually

Open `public/models.json` and append a new entry to the array:

```json
{
  "id": 12,
  "name": "GPT-6",
  "company": "OpenAI",
  "date": "2026-05-01",
  "week": 1,
  "color": "#10a37f",
  "tags": ["Proprietary", "Flagship"],
  "license": "Proprietary",
  "summary": "One-sentence description of the model.",
  "highlights": ["Key fact 1", "Key fact 2", "Key fact 3"]
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique integer, increment from the last entry |
| `name` | string | Display name of the model |
| `company` | string | Must match a key in `COMPANY_COLORS` in `index.jsx` for correct bar chart colors |
| `date` | string | ISO date `YYYY-MM-DD` |
| `week` | number | Week-of-month (1–5) — controls which tab it appears under |
| `color` | string | Hex accent color for the card and glow |
| `tags` | string[] | Short tag labels shown on the card (max 4 recommended) |
| `license` | string | One of: `Open Weights`, `Open Source`, `MIT`, `Apache 2.0`, `Proprietary`, `Gated` |
| `summary` | string | 1–2 sentence description, shown on the card |
| `highlights` | string[] | 2–4 bullet points, shown in the detail modal |

### Supported License Values

| License | Badge Color |
|---|---|
| `Open Weights` | 🟢 Green |
| `Open Source` | 🟢 Green |
| `MIT` | 🟢 Green |
| `Apache 2.0` | 🟢 Green |
| `Proprietary` | 🔴 Red |
| `Gated` | 🩷 Pink |

---

## Automatic Weekly Updates (GitHub Actions)

The workflow in `.github/workflows/update-models.yml` runs **every Monday at 02:00 UTC**.

### What it does

1. Queries the **Hugging Face API** for new models from tracked organizations (OpenAI, Anthropic, Google, Meta, DeepSeek, Alibaba, Qwen, Mistral AI, Moonshot AI, Zhipu AI)
2. Filters by **recency** (last 7 days) and **minimum 50 likes** (reduces noise)
3. Fetches a **summary** from [Semantic Scholar](https://www.semanticscholar.org/) (`tldr` field)
4. Fetches **highlights** by parsing the model's HuggingFace model card (README.md)
5. Merges new entries into `public/models.json` and **auto-commits** to the repo

### Triggering Manually

1. Go to your GitHub repo
2. Click the **Actions** tab
3. Select **"Weekly Model Update"**
4. Click **Run workflow**

### Running the Script Locally

```bash
# Requires Node.js 20+
node scripts/fetch-models.js
```

This will print new models found and update `public/models.json` in place.

---

## Tracked Organizations

Edit the `TRACKED_ORGS` array in `scripts/fetch-models.js` to add or remove organizations:

```js
const TRACKED_ORGS = [
  "openai",
  "anthropic",
  "google",
  "meta-llama",
  "deepseek-ai",
  "Qwen",
  "mistralai",
  "moonshotai",
  "THUDM",        // Zhipu AI
];
```

> **Note:** Proprietary models (e.g., GPT-5.5, Claude) are **not uploaded to HuggingFace**, so they won't be detected automatically. Add those manually to `models.json` when announced.

---

## Customization

### Adding a New Company

1. Add an entry to `COMPANY_COLORS` in `index.jsx`:
   ```js
   "xAI": "#a855f7",
   ```
2. Add the same org slug to `TRACKED_ORGS` and `COMPANY_NAME_MAP` in `scripts/fetch-models.js`:
   ```js
   const TRACKED_ORGS = [..., "xai-org"];
   const COMPANY_NAME_MAP = { ..., "xai-org": "xAI" };
   const COMPANY_COLORS  = { ..., "xAI": "#a855f7" };
   ```

### Adding a New Week Tab

Update the `WEEKS` array in `index.jsx`:
```js
{ id: 5, label: "Week 5", range: "Apr 28 – May 4" },
```

---

## License

MIT — Feel free to fork and adapt.

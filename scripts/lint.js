import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { transformSync } from "@babel/core";
import { fileURLToPath } from "node:url";

const scripts = new URL("./", import.meta.url);
for (const name of await readdir(scripts)) {
  if (!name.endsWith(".js")) continue;
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(new URL(name, scripts))], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const jsx = await readFile(new URL("../index.jsx", import.meta.url), "utf8");
transformSync(jsx, { filename: "index.jsx", configFile: false, babelrc: false, parserOpts: { plugins: ["jsx"] } });
console.log("JavaScript syntax and Babel JSX parsing passed.");

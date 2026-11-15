import { readFileSync } from "node:fs";
import { parseOfm } from "./parse-ofm-strict.mjs";

const source = readFileSync(process.argv[2] ?? "parser/ofm-features.md", "utf8");
console.log(JSON.stringify(parseOfm(source), null, 2));

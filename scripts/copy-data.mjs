import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = resolve(root, "data");
const dest = resolve(root, "dist", "data");

if (!existsSync(src)) {
  throw new Error(`Missing data directory: ${src}`);
}

mkdirSync(resolve(root, "dist"), { recursive: true });
cpSync(src, dest, { recursive: true });

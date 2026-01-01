#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");

const SUPPORTED = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
  ".jfif",
]);

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) return null;
  let input = null;
  let output = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!input && !arg.startsWith("-")) {
      input = arg;
      continue;
    }
    if (arg === "-o" || arg === "--output") {
      output = args[i + 1];
      i += 1;
    }
  }
  if (!input) return null;
  return { input: path.resolve(input), output };
}

async function collectFiles(root, skip) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (skip && current === skip) continue;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (skip && full.startsWith(skip)) continue;
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

function convertWithSips(source, target) {
  return new Promise((resolve, reject) => {
    execFile("sips", ["-s", "format", "webp", source, "--out", target], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function run() {
  const parsed = parseArgs();
  if (!parsed) {
    console.error("Usage: node index.js <dossier> [-o dossier_sortie]");
    process.exit(1);
  }
  const inputDir = parsed.input;
  const outputDir = parsed.output
    ? path.resolve(parsed.output)
    : path.join(inputDir, "webp_converties");
  let stat;
  try {
    stat = await fs.stat(inputDir);
  } catch (err) {
    console.error("Dossier d'entree introuvable.");
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    console.error("Le chemin d'entree doit etre un dossier.");
    process.exit(1);
  }
  const files = await collectFiles(inputDir, outputDir);
  const todo = files.filter((f) => SUPPORTED.has(path.extname(f).toLowerCase()));
  const ok = [];
  const ko = [];
  for (const src of todo) {
    const rel = path.relative(inputDir, src);
    const dest = path.join(outputDir, rel).replace(path.extname(rel), ".webp");
    try {
      await ensureDir(path.dirname(dest));
      await convertWithSips(src, dest);
      ok.push(dest);
    } catch (err) {
      ko.push([src, err.message || String(err)]);
    }
  }
  console.log(`${ok.length} conversion(s) reussie(s).`);
  if (ko.length) {
    console.error(`${ko.length} echec(s) :`);
    ko.forEach(([src, msg]) => console.error(`- ${src}: ${msg}`));
    process.exit(1);
  }
  process.exit(0);
}

run();

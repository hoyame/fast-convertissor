#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const { execFile, spawnSync } = require("child_process");

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

function which(cmd) {
  const res = spawnSync("which", [cmd], { encoding: "utf8" });
  return res.status === 0 && res.stdout.trim().length > 0;
}

function pickEncoder() {
  if (which("cwebp")) return "cwebp";
  if (which("ffmpeg")) return "ffmpeg";
  return null;
}

function convertToWebp(source, target, encoder) {
  if (encoder === "cwebp") {
    return new Promise((resolve, reject) => {
      execFile("cwebp", ["-quiet", "-q", "90", source, "-o", target], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  if (encoder === "ffmpeg") {
    return new Promise((resolve, reject) => {
      execFile(
        "ffmpeg",
        ["-y", "-i", source, "-c:v", "libwebp", "-qscale", "80", target],
        (err, _stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve();
        }
      );
    });
  }
  return Promise.reject(new Error("Aucun encodeur disponible."));
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
  const encoder = pickEncoder();
  if (!encoder) {
    console.error("Aucun encodeur WebP trouve (installe cwebp ou ffmpeg).");
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
      await convertToWebp(src, dest, encoder);
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

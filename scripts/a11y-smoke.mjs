#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const pages = [
  "index.html",
  "onboarding.html",
  "project-management.html",
  "sprints.html",
  "realtime-sync.html"
];

let failures = 0;
let warnings = 0;

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function log(level, file, message) {
  const prefix = level === "FAIL" ? "[FAIL]" : "[WARN]";
  console.log(`${prefix} ${file}: ${message}`);
}

function fail(file, message) {
  failures += 1;
  log("FAIL", file, message);
}

function warn(file, message) {
  warnings += 1;
  log("WARN", file, message);
}

function attrValue(attrs, key) {
  const re = new RegExp(`\\b${key}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = attrs.match(re);
  return match ? match[1] : "";
}

function hasAttr(attrs, key) {
  const re = new RegExp(`\\b${key}\\b`, "i");
  return re.test(attrs);
}

function isInsideLabel(html, index) {
  const lastLabelOpen = html.lastIndexOf("<label", index);
  const lastLabelClose = html.lastIndexOf("</label>", index);
  return lastLabelOpen !== -1 && lastLabelOpen > lastLabelClose;
}

function checkPage(file) {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    fail(file, "File not found.");
    return;
  }

  const html = fs.readFileSync(fullPath, "utf8");

  if (!/<html[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html)) {
    fail(file, "Missing `lang` attribute on `<html>`.");
  }

  if (!/<title>\s*[^<]+<\/title>/i.test(html)) {
    fail(file, "Missing non-empty `<title>`.");
  }

  if (!/<meta[^>]+name\s*=\s*["']viewport["'][^>]*>/i.test(html)) {
    fail(file, "Missing viewport meta tag.");
  }

  const labelForSet = new Set();
  for (const labelMatch of html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    labelForSet.add(labelMatch[1]);
  }

  for (const anchorMatch of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = anchorMatch[1] || "";
    const target = attrValue(attrs, "target").toLowerCase();
    if (target === "_blank") {
      const rel = attrValue(attrs, "rel").toLowerCase();
      const safe = rel.includes("noopener") || rel.includes("noreferrer");
      if (!safe) {
        fail(file, "Link with target=\"_blank\" missing rel=\"noopener\" or rel=\"noreferrer\".");
      }
    }
  }

  for (const buttonMatch of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = buttonMatch[1] || "";
    const inner = buttonMatch[2] || "";
    const hasName =
      stripTags(inner).length > 0 ||
      attrValue(attrs, "aria-label").trim().length > 0 ||
      attrValue(attrs, "aria-labelledby").trim().length > 0;

    if (!hasName) {
      fail(file, "Button without accessible name (text/aria-label/aria-labelledby).");
    }

    if (!hasAttr(attrs, "type")) {
      warn(file, "Button missing explicit `type` attribute.");
    }
  }

  const controlRegex = /<(input|select|textarea)\b([^>]*)>/gi;
  for (const controlMatch of html.matchAll(controlRegex)) {
    const tag = (controlMatch[1] || "").toLowerCase();
    const attrs = controlMatch[2] || "";
    const full = controlMatch[0] || "";
    const index = controlMatch.index ?? -1;

    if (tag === "input") {
      const type = attrValue(attrs, "type").toLowerCase();
      if (type === "hidden") {
        continue;
      }
    }

    const ariaLabel = attrValue(attrs, "aria-label").trim();
    const ariaLabelledBy = attrValue(attrs, "aria-labelledby").trim();
    const id = attrValue(attrs, "id").trim();
    const hasLabelFor = id ? labelForSet.has(id) : false;
    const insideLabel = index >= 0 ? isInsideLabel(html, index) : false;
    const hasName = ariaLabel || ariaLabelledBy || hasLabelFor || insideLabel;

    if (!hasName) {
      warn(file, `${tag.toUpperCase()} appears unlabeled: ${stripTags(full).slice(0, 70)}`);
    }
  }
}

for (const file of pages) {
  checkPage(file);
}

console.log(`\nAccessibility smoke check complete. ${failures} failure(s), ${warnings} warning(s).`);
if (failures > 0) {
  process.exit(1);
}

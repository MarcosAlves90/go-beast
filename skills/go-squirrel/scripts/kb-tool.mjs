#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TOOL_VERSION = "1.1.0";
const RECORD_EXTENSION = "md";
const REQUIRED_FIELDS = [
  "kind",
  "schema_version",
  "id",
  "title",
  "record_type",
  "status",
  "audience",
  "summary",
  "content",
  "tags",
  "aliases",
  "references",
  "sources",
  "epistemic_status",
  "confidence",
  "priority",
  "retrieval_hints",
  "created_at",
  "updated_at",
  "verified_at",
  "provenance",
];
const ENUMS = {
  record_type: ["fact", "decision", "hypothesis", "procedure", "reference", "session", "task", "concept"],
  status: ["active", "draft", "stale", "deprecated", "archived"],
  audience: ["agent", "human", "both"],
  epistemic_status: ["observed", "sourced", "inferred", "hypothesis", "unknown", "disputed"],
  priority: ["low", "normal", "high", "critical"],
};
const PROVENANCE_ORIGINS = ["human", "agent", "import", "tool", "external"];
const RECORD_FIELD_ORDER = [...REQUIRED_FIELDS, "history"];
const NESTED_FIELD_ORDER = ["origin", "actor", "source", "captured_at", "note"];

const HELP = `go-squirrel kb-tool ${TOOL_VERSION}

Native, dependency-free Markdown KB operations:
  init      Create a fresh Markdown KB tree without overwriting files.
  add       Add one JSON or Markdown record and regenerate the manifest.
  manifest  Regenerate deterministic checksums and backlink data.
  context   Emit a bounded task context packet from selected records.
  validate  Check records, references, provenance, and generated surfaces.

The helper intentionally writes md:plain or md:obsidian projections only.
JSON is accepted as an input record format; JSON and TOON remain supported
as semantic projections by the standard and other native host tooling.

Examples:
  node scripts/kb-tool.mjs init --root /tmp/relay-kb --kb-id relay-api \
    --title "Relay API" --purpose "Durable deployment context" --format md:plain
  node scripts/kb-tool.mjs add --root /tmp/relay-kb \
    --record-file /path/to/record.json
  node scripts/kb-tool.mjs context --root /tmp/relay-kb \
    --task "Prepare a cache deployment" --records cache-decision,deployment-fact
  node scripts/kb-tool.mjs validate --root /tmp/relay-kb
`;

function parseArgs(argv) {
  const command = argv.shift() ?? "help";
  const options = {};

  while (argv.length > 0) {
    const token = argv.shift();
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }

    const equalsAt = token.indexOf("=");
    const name = equalsAt === -1 ? token.slice(2) : token.slice(2, equalsAt);
    let value = equalsAt === -1 ? undefined : token.slice(equalsAt + 1);
    if (value === undefined && argv[0] !== undefined && !argv[0].startsWith("--")) {
      value = argv.shift();
    }
    if (value === undefined) {
      value = true;
    }

    if (options[name] === undefined) {
      options[name] = value;
    } else if (Array.isArray(options[name])) {
      options[name].push(value);
    } else {
      options[name] = [options[name], value];
    }
  }

  return { command, options };
}

function option(options, name, { required = false, fallback } = {}) {
  const value = options[name] ?? fallback;
  if (required && (value === undefined || value === "")) {
    throw new Error(`missing required option --${name}`);
  }
  return value;
}

function resolveRoot(rawRoot) {
  const root = path.resolve(rawRoot);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function assertInside(root, target, description) {
  const relative = path.relative(root, target);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${description} must remain inside the KB root`);
  }
}

function assertSafeRelative(value, description) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`${description} is not a safe root-relative path: ${String(value)}`);
  }
}

function representation(rawValue = "md:plain") {
  const [format, style = "plain"] = String(rawValue).split(":");
  if (format !== "md" || !["plain", "obsidian"].includes(style)) {
    throw new Error("the native helper currently supports md:plain and md:obsidian only");
  }
  return { format, style, extension: RECORD_EXTENSION };
}

function now() {
  return new Date().toISOString();
}

function yamlValue(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(yamlValue).join(", ")}]`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(String(value));
}

function orderedKeys(value, preferredOrder = NESTED_FIELD_ORDER) {
  const preferred = preferredOrder.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  const remaining = Object.keys(value).filter((key) => !preferred.includes(key)).sort();
  return [...preferred, ...remaining];
}

function renderNestedList(key, values) {
  if (!Array.isArray(values) || values.length === 0) return `${key}: []`;
  const lines = [`${key}:`];
  for (const item of values) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      lines.push(`  - ${yamlValue(item)}`);
      continue;
    }
    const keys = orderedKeys(item);
    if (keys.length === 0) {
      lines.push("  - {}");
      continue;
    }
    lines.push(`  - ${keys[0]}: ${yamlValue(item[keys[0]])}`);
    for (const nestedKey of keys.slice(1)) {
      lines.push(`    ${nestedKey}: ${yamlValue(item[nestedKey])}`);
    }
  }
  return lines.join("\n");
}

function renderFrontmatter(metadata, { nested = [] } = {}) {
  const lines = ["---"];
  for (const key of orderedKeys(metadata, Object.keys(metadata))) {
    if (nested.includes(key)) {
      lines.push(renderNestedList(key, metadata[key]));
    } else {
      lines.push(`${key}: ${yamlValue(metadata[key])}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function renderRecord(record, style = "plain") {
  const metadata = {};
  for (const key of RECORD_FIELD_ORDER) {
    if (Object.prototype.hasOwnProperty.call(record, key)) metadata[key] = record[key];
  }
  for (const key of Object.keys(record).sort()) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) metadata[key] = record[key];
  }

  const frontmatter = renderFrontmatter(metadata, { nested: ["provenance", "history"] });
  const references = Array.isArray(record.references) ? record.references : [];
  const referenceLines = references.length === 0
    ? ["- None"]
    : references.map((reference) => {
        const label = String(reference).replaceAll("|", "\\|");
        return style === "obsidian" ? `- [[${reference}|${label}]]` : `- [${label}](${reference})`;
      });
  const sources = Array.isArray(record.sources) ? record.sources : [];
  const sourceLines = sources.length === 0 ? ["- None"] : sources.map((source) => `- ${source}`);

  return [
    frontmatter.trimEnd(),
    "",
    "## Content",
    "",
    String(record.content ?? "").trimEnd(),
    "",
    "## Evidence and sources",
    "",
    ...sourceLines,
    "",
    "## References",
    "",
    ...referenceLines,
    "",
    "## History",
    "",
    ...(Array.isArray(record.history) && record.history.length > 0
      ? record.history.map((entry) => `- ${JSON.stringify(entry)}`)
      : ["- None recorded."]),
    "",
  ].join("\n");
}

function splitFlowItems(value) {
  const items = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if ((character === '"' || character === "'") && (quote === null || quote === character)) {
      quote = quote === null ? character : null;
      current += character;
      continue;
    }
    if (character === "," && quote === null) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim() !== "" || value.trim() !== "") items.push(current.trim());
  return items;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  if (value === "[]") return [];
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner === "" ? [] : splitFlowItems(inner).map(parseScalar);
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

function parseFrontmatter(document) {
  if (!document.startsWith("---\n")) throw new Error("Markdown record is missing opening frontmatter");
  const closing = document.indexOf("\n---", 4);
  if (closing < 0) throw new Error("Markdown record is missing closing frontmatter");
  const lines = document.slice(4, closing).split("\n");
  const result = {};

  for (let index = 0; index < lines.length;) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      index += 1;
      continue;
    }
    const [, key, rawValue] = match;
    if (rawValue !== undefined && rawValue.trim() !== "") {
      result[key] = parseScalar(rawValue);
      index += 1;
      continue;
    }

    if (lines[index + 1]?.match(/^\s+-\s+/)) {
      const values = [];
      index += 1;
      while (index < lines.length && lines[index].match(/^\s+-\s+/)) {
        const itemMatch = lines[index].match(/^\s+-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!itemMatch) {
          values.push(parseScalar(lines[index].replace(/^\s+-\s+/, "")));
          index += 1;
          continue;
        }
        const item = { [itemMatch[1]]: parseScalar(itemMatch[2]) };
        index += 1;
        while (index < lines.length) {
          const nestedMatch = lines[index].match(/^\s{4,}([A-Za-z0-9_-]+):\s*(.*)$/);
          if (!nestedMatch) break;
          item[nestedMatch[1]] = parseScalar(nestedMatch[2]);
          index += 1;
        }
        values.push(item);
      }
      result[key] = values;
      continue;
    }

    result[key] = [];
    index += 1;
  }

  return result;
}

function readRecord(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    return JSON.parse(raw);
  }
  if (filePath.endsWith(".md")) {
    return parseFrontmatter(raw);
  }
  throw new Error(`unsupported input record format: ${filePath}`);
}

function writeIfMissing(filePath, content, created) {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  created.push(path.basename(filePath));
  return true;
}

function safeRecordId(id) {
  return typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

function recordPath(root, id) {
  const target = path.join(root, "records", `${id}.${RECORD_EXTENSION}`);
  assertInside(root, target, "record path");
  return target;
}

function resolveReference(reference, entries) {
  if (entries.byId.has(reference)) return entries.byId.get(reference);
  if (typeof reference !== "string" || !reference.startsWith("records/")) return null;
  const basename = path.posix.basename(reference).replace(/\.[^.]+$/, "");
  return entries.byId.get(basename) ?? null;
}

function normaliseRecord(record, entries) {
  const clone = JSON.parse(JSON.stringify(record));
  if (!Array.isArray(clone.references)) return clone;
  clone.references = clone.references.map((reference) => {
    const target = resolveReference(reference, entries);
    return target ? `records/${target.record.id}.${RECORD_EXTENSION}` : reference;
  });
  return clone;
}

function collectRecords(root) {
  const recordsRoot = path.join(root, "records");
  if (!fs.existsSync(recordsRoot)) return { items: [], byId: new Map(), byPath: new Map() };
  const items = [];
  const byId = new Map();
  const byPath = new Map();
  const filenames = fs.readdirSync(recordsRoot).filter((name) => name.endsWith(`.${RECORD_EXTENSION}`)).sort();

  for (const filename of filenames) {
    const filePath = path.join(recordsRoot, filename);
    const record = readRecord(filePath);
    const relativePath = `records/${filename}`;
    const item = { record, path: relativePath, filePath };
    items.push(item);
    if (record.id) byId.set(record.id, item);
    byPath.set(relativePath, item);
  }
  return { items, byId, byPath };
}

function validateRecord(record, entries, relativePath) {
  const errors = [];
  const warnings = [];
  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null) errors.push(`${relativePath}: missing ${field}`);
  }
  if (record.kind !== "record") errors.push(`${relativePath}: kind must be record`);
  if (!safeRecordId(record.id)) errors.push(`${relativePath}: id must be kebab-case`);
  if (record.schema_version !== "1.0") errors.push(`${relativePath}: schema_version must be 1.0`);

  for (const [field, allowed] of Object.entries(ENUMS)) {
    if (record[field] !== undefined && !allowed.includes(record[field])) {
      errors.push(`${relativePath}: ${field} must be one of ${allowed.join(", ")}`);
    }
  }

  for (const field of ["tags", "aliases", "references", "sources", "retrieval_hints", "provenance"]) {
    if (record[field] !== undefined && !Array.isArray(record[field])) errors.push(`${relativePath}: ${field} must be an array`);
  }
  if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1) {
    errors.push(`${relativePath}: confidence must be a number from 0 to 1`);
  }
  for (const field of ["created_at", "updated_at"]) {
    if (typeof record[field] !== "string" || Number.isNaN(Date.parse(record[field]))) {
      errors.push(`${relativePath}: ${field} must be an ISO date-time`);
    }
  }
  if (record.verified_at !== null && (typeof record.verified_at !== "string" || Number.isNaN(Date.parse(record.verified_at)))) {
    errors.push(`${relativePath}: verified_at must be null or an ISO date-time`);
  }
  if (!Array.isArray(record.provenance) || record.provenance.length === 0) {
    errors.push(`${relativePath}: provenance must contain at least one entry`);
  } else {
    for (const [index, provenance] of record.provenance.entries()) {
      if (!provenance || typeof provenance !== "object") {
        errors.push(`${relativePath}: provenance[${index}] must be an object`);
        continue;
      }
      if (!PROVENANCE_ORIGINS.includes(provenance.origin)) errors.push(`${relativePath}: provenance[${index}].origin is invalid`);
      if (typeof provenance.captured_at !== "string" || Number.isNaN(Date.parse(provenance.captured_at))) {
        errors.push(`${relativePath}: provenance[${index}].captured_at must be an ISO date-time`);
      }
    }
  }

  if (Array.isArray(record.references)) {
    for (const reference of record.references) {
      try {
        assertSafeRelative(reference, `${relativePath} reference`);
      } catch (error) {
        errors.push(error.message);
        continue;
      }
      if (!resolveReference(reference, entries)) errors.push(`${relativePath}: unresolved reference ${reference}`);
    }
  }
  if (["draft", "stale", "archived"].includes(record.status) || ["inferred", "hypothesis", "unknown", "disputed"].includes(record.epistemic_status)) {
    warnings.push(`${relativePath}: treat as bounded or review-required context (${record.status}/${record.epistemic_status})`);
  }
  return { errors, warnings };
}

function parseSpec(root) {
  const specPath = path.join(root, "KB_SPEC.md");
  if (!fs.existsSync(specPath)) throw new Error("KB_SPEC.md is missing; run init first");
  const metadata = parseFrontmatter(fs.readFileSync(specPath, "utf8"));
  const representationValue = `${metadata.format ?? "md"}:${metadata.md_style ?? "plain"}`;
  return { ...representation(representationValue), metadata };
}

function renderSpec({ kbId, title, purpose, style, createdAt }) {
  const metadata = {
    kind: "kb_spec",
    schema_version: "1.0",
    kb_id: kbId,
    title,
    purpose,
    format: "md",
    md_style: style,
    created_at: createdAt,
    updated_at: createdAt,
  };
  return [
    renderFrontmatter(metadata).trimEnd(),
    "",
    `# ${title}`,
    "",
    purpose,
    "",
    "## Canonical representation",
    "",
    `- Format: md:${style}`,
    "- The semantic record model is defined by go-squirrel; this tree is the canonical Markdown projection.",
    "",
    "## Layout",
    "",
    "- `KB_SPEC.md` — scope, safety, and maintenance contract.",
    "- `INDEX.md` — concise entry point and generated record list.",
    "- `MANIFEST.md` — generated checksums, forward references, and backlinks.",
    "- `records/<id>.md` — durable records with flat frontmatter.",
    "- `templates/` — copy-safe record templates.",
    "- `contexts/` and `sources/` — optional bounded packets and source notes.",
    "",
    "## Native operations",
    "",
    "Use the bundled `go-squirrel/scripts/kb-tool.mjs` with a normal terminal invocation. The helper refuses unsafe references, duplicate IDs, and invalid records; it does not overwrite existing records.",
    "",
    "## Safety boundary",
    "",
    "- Do not store secrets, credentials, tokens, or unnecessary personal data.",
    "- Treat inferred or agent-authored claims as review-required until supported.",
    "- Keep context packets task-specific and bounded by an explicit record budget.",
    "",
  ].join("\n");
}

function renderIndex({ kbId, title, purpose, createdAt }) {
  const metadata = {
    kind: "index",
    schema_version: "1.0",
    kb_id: kbId,
    title,
    purpose,
    generated_at: createdAt,
    record_ids: [],
  };
  return [
    renderFrontmatter(metadata).trimEnd(),
    "",
    `# ${title} — index`,
    "",
    purpose,
    "",
    "<!-- go-squirrel:generated-index -->",
    "## Records",
    "",
    "- None yet.",
    "<!-- go-squirrel:end-generated-index -->",
    "",
    "Start here, then retrieve only the records needed for the current task.",
    "",
  ].join("\n");
}

function renderRecordTemplate(createdAt) {
  return {
    kind: "record",
    schema_version: "1.0",
    id: "replace-me",
    title: "Replace me",
    record_type: "fact",
    status: "draft",
    audience: "both",
    summary: "Replace with a one-sentence summary.",
    content: "Replace with the claim, procedure, or decision and its evidence.",
    tags: ["replace-me"],
    aliases: [],
    references: [],
    sources: ["replace-with-source"],
    epistemic_status: "hypothesis",
    confidence: 0.5,
    priority: "normal",
    retrieval_hints: ["replace-me"],
    created_at: createdAt,
    updated_at: createdAt,
    verified_at: null,
    provenance: [{
      origin: "agent",
      actor: "go-squirrel",
      source: "manual-entry",
      captured_at: createdAt,
      note: "Replace with the capture context.",
    }],
    history: [],
  };
}

function updateIndex(root, entries) {
  const indexPath = path.join(root, "INDEX.md");
  if (!fs.existsSync(indexPath)) return;
  const current = fs.readFileSync(indexPath, "utf8");
  const startMarker = "<!-- go-squirrel:generated-index -->";
  const endMarker = "<!-- go-squirrel:end-generated-index -->";
  const start = current.indexOf(startMarker);
  const end = current.indexOf(endMarker);
  if (start < 0 || end < start) return;

  const generated = entries.items.length === 0
    ? "## Records\n\n- None yet."
    : [
        "## Records",
        "",
        ...entries.items.map(({ record, path: relativePath }) => `- [${record.id}](${relativePath}) — ${record.title} (${record.status})`),
      ].join("\n");
  const next = `${current.slice(0, start)}${startMarker}\n${generated}\n${endMarker}${current.slice(end + endMarker.length)}`;
  fs.writeFileSync(indexPath, next, "utf8");
}

function backlinkData(entries) {
  const incoming = new Map(entries.items.map((item) => [item.record.id, []]));
  const unresolved = [];
  for (const source of entries.items) {
    for (const reference of source.record.references ?? []) {
      const target = resolveReference(reference, entries);
      if (target) incoming.get(target.record.id).push(source.record.id);
      else unresolved.push(`${source.record.id} -> ${reference}`);
    }
  }
  for (const values of incoming.values()) values.sort();
  const orphans = [...incoming.entries()].filter(([, sources]) => sources.length === 0).map(([id]) => id).sort();
  return { incoming, unresolved: unresolved.sort(), orphans };
}

function checksum(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderManifest(root, entries, generatedAt = now()) {
  const graph = backlinkData(entries);
  const metadata = {
    kind: "manifest",
    schema_version: "1.0",
    kb_id: parseSpec(root).metadata.kb_id,
    generated_at: generatedAt,
    record_count: entries.items.length,
    unresolved_references: graph.unresolved,
    orphan_records: graph.orphans,
  };
  const lines = [
    renderFrontmatter(metadata).trimEnd(),
    "",
    "# Manifest",
    "",
    "Generated by `go-squirrel kb-tool`; ordering is stable and checksums cover the stored record bytes.",
    "",
    "## Records",
    "",
    "| ID | Path | Status | Confidence | References | SHA-256 |",
    "| --- | --- | --- | ---: | --- | --- |",
  ];
  for (const item of entries.items) {
    const references = (item.record.references ?? []).join(", ") || "—";
    lines.push(`| ${markdownCell(item.record.id)} | ${markdownCell(item.path)} | ${markdownCell(item.record.status)} | ${item.record.confidence} | ${markdownCell(references)} | ${checksum(item.filePath)} |`);
  }
  if (entries.items.length === 0) lines.push("| _none_ | — | — | — | — | — |");
  lines.push("", "## Backlinks", "");
  const backlinkRows = [...graph.incoming.entries()].filter(([, sources]) => sources.length > 0);
  if (backlinkRows.length === 0) {
    lines.push("- None.");
  } else {
    for (const [id, sources] of backlinkRows) {
      lines.push("- `" + id + "` ← " + sources.map((source) => "`" + source + "`").join(", "));
    }
  }
  lines.push("", "## Warnings", "");
  if (graph.unresolved.length === 0 && graph.orphans.length === 0) {
    lines.push("- None.");
  } else {
    for (const reference of graph.unresolved) lines.push(`- Unresolved reference: ${reference}`);
    for (const id of graph.orphans) lines.push(`- Orphan record: ${id}`);
  }
  lines.push("");
  return lines.join("\n");
}

function writeManifest(root) {
  const entries = collectRecords(root);
  const manifestPath = path.join(root, "MANIFEST.md");
  fs.writeFileSync(manifestPath, renderManifest(root, entries), "utf8");
  updateIndex(root, entries);
  return { entries, manifestPath };
}

function runInit(options) {
  const root = resolveRoot(option(options, "root", { required: true }));
  const kbId = option(options, "kb-id", { required: true });
  const title = option(options, "title", { required: true });
  const purpose = option(options, "purpose", { required: true });
  const { style } = representation(option(options, "format", { fallback: "md:plain" }));
  const createdAt = now();
  const template = renderRecordTemplate(createdAt);
  const created = [];
  for (const directory of ["records", "templates", "contexts", "sources"]) fs.mkdirSync(path.join(root, directory), { recursive: true });
  writeIfMissing(path.join(root, "KB_SPEC.md"), renderSpec({ kbId, title, purpose, style, createdAt }), created);
  writeIfMissing(path.join(root, "INDEX.md"), renderIndex({ kbId, title, purpose, createdAt }), created);
  writeIfMissing(path.join(root, "MANIFEST.md"), renderManifest(root, collectRecords(root), createdAt), created);
  writeIfMissing(path.join(root, "templates", "record.json"), `${JSON.stringify(template, null, 2)}\n`, created);
  writeIfMissing(path.join(root, "templates", "record.md"), renderRecord(template, style), created);
  writeIfMissing(path.join(root, "KB_VALIDATION.md"), "# KB validation\n\nStatus: NOT RUN\n\nRun `node scripts/kb-tool.mjs validate --root <KB_ROOT>` after adding records.\n", created);

  console.log(JSON.stringify({ command: "init", tool_version: TOOL_VERSION, root, representation: `md:${style}`, created }, null, 2));
}

function runAdd(options) {
  const root = resolveRoot(option(options, "root", { required: true }));
  const sourcePath = path.resolve(option(options, "record-file", { required: true }));
  const spec = parseSpec(root);
  if (spec.format !== "md") throw new Error("add currently writes Markdown KBs only");
  const input = readRecord(sourcePath);
  const entries = collectRecords(root);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("record input must be a JSON or Markdown object");
  if (!safeRecordId(input.id)) throw new Error("record id must be kebab-case");
  if (entries.byId.has(input.id)) throw new Error(`record id already exists: ${input.id}`);
  const record = normaliseRecord(input, entries);
  const target = recordPath(root, record.id);
  if (fs.existsSync(target)) throw new Error(`record path already exists: ${target}`);
  const candidateEntries = {
    ...entries,
    byId: new Map([...entries.byId, [record.id, { record, path: `records/${record.id}.md`, filePath: target }]]),
  };
  const result = validateRecord(record, candidateEntries, `records/${record.id}.md`);
  if (result.errors.length > 0) throw new Error(result.errors.join("; "));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, renderRecord(record, spec.style), "utf8");
  const manifest = writeManifest(root);
  console.log(JSON.stringify({ command: "add", id: record.id, path: path.relative(root, target), manifest: path.relative(root, manifest.manifestPath) }, null, 2));
}

function runManifest(options) {
  const root = resolveRoot(option(options, "root", { required: true }));
  parseSpec(root);
  const { entries, manifestPath } = writeManifest(root);
  console.log(JSON.stringify({ command: "manifest", records: entries.items.length, path: path.relative(root, manifestPath) }, null, 2));
}

function selectRecords(entries, options) {
  const rawIds = option(options, "records", { fallback: [] });
  const requested = (Array.isArray(rawIds) ? rawIds : [rawIds])
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const maxRecords = Number(option(options, "max-records", { fallback: 8 }));
  if (!Number.isInteger(maxRecords) || maxRecords < 1) throw new Error("--max-records must be a positive integer");
  if (requested.length > 0) {
    const missing = requested.filter((id) => !entries.byId.has(id));
    if (missing.length > 0) throw new Error(`unknown record id(s): ${missing.join(", ")}`);
    return { selected: requested.slice(0, maxRecords).map((id) => entries.byId.get(id)), maxRecords, truncated: requested.length > maxRecords };
  }

  const query = String(option(options, "query", { fallback: "" })).toLowerCase();
  const ranked = entries.items
    .map((item) => {
      const haystack = [item.record.title, item.record.summary, ...(item.record.tags ?? []), ...(item.record.retrieval_hints ?? [])].join(" ").toLowerCase();
      const score = query === "" ? 0 : query.split(/\s+/).filter((term) => haystack.includes(term)).length;
      return { item, score };
    })
    .sort((left, right) => right.score - left.score || left.item.record.id.localeCompare(right.item.record.id));
  return { selected: ranked.slice(0, maxRecords).map(({ item }) => item), maxRecords, truncated: ranked.length > maxRecords };
}

function runContext(options) {
  const root = resolveRoot(option(options, "root", { required: true }));
  parseSpec(root);
  const task = option(options, "task", { required: true });
  const entries = collectRecords(root);
  const { selected, maxRecords, truncated } = selectRecords(entries, options);
  const outputValue = option(options, "output", { fallback: "CONTEXT_PACKET.md" });
  const outputPath = path.resolve(root, outputValue);
  assertInside(root, outputPath, "context output");
  const references = selected.flatMap((item) => item.record.references ?? []).filter((reference, index, all) => all.indexOf(reference) === index);
  const unresolved = references.filter((reference) => !resolveReference(reference, entries));
  const lines = [
    renderFrontmatter({
      kind: "context_packet",
      schema_version: "1.0",
      task,
      budget_records: maxRecords,
      selected_record_ids: selected.map((item) => item.record.id),
      generated_at: now(),
    }).trimEnd(),
    "",
    "# Context packet",
    "",
    "## Task",
    "",
    task,
    "",
    "## Scope and budget",
    "",
    `Selected ${selected.length} record(s); budget: ${maxRecords} record(s).${truncated ? " Additional matching records were omitted." : ""}`,
    "",
    "## Selected records",
    "",
  ];
  if (selected.length === 0) {
    lines.push("- None matched the request.");
  } else {
    for (const item of selected) {
      lines.push(`### ${item.record.id} — ${item.record.title}`, "", `- Path: ${item.path}`, `- Reason: selected for the task by explicit ID or bounded query`, `- Status: ${item.record.status}`, `- Confidence: ${item.record.confidence}`, `- Summary: ${item.record.summary}`, "", `> ${String(item.record.content).replaceAll("\n", " ").slice(0, 500)}`, "");
    }
  }
  lines.push("## Unresolved or conflicting claims", "");
  lines.push(unresolved.length === 0 ? "- None observed in the selected graph." : unresolved.map((reference) => `- Unresolved reference: ${reference}`).join("\n"));
  lines.push("", "## Next reads/actions", "", "- Verify the selected sources before treating inferred or draft claims as facts.", "- Re-run `validate` after material updates.", "");
  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  console.log(JSON.stringify({ command: "context", path: path.relative(root, outputPath), selected: selected.map((item) => item.record.id), budget_records: maxRecords }, null, 2));
}

function runValidate(options) {
  const root = resolveRoot(option(options, "root", { required: true }));
  parseSpec(root);
  const entries = collectRecords(root);
  const errors = [];
  const warnings = [];
  const ids = new Map();
  for (const item of entries.items) {
    if (ids.has(item.record.id)) errors.push(`duplicate record id: ${item.record.id}`);
    ids.set(item.record.id, item.path);
    const result = validateRecord(item.record, entries, item.path);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  for (const requiredFile of ["KB_SPEC.md", "INDEX.md", "MANIFEST.md"]) {
    if (!fs.existsSync(path.join(root, requiredFile))) errors.push(`missing generated surface: ${requiredFile}`);
  }
  const manifestText = fs.existsSync(path.join(root, "MANIFEST.md")) ? fs.readFileSync(path.join(root, "MANIFEST.md"), "utf8") : "";
  for (const item of entries.items) {
    if (!manifestText.includes(item.record.id) || !manifestText.includes(checksum(item.filePath))) {
      errors.push(`manifest is stale for ${item.record.id}`);
    }
  }
  const graph = backlinkData(entries);
  warnings.push(...graph.orphans.map((id) => `orphan record: ${id}`));
  const status = errors.length === 0 ? "PASS" : "FAIL";
  const report = [
    "# KB validation",
    "",
    `Status: ${status}${warnings.length > 0 && status === "PASS" ? " WITH WARNINGS" : ""}`,
    `Generated at: ${now()}`,
    `Records checked: ${entries.items.length}`,
    `Errors: ${errors.length}`,
    `Warnings: ${warnings.length}`,
    "",
    "## Checks",
    "",
    "- Required surfaces: checked",
    "- Record envelope and controlled fields: checked",
    "- Provenance and confidence bounds: checked",
    "- Safe and resolvable local references: checked",
    "- Manifest checksums and backlink graph: checked",
    "- Bounded context contract: checked by the native context command",
    "",
    "## Findings",
    "",
    ...(errors.length === 0 ? ["- No validation errors."] : errors.map((error) => `- ERROR: ${error}`)),
    ...(warnings.length === 0 ? [] : warnings.map((warning) => `- WARNING: ${warning}`)),
    "",
    "## Limitations",
    "",
    "- This helper validates the Markdown projection and accepts JSON record input; JSON and TOON output conversion remains governed by KB_STANDARD.md.",
    "- Semantic search quality depends on the host agent's search tooling; this command only performs bounded ID or term selection.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(root, "KB_VALIDATION.md"), report, "utf8");
  console.log(JSON.stringify({ command: "validate", status, records: entries.items.length, errors: errors.length, warnings: warnings.length, report: "KB_VALIDATION.md" }, null, 2));
  if (errors.length > 0) process.exitCode = 1;
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    console.log(HELP);
    return;
  }
  switch (command) {
    case "init":
      runInit(options);
      break;
    case "add":
      runAdd(options);
      break;
    case "manifest":
      runManifest(options);
      break;
    case "context":
      runContext(options);
      break;
    case "validate":
      runValidate(options);
      break;
    default:
      throw new Error(`unknown command: ${command}; use --help for usage`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`[go-squirrel] ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

export { checksum, collectRecords, parseSpec, resolveReference, selectRecords, validateRecord };

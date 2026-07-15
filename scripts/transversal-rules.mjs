#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const START = '<!-- BEGIN GENERATED: transversal-rules -->'
const END = '<!-- END GENERATED: transversal-rules -->'
const manifestName = 'go-beast.manifest.yaml'
const schemaName = 'go-beast.manifest.schema.json'

function fail(message) {
  throw new Error(`Transversal rules validation failed: ${message}`)
}

function scalar(raw) {
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value)
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
  if (/^-?\d+$/.test(value)) return Number(value)
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^[{}[\],&*!|>]/.test(value)) fail(`unsupported YAML scalar: ${value}`)
  return value
}

function parseYaml(text) {
  const lines = text.split(/\r?\n/).map((content, number) => ({
    content,
    number: number + 1,
    indent: content.match(/^ */)[0].length,
  })).filter(line => line.content.trim() && !line.content.trim().startsWith('#'))

  function parseBlock(index, indent) {
    if (index >= lines.length || lines[index].indent < indent) return [null, index]
    if (lines[index].indent !== indent) fail(`unexpected indentation at line ${lines[index].number}`)
    const list = lines[index].content.trim().startsWith('- ')
    const value = list ? [] : {}
    while (index < lines.length && lines[index].indent === indent) {
      const line = lines[index]
      const body = line.content.slice(indent)
      if (list) {
        if (!body.startsWith('- ')) fail(`mixed list and mapping at line ${line.number}`)
        const item = body.slice(2).trim()
        if (!item) {
          const [child, next] = parseBlock(index + 1, indent + 2)
          if (child === null) fail(`empty list item at line ${line.number}`)
          value.push(child)
          index = next
          continue
        }
        const match = item.match(/^([^:]+):(?:[ ](.*))?$/)
        if (match) {
          const object = {}
          const key = match[1].trim()
          if (!key || Object.hasOwn(object, key)) fail(`invalid list key at line ${line.number}`)
          if (match[2] !== undefined && match[2] !== '') {
            object[key] = scalar(match[2])
            index += 1
          }
          else {
            const [child, next] = parseBlock(index + 1, indent + 4)
            if (child === null) fail(`missing value for ${key} at line ${line.number}`)
            object[key] = child
            index = next
          }
          while (index < lines.length && lines[index].indent === indent + 2) {
            const nested = lines[index]
            const nestedMatch = nested.content.slice(indent + 2).match(/^([^:]+):(?:[ ](.*))?$/)
            if (!nestedMatch) fail(`expected mapping in list item at line ${nested.number}`)
            const nestedKey = nestedMatch[1].trim()
            if (Object.hasOwn(object, nestedKey)) fail(`duplicate key ${nestedKey} at line ${nested.number}`)
            if (nestedMatch[2] !== undefined && nestedMatch[2] !== '') {
              object[nestedKey] = scalar(nestedMatch[2])
              index += 1
            }
            else {
              const [child, next] = parseBlock(index + 1, indent + 4)
              if (child === null) fail(`missing value for ${nestedKey} at line ${nested.number}`)
              object[nestedKey] = child
              index = next
            }
            if (index < lines.length && lines[index].indent < indent + 2) break
          }
          value.push(object)
          continue
        }
        value.push(scalar(item))
        index += 1
      } else {
        const currentIndex = index
        const match = body.match(/^([^:]+):(?:[ ](.*))?$/)
        if (!match) fail(`expected mapping at line ${line.number}`)
        const key = match[1].trim()
        if (!key || Object.hasOwn(value, key)) fail(`duplicate or empty key at line ${line.number}`)
        if (match[2] !== undefined && match[2] !== '') value[key] = scalar(match[2])
        else {
          const [child, next] = parseBlock(index + 1, indent + 2)
          if (child === null) fail(`missing value for ${key} at line ${line.number}`)
          value[key] = child
          index = next
        }
        if (index === currentIndex) index += 1
        if (index < lines.length && lines[index].indent < indent) break
      }
    }
    return [value, index]
  }

  const [result, index] = parseBlock(0, lines[0]?.indent ?? 0)
  if (index !== lines.length) fail(`unparsed content at line ${lines[index].number}`)
  return result
}

function assertType(value, type, key) {
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (actual !== type) fail(`${key} must be ${type}, got ${actual}`)
}

function assertKeys(value, keys, label) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} has unknown key ${key}`)
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label} is missing ${key}`)
}

function validateManifest(manifest, schema) {
  assertType(manifest, 'object', 'manifest')
  const required = schema.required
  for (const key of required) if (!Object.hasOwn(manifest, key)) fail(`missing required key ${key}`)
  for (const key of Object.keys(manifest)) if (!schema.properties[key]) fail(`unknown key ${key}`)
  assertType(manifest.schema_version, 'number', 'schema_version')
  assertType(manifest.manifest_version, 'number', 'manifest_version')
  if (!Number.isInteger(manifest.schema_version) || !Number.isInteger(manifest.manifest_version)) fail('schema and manifest versions must be integers')
  if (manifest.schema_version !== 1) fail(`unsupported schema_version ${manifest.schema_version}`)
  if (typeof manifest.title !== 'string' || !manifest.title.trim()) fail('title must be a non-empty string')
  for (const key of ['principles', 'precedence', 'expected_artifacts', 'execution_constraints', 'required_phases', 'federated_sources', 'derived_surfaces']) assertType(manifest[key], 'array', key)
  for (const key of ['principles', 'precedence', 'expected_artifacts', 'execution_constraints']) {
    if (!manifest[key].length || manifest[key].some(item => typeof item !== 'string' || !item.trim())) fail(`${key} must contain non-empty strings`)
  }
  assertType(manifest.hook_integration, 'object', 'hook_integration')
  assertKeys(manifest.hook_integration, ['contract', 'wiring', 'session_sync'], 'hook_integration')
  for (const key of ['contract', 'wiring', 'session_sync']) if (typeof manifest.hook_integration[key] !== 'string') fail(`hook_integration.${key} must be string`)
  for (const [key, items] of [['required_phases', manifest.required_phases], ['federated_sources', manifest.federated_sources], ['derived_surfaces', manifest.derived_surfaces]]) {
    for (const item of items) {
      assertType(item, 'object', `${key} item`)
      if (key === 'required_phases') assertKeys(item, ['name', 'artifact'], `${key} item`)
      if (key === 'federated_sources') assertKeys(item, ['domain', 'source'], `${key} item`)
      if (key === 'derived_surfaces') assertKeys(item, ['path', 'marker'], `${key} item`)
      for (const field of key === 'required_phases' ? ['name', 'artifact'] : ['domain', 'source']) {
        if (key === 'derived_surfaces') break
        if (typeof item[field] !== 'string' || !item[field].trim()) fail(`${key}.${field} must be non-empty string`)
      }
      if (key === 'derived_surfaces' && (typeof item.path !== 'string' || typeof item.marker !== 'string' || !item.path || !item.marker)) fail('derived_surfaces entries require path and marker')
    }
  }
}

function markerBlock(manifest, audience) {
  const lines = [
    START,
    `## Generated transversal rules — ${audience}`,
    '',
    `Source: \`${manifestName}\` (schema ${manifest.schema_version}, manifest ${manifest.manifest_version}).`,
    '',
    'These rules are generated. Edit the manifest and run the generator; do not edit this block manually.',
    '',
    '### Principles',
    ...manifest.principles.map(item => `- ${item}`),
    '',
    '### Precedence',
    ...manifest.precedence.map((item, index) => `${index + 1}. ${item}`),
    '',
    '### Required phases',
    ...manifest.required_phases.map(item => `- **${item.name}:** \`${item.artifact}\``),
    '',
    '### Execution constraints',
    ...manifest.execution_constraints.map(item => `- ${item}`),
    '',
    '### Federated sources',
    ...manifest.federated_sources.map(item => `- **${item.domain}:** \`${item.source}\``),
    '',
    `Hook contract: \`${manifest.hook_integration.contract}\`; wiring: \`${manifest.hook_integration.wiring}\`; session sync: \`${manifest.hook_integration.session_sync}\`.`,
    END,
  ]
  return lines.join('\n')
}

function replaceBlock(content, manifest, audience, filePath) {
  const startCount = content.split(START).length - 1
  const endCount = content.split(END).length - 1
  if (startCount !== 1 || endCount !== 1) fail(`${filePath} must contain exactly one generated marker pair`)
  const start = content.indexOf(START)
  const end = content.indexOf(END)
  if (end < start) fail(`${filePath} has reversed generated markers`)
  return `${content.slice(0, start)}${markerBlock(manifest, audience)}${content.slice(end + END.length)}`
}

function renderIndex(manifest) {
  return `${JSON.stringify({ schema_version: manifest.schema_version, manifest_version: manifest.manifest_version, manifest: manifestName, schema: schemaName, derived_surfaces: manifest.derived_surfaces, federated_sources: manifest.federated_sources }, null, 2)}\n`
}

function parseArgs() {
  const mode = process.argv[2] ?? 'check'
  const rootFlag = process.argv.indexOf('--root')
  const root = rootFlag >= 0 ? path.resolve(process.argv[rootFlag + 1]) : process.cwd()
  if (!['check', 'generate'].includes(mode) || (rootFlag >= 0 && !process.argv[rootFlag + 1])) fail('usage: transversal-rules.mjs <check|generate> [--root DIR]')
  return { mode, root }
}

function main() {
  const { mode, root } = parseArgs()
  const manifest = parseYaml(fs.readFileSync(path.join(root, manifestName), 'utf8'))
  const schema = JSON.parse(fs.readFileSync(path.join(root, schemaName), 'utf8'))
  validateManifest(manifest, schema)
  const surfaces = new Map(manifest.derived_surfaces.map(item => [item.path, item]))
  const expected = new Map([
    ['AGENTS.global.md', null],
    ['AGENTS.bootstrap.md', null],
    ['AGENTS.md', null],
    ['docs/architecture/TRANSVERSAL_RULES.md', null],
    ['docs/architecture/transversal-rules-index.json', renderIndex(manifest)],
  ])
  if (surfaces.size !== expected.size || [...expected.keys()].some(file => !surfaces.has(file))) fail('derived_surfaces does not match the supported generated surface list')
  for (const [relative, generated] of expected) {
    const filePath = path.join(root, relative)
    const current = fs.readFileSync(filePath, 'utf8')
    let desired = generated
    if (relative.endsWith('.md')) {
      const audience = relative === 'AGENTS.global.md' ? 'global contract' : relative === 'AGENTS.bootstrap.md' ? 'bootstrap contract' : relative === 'AGENTS.md' ? 'repository contract' : 'architecture reference'
      desired = replaceBlock(current, manifest, audience, filePath)
    }
    if (mode === 'check' && current !== desired) fail(`${relative} is out of date; run npm run rules:generate`)
    if (mode === 'generate' && current !== desired) fs.writeFileSync(filePath, desired)
  }
  console.log(`Transversal rules ${mode} passed.`)
}

try { main() } catch (error) { console.error(error.message); process.exit(1) }

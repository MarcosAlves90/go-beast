#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const START = '<!-- BEGIN GENERATED: transversal-rules -->'
const END = '<!-- END GENERATED: transversal-rules -->'
const ALIAS_START = '<!-- BEGIN GENERATED: semantic-skill-aliases -->'
const ALIAS_END = '<!-- END GENERATED: semantic-skill-aliases -->'
const SKILL_START = '<!-- BEGIN GENERATED: skill-contract -->'
const SKILL_END = '<!-- END GENERATED: skill-contract -->'
const manifestName = 'go-beast.manifest.yaml'
const schemaName = 'go-beast.manifest.schema.json'

function fail(message) {
  throw new Error(`Transversal rules validation failed: ${message}`)
}

function scalar(raw) {
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    return inner ? inner.split(',').map(item => scalar(item)) : []
  }
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value)
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
  if (/^-?\d+$/.test(value)) return Number(value)
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^[{}\],&*!|>]/.test(value)) fail(`unsupported YAML scalar: ${value}`)
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

function validateOrchestration(manifest, root) {
  const orchestration = manifest.orchestration
  assertType(orchestration, 'object', 'orchestration')
  assertKeys(orchestration, ['artifacts', 'external_nodes', 'consumers'], 'orchestration')

  const skillNames = new Set(Object.keys(manifest.skills))
  const externalNodes = new Set(orchestration.external_nodes)
  const nodes = new Set([...skillNames, ...externalNodes])
  const artifactIds = new Set()
  const artifactLabels = new Set()

  for (const artifact of orchestration.artifacts) {
    assertKeys(artifact, ['id', 'label', 'produced_by', 'consumed_by'], 'orchestration artifact')
    if (!/^[a-z0-9-]+$/.test(artifact.id)) fail(`orchestration artifact id must match ^[a-z0-9-]+$: ${artifact.id}`)
    if (artifactIds.has(artifact.id)) fail(`duplicate orchestration artifact: ${artifact.id}`)
    if (artifactLabels.has(artifact.label)) fail(`duplicate orchestration artifact label: ${artifact.label}`)
    artifactIds.add(artifact.id)
    artifactLabels.add(artifact.label)
    for (const node of [...artifact.produced_by, ...artifact.consumed_by]) {
      if (!nodes.has(node)) fail(`orchestration artifact ${artifact.id} references unknown node: ${node}`)
    }
  }

  const dependencyGraph = new Map([...skillNames].map(name => [name, []]))
  for (const [name, entry] of Object.entries(manifest.skills)) {
    const references = [...entry.depends_on, ...entry.conflicts_with]
      .flatMap(value => value.match(/\bgo-[a-z0-9-]+\b/g) ?? [])
    for (const reference of references) {
      if (!nodes.has(reference)) fail(`skills.${name} references unknown node: ${reference}`)
    }
    dependencyGraph.set(name, [...entry.depends_on.flatMap(value => value.match(/\bgo-[a-z0-9-]+\b/g) ?? [])])
  }

  const visiting = new Set()
  const visited = new Set()
  function visit(name, trail = []) {
    if (visiting.has(name)) fail(`dependency cycle detected: ${[...trail, name].join(' -> ')}`)
    if (visited.has(name)) return
    visiting.add(name)
    for (const dependency of dependencyGraph.get(name) ?? []) visit(dependency, [...trail, name])
    visiting.delete(name)
    visited.add(name)
  }
  for (const name of skillNames) visit(name)

  for (const phase of manifest.required_phases) {
    if (![...artifactLabels].some(label => phase.artifact === label || phase.artifact.startsWith(`${label} `) || label.startsWith(`${phase.artifact} `))) {
      fail(`required phase references an unregistered artifact: ${phase.artifact}`)
    }
  }

  const consumerIds = new Set()
  for (const consumer of orchestration.consumers) {
    assertKeys(consumer, ['id', 'command', 'required', 'surfaces'], 'orchestration consumer')
    if (consumerIds.has(consumer.id)) fail(`duplicate orchestration consumer: ${consumer.id}`)
    consumerIds.add(consumer.id)
    if (!nodes.has(consumer.id)) fail(`orchestration consumer is not a known node: ${consumer.id}`)
    for (const surface of consumer.surfaces) {
      const surfacePath = path.join(root, surface)
      if (!fs.existsSync(surfacePath)) fail(`orchestration consumer ${consumer.id} references missing surface: ${surface}`)
      const surfaceContent = fs.readFileSync(surfacePath, 'utf8')
      const packageScript = surface === 'package.json' && consumer.command.match(/^npm run ([a-z:]+)$/)?.[1]
      const commandPresent = packageScript
        ? JSON.parse(surfaceContent).scripts?.[packageScript] !== undefined
        : surfaceContent.includes(consumer.command)
      if (!commandPresent) {
        fail(`orchestration consumer ${consumer.id} command is missing from ${surface}`)
      }
    }
  }
  for (const requiredConsumer of ['verify', 'ci']) {
    const consumer = orchestration.consumers.find(item => item.id === requiredConsumer)
    if (!consumer?.required) fail(`required orchestration consumer is missing or optional: ${requiredConsumer}`)
  }
}

function validateManifest(manifest, schema, root) {
  assertType(manifest, 'object', 'manifest')
  const required = schema.required
  for (const key of required) if (!Object.hasOwn(manifest, key)) fail(`missing required key ${key}`)
  for (const key of Object.keys(manifest)) if (!schema.properties[key]) fail(`unknown key ${key}`)
  assertType(manifest.schema_version, 'number', 'schema_version')
  assertType(manifest.manifest_version, 'number', 'manifest_version')
  if (!Number.isInteger(manifest.schema_version) || !Number.isInteger(manifest.manifest_version)) fail('schema and manifest versions must be integers')
  if (manifest.schema_version !== 1) fail(`unsupported schema_version ${manifest.schema_version}`)
  if (typeof manifest.title !== 'string' || !manifest.title.trim()) fail('title must be a non-empty string')
  for (const key of ['principles', 'precedence', 'expected_artifacts', 'execution_constraints', 'required_phases', 'federated_sources', 'reserved_aliases', 'derived_surfaces']) assertType(manifest[key], 'array', key)
  for (const key of ['principles', 'precedence', 'expected_artifacts', 'execution_constraints']) {
    if (!manifest[key].length || manifest[key].some(item => typeof item !== 'string' || !item.trim())) fail(`${key} must contain non-empty strings`)
  }
  if (manifest.reserved_aliases.some(alias => typeof alias !== 'string' || !alias.trim())) fail('reserved_aliases must contain non-empty strings')
  assertType(manifest.skills, 'object', 'skills')
  validateOrchestration(manifest, root)
  const canonicalSkills = fs.readdirSync(path.join(root, 'skills'))
    .filter(name => name.startsWith('go-') && fs.existsSync(path.join(root, 'skills', name, 'SKILL.md')))
  const manifestSkills = Object.keys(manifest.skills).sort()
  if (canonicalSkills.sort().join('\n') !== manifestSkills.join('\n')) fail('skills aliases must cover exactly every canonical go-* skill')
  const officialNames = new Set(canonicalSkills.map(name => name.toLowerCase()))
  const reserved = new Set(manifest.reserved_aliases.map(alias => alias.toLowerCase()))
  const aliases = new Set()
  for (const [name, entry] of Object.entries(manifest.skills)) {
    assertKeys(entry, ['alias', 'description', 'phase', 'when_to_use', 'prerequisites', 'input_artifacts', 'output_artifacts', 'gates', 'depends_on', 'conflicts_with'], `skills.${name}`)
    if (!/^[a-z0-9-]+$/.test(entry.alias)) fail(`skills.${name}.alias must match ^[a-z0-9-]+$`)
    if (!entry.description.trim()) fail(`skills.${name}.description must be non-empty`)
    if (typeof entry.phase !== 'string' || !entry.phase.trim()) fail(`skills.${name}.phase must be non-empty`)
    for (const field of ['when_to_use', 'prerequisites', 'input_artifacts', 'output_artifacts', 'gates', 'depends_on', 'conflicts_with']) {
      if (!Array.isArray(entry[field]) || entry[field].some(item => typeof item !== 'string')) fail(`skills.${name}.${field} must be an array of strings`)
    }
    if (entry.when_to_use.length === 0 || entry.gates.length === 0) fail(`skills.${name} requires when_to_use and gates`)
    const normalized = entry.alias.toLowerCase()
    if (aliases.has(normalized)) fail(`duplicate skill alias: ${entry.alias}`)
    if (reserved.has(normalized)) fail(`reserved skill alias: ${entry.alias}`)
    if (officialNames.has(normalized) || normalized.startsWith('go-')) fail(`skill alias cannot be a go-* identifier: ${entry.alias}`)
    aliases.add(normalized)
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
    '',
    '### Declarative orchestration',
    ...manifest.orchestration.consumers.map(item => `- **${item.id}:** \`${item.command}\` (${item.required ? 'required' : 'optional'})`),
    ...manifest.orchestration.artifacts.map(item => `- **${item.id}:** ${item.label}`),
    END,
  ]
  return lines.join('\n')
}

function aliasBlock(manifest) {
  const lines = [
    ALIAS_START,
    '## Semantic skill aliases',
    '',
    'Aliases are descriptive documentation only. The official identifiers remain the `go-*` names.',
    '',
    '| Official skill | Semantic alias | Purpose |',
    '|---|---|---|',
    ...Object.entries(manifest.skills).sort(([left], [right]) => left.localeCompare(right)).map(([name, entry]) => `| [${name}](../skills/${name}/SKILL.md) | \`${entry.alias}\` | ${entry.description} |`),
    ALIAS_END,
  ]
  return lines.join('\n')
}

function skillBlock(name, entry) {
  const lines = [
    SKILL_START,
    '## Generated skill contract',
    '',
    `- **ID:** \`${name}\``,
    `- **Alias:** \`${entry.alias}\` (documentation only)`,
    `- **Phase:** ${entry.phase}`,
    `- **When to use:** ${entry.when_to_use.join('; ')}`,
    `- **Prerequisites:** ${entry.prerequisites.length ? entry.prerequisites.join('; ') : 'None'}`,
    `- **Input artifacts:** ${entry.input_artifacts.length ? entry.input_artifacts.join('; ') : 'None'}`,
    `- **Output artifacts:** ${entry.output_artifacts.length ? entry.output_artifacts.join('; ') : 'None'}`,
    `- **Gates:** ${entry.gates.join('; ')}`,
    `- **Dependencies:** ${entry.depends_on.length ? entry.depends_on.join('; ') : 'None'}`,
    `- **Conflicts:** ${entry.conflicts_with.length ? entry.conflicts_with.join('; ') : 'None'}`,
    '',
    'The manifest defines this contract; the remainder of this skill defines how to fulfill it.',
    SKILL_END,
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

function replaceAliasBlock(content, manifest, filePath) {
  const startCount = content.split(ALIAS_START).length - 1
  const endCount = content.split(ALIAS_END).length - 1
  if (startCount !== 1 || endCount !== 1) fail(`${filePath} must contain exactly one semantic alias marker pair`)
  const start = content.indexOf(ALIAS_START)
  const end = content.indexOf(ALIAS_END)
  if (end < start) fail(`${filePath} has reversed semantic alias markers`)
  return `${content.slice(0, start)}${aliasBlock(manifest)}${content.slice(end + ALIAS_END.length)}`
}

function replaceSkillBlock(content, name, entry, filePath) {
  const startCount = content.split(SKILL_START).length - 1
  const endCount = content.split(SKILL_END).length - 1
  if (startCount !== 1 || endCount !== 1) fail(`${filePath} must contain exactly one skill contract marker pair`)
  const start = content.indexOf(SKILL_START)
  const end = content.indexOf(SKILL_END)
  if (end < start) fail(`${filePath} has reversed skill contract markers`)
  return `${content.slice(0, start)}${skillBlock(name, entry)}${content.slice(end + SKILL_END.length)}`
}

function policyXml(manifest) {
  return [
    '<go_beast_policy>',
    `  <precedence>${manifest.precedence.join(' | ')}</precedence>`,
    `  <phases>${manifest.required_phases.map(item => item.name).join(' | ')}</phases>`,
    `  <gates>${manifest.execution_constraints.join(' | ')}</gates>`,
    '</go_beast_policy>',
  ]
}

function replaceCommentBlock(content, manifest, start, end, prefix, filePath) {
  const startCount = content.split(start).length - 1
  const endCount = content.split(end).length - 1
  if (startCount !== 1 || endCount !== 1) fail(`${filePath} must contain exactly one generated policy marker pair`)
  const begin = content.indexOf(start)
  const finish = content.indexOf(end)
  if (finish < begin) fail(`${filePath} has reversed generated policy markers`)
  const body = [start, ...policyXml(manifest).map(line => `${prefix} ${line}`), end].join('\n')
  return `${content.slice(0, begin)}${body}${content.slice(finish + end.length)}`
}

function renderIndex(manifest) {
  return `${JSON.stringify({ schema_version: manifest.schema_version, manifest_version: manifest.manifest_version, manifest: manifestName, schema: schemaName, reserved_aliases: manifest.reserved_aliases, orchestration: manifest.orchestration, skills: manifest.skills, derived_surfaces: manifest.derived_surfaces, federated_sources: manifest.federated_sources }, null, 2)}\n`
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
  validateManifest(manifest, schema, root)
  const surfaces = new Map(manifest.derived_surfaces.map(item => [item.path, item]))
  const expected = new Map([
    ['AGENTS.global.md', null],
    ['AGENTS.bootstrap.md', null],
    ['AGENTS.md', null],
    ['docs/architecture/TRANSVERSAL_RULES.md', null],
    ['docs/PIPELINE.md', null],
    ['skills/*/SKILL.md', null],
    ['hooks/go-beast-user-prompt-context.sh', null],
    ['hooks/go-beast-stop-reanchor.sh', null],
    ['workflows/go-skill-eval.js', null],
    ['workflows/go-hook-eval.js', null],
    ['docs/architecture/transversal-rules-index.json', renderIndex(manifest)],
  ])
  if (surfaces.size !== expected.size || [...expected.keys()].some(file => !surfaces.has(file))) fail('derived_surfaces does not match the supported generated surface list')
  for (const [relative, generated] of expected) {
    if (relative === 'skills/*/SKILL.md') {
      for (const name of Object.keys(manifest.skills).sort()) {
        const skillPath = path.join(root, 'skills', name, 'SKILL.md')
        const current = fs.readFileSync(skillPath, 'utf8')
        const desired = replaceSkillBlock(current, name, manifest.skills[name], skillPath)
        if (mode === 'check' && current !== desired) fail(`${path.relative(root, skillPath)} is out of date; run npm run rules:generate`)
        if (mode === 'generate' && current !== desired) fs.writeFileSync(skillPath, desired)
      }
      continue
    }
    const filePath = path.join(root, relative)
    const current = fs.readFileSync(filePath, 'utf8')
    let desired = generated
    if (relative === 'docs/PIPELINE.md') {
      desired = replaceAliasBlock(current, manifest, filePath)
    } else if (relative.startsWith('hooks/')) {
      desired = replaceCommentBlock(current, manifest, '# BEGIN GENERATED: anti-drift-prompt', '# END GENERATED: anti-drift-prompt', '#', filePath)
    } else if (relative.startsWith('workflows/')) {
      desired = replaceCommentBlock(current, manifest, '// BEGIN GENERATED: workflow-policy', '// END GENERATED: workflow-policy', '//', filePath)
    } else if (relative.endsWith('.md')) {
      const audience = relative === 'AGENTS.global.md' ? 'global contract' : relative === 'AGENTS.bootstrap.md' ? 'bootstrap contract' : relative === 'AGENTS.md' ? 'repository contract' : 'architecture reference'
      desired = replaceBlock(current, manifest, audience, filePath)
    }
    if (mode === 'check' && current !== desired) fail(`${relative} is out of date; run npm run rules:generate`)
    if (mode === 'generate' && current !== desired) fs.writeFileSync(filePath, desired)
  }
  console.log(`Transversal rules ${mode} passed.`)
}

try { main() } catch (error) { console.error(error.message); process.exit(1) }

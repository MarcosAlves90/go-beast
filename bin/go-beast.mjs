#!/usr/bin/env node

const args = process.argv.slice(2)
const namespaces = ['init', 'plan', 'run', 'status', 'explain', 'resume', 'audit', 'workflow', 'delivery', 'conformance', 'integration', 'capabilities', 'adapters', 'doctor', 'evidence', 'context']
if (!namespaces.includes(args[0])) {
  console.error('Usage: go-beast <init|doctor|plan|run|status|explain|resume|audit|workflow|delivery|conformance|integration|capabilities|adapters|evidence|context> <command> [options]')
  process.exit(2)
}

const namespace = args[0]
process.argv = [process.argv[0], process.argv[1], ...args.slice(1)]
if (['init', 'plan', 'run', 'status', 'explain', 'resume', 'audit'].includes(namespace)) {
  const { main } = await import('../scripts/task-cli.mjs')
  main([namespace, ...args.slice(1)])
} else if (namespace === 'integration') {
  const { main } = await import('../scripts/integration-profile.mjs')
  main(args.slice(1))
} else if (namespace === 'capabilities') {
  const { main } = await import('../scripts/capabilities.mjs')
  main(args.slice(1))
} else if (namespace === 'adapters') {
  const { main } = await import('../scripts/adapters.mjs')
  main(args.slice(1))
} else if (namespace === 'doctor') {
  const { main } = await import('../scripts/doctor.mjs')
  main(args.slice(1))
} else if (namespace === 'evidence') {
  const { main } = await import('../scripts/evidence.mjs')
  main(args.slice(1))
} else if (namespace === 'context') {
  const { main } = await import('../scripts/context-compiler.mjs')
  main(args.slice(1))
} else if (namespace === 'conformance') {
  const { main } = await import('../scripts/conformance.mjs')
  main(args.slice(1))
} else {
  await import(namespace === 'workflow'
    ? '../scripts/workflow.mjs'
    : '../scripts/delivery.mjs')
}

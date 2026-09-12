#!/usr/bin/env node

const args = process.argv.slice(2)
if (!['workflow', 'delivery', 'conformance'].includes(args[0])) {
  console.error('Usage: go-beast <workflow|delivery|conformance> <command> [options]')
  process.exit(2)
}

const namespace = args[0]
process.argv = [process.argv[0], process.argv[1], ...args.slice(1)]
await import(namespace === 'workflow'
  ? '../scripts/workflow.mjs'
  : namespace === 'delivery'
    ? '../scripts/delivery.mjs'
    : '../scripts/conformance.mjs')

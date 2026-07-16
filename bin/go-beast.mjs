#!/usr/bin/env node

const args = process.argv.slice(2)
if (args[0] !== 'workflow') {
  console.error('Usage: go-beast workflow <validate|start|status|resume|begin|complete> [options]')
  process.exit(2)
}

process.argv = [process.argv[0], process.argv[1], ...args.slice(1)]
await import('../scripts/workflow.mjs')

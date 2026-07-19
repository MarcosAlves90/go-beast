#!/usr/bin/env node

import process from 'node:process'
import { isConventionalCommit } from './conventional-commit.mjs'

const title = process.argv.slice(2).join(' ')

if (!isConventionalCommit(title)) {
  console.error(`Invalid pull request title: ${title || '(empty)'}`)
  console.error('Expected: type(scope)!: summary, with an optional scope and breaking marker.')
  process.exit(1)
}

console.log(`Valid pull request title: ${title}`)

#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const REPO = path.resolve(import.meta.dirname, '..')
const SKILLS_DIR = path.join(REPO, 'plugins', 'go-beast', 'skills')

function normalizeLinkTarget(targetPath) {
  return path.normalize(targetPath).replace(/[/\\]+$/, '')
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function repoSkills(repoRoot) {
  return fs.readdirSync(repoRoot)
    .filter(name => name.startsWith('go-'))
    .filter(name => fs.existsSync(path.join(repoRoot, name, 'SKILL.md')))
    .sort()
}

function ensureSkillLink(skillName) {
  const src = path.join(REPO, skillName)
  const dst = path.join(SKILLS_DIR, skillName)

  try {
    const stat = fs.lstatSync(dst)
    if (stat.isSymbolicLink()) {
      const current = normalizeLinkTarget(path.resolve(SKILLS_DIR, fs.readlinkSync(dst)))
      const expected = normalizeLinkTarget(src)
      if (current === expected) return { skillName, status: 'skip' }
      fs.unlinkSync(dst)
    } else {
      throw new Error(`Destination exists and is not a symlink: ${dst}`)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const relative = path.relative(SKILLS_DIR, src)
  fs.symlinkSync(relative, dst, 'dir')
  return { skillName, status: 'new' }
}

function removeStaleLinks(validSkills) {
  const valid = new Set(validSkills)
  const removed = []

  if (!fs.existsSync(SKILLS_DIR)) return removed

  for (const entry of fs.readdirSync(SKILLS_DIR)) {
    const fullPath = path.join(SKILLS_DIR, entry)
    const stat = fs.lstatSync(fullPath)
    if (!stat.isSymbolicLink()) continue
    if (valid.has(entry)) continue

    const target = path.resolve(SKILLS_DIR, fs.readlinkSync(fullPath))
    if (normalizeLinkTarget(target).startsWith(normalizeLinkTarget(REPO))) {
      fs.unlinkSync(fullPath)
      removed.push(entry)
    }
  }

  return removed
}

function main() {
  ensureDir(SKILLS_DIR)
  const skills = repoSkills(REPO)
  const created = []
  const skipped = []

  for (const skillName of skills) {
    const result = ensureSkillLink(skillName)
    if (result.status === 'new') created.push(skillName)
    else skipped.push(skillName)
  }

  const removed = removeStaleLinks(skills)
  process.stdout.write(JSON.stringify({
    skills: skills.length,
    created,
    skipped,
    removed,
  }, null, 2) + '\n')
}

main()

const CONVENTIONAL_COMMIT_PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^()\r\n]+)\))?(?<breaking>!)?:\s+(?<description>\S(?:.*\S)?)$/

export function parseConventionalCommit(subject) {
  if (typeof subject !== 'string') return null
  const match = CONVENTIONAL_COMMIT_PATTERN.exec(subject)
  if (!match) return null
  return {
    type: match.groups.type,
    scope: match.groups.scope || '',
    breaking: Boolean(match.groups.breaking),
    description: match.groups.description,
  }
}

export function isConventionalCommit(subject) {
  return parseConventionalCommit(subject) !== null
}

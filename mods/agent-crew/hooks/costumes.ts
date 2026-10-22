import type { CrewMember } from '../types'
import type { Costume } from './sprites'

const COSTUMES: readonly Costume[] = [
  'captain',
  'explorer',
  'architect',
  'painter',
  'builder',
  'reviewer',
  'writer',
  'scientist',
  'helper',
]

// Checked in order; the first costume whose words appear in the agent's
// description or type wins. English and Italian stems.
const BUILT_IN: [Costume, RegExp][] = [
  ['reviewer', /\b(review|audit|verif|check|test|qa\b|lint|controll|revision)/],
  ['painter', /\b(design|ui\b|ux\b|css|style|visual|colou?r|illustr|artist|grafic|disegn|layout)/],
  ['architect', /\b(plan|architect|pianific|progett|blueprint|schema)/],
  ['explorer', /\b(explor|search|find|look|locat|scout|cerca|trova|esplor)/],
  ['scientist', /\b(research|analy[sz]|data\b|investig|benchmark|measur|ricerc|analizz|dati\b|misur)/],
  ['writer', /\b(doc|write|writing|readme|translat|summar|copy|scriv|tradu|riassu|testo)/],
  ['builder', /\b(implement|build|fix|refactor|code|migrat|install|setup|costru|corregg|sistem|implementa)/],
]

const BY_TYPE: Record<string, Costume> = {
  explore: 'explorer',
  plan: 'architect',
  'code-reviewer': 'reviewer',
  'statusline-setup': 'builder',
  'claude-code-guide': 'writer',
}

/** Parses 'wiki=writer, tesi=scientist' into rules; unknown costumes are dropped. */
export function parseRules(text: string): [string, Costume][] {
  return text
    .split(',')
    .map(pair => pair.split('=').map(s => s.trim().toLowerCase()))
    .filter(
      (pair): pair is [string, Costume] =>
        pair.length === 2 && (pair[0] ?? '').length > 0 && COSTUMES.includes(pair[1] as Costume),
    )
}

export function costumeOf(member: CrewMember, rules: [string, Costume][]): Costume {
  if (member.id === 'main') return 'captain'
  const text = `${member.label} ${member.type}`.toLowerCase()
  for (const [word, costume] of rules) {
    if (text.includes(word)) return costume
  }
  const byType = BY_TYPE[member.type.toLowerCase()]
  if (byType !== undefined) return byType
  for (const [costume, pattern] of BUILT_IN) {
    if (pattern.test(text)) return costume
  }
  return 'helper'
}

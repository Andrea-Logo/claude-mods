// The judge's prompt and the reading of its answer. The judge is one plain
// completion on a cheap model: it sees the task and each lane's diff, never
// the session's transcript.

/** How much of each diff the judge reads. */
export const DIFF_SAMPLE = 6000

export type Entry = { index: number; diff: string }

export const SYSTEM = [
  'You judge an arena: several coding agents did the same task, each on its own branch.',
  'Pick the change that best does the task: correct first, then complete, then clear and small.',
  'Answer in exactly two lines and nothing else:',
  'WINNER: <the number of the best variant>',
  'REASON: <one or two short sentences>',
].join('\n')

export function judgePrompt(task: string, entries: readonly Entry[], language: 'en' | 'it'): string {
  const parts = [`Task: ${task}`, '']
  for (const entry of entries) {
    const diff = entry.diff.length > DIFF_SAMPLE ? `${entry.diff.slice(0, DIFF_SAMPLE)}\n[... diff cut ...]` : entry.diff
    parts.push(`Variant ${entry.index} diff:`, '```diff', diff || '(no changes)', '```', '')
  }
  parts.push(language === 'it' ? 'Write the REASON line in Italian.' : 'Write the REASON line in English.')
  return parts.join('\n')
}

/** The winner and reason in the judge's reply, if it named one of the lanes. */
export function readVerdict(text: string, lanes: readonly number[]): { winner: number; reason: string } | undefined {
  const winner = /WINNER:\s*(?:variant\s*)?(\d+)/i.exec(text)?.[1]
  const index = winner === undefined ? NaN : Number(winner)
  if (!lanes.includes(index)) return undefined
  const reason = /REASON:\s*([\s\S]+)/i.exec(text)?.[1]?.trim() ?? ''
  return { winner: index, reason: reason.split('\n')[0]?.trim() ?? '' }
}

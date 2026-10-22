import type { LaneStatus } from '../types'

export type Lang = 'en' | 'it'

export type Words = {
  title: string
  lane: (n: number) => string
  status: Record<LaneStatus, string>
  steps: (n: number) => string
  tokens: string
  total: string
  noBout: string
  usage: string
  busy: string
  notRepo: (folder: string, detail: string) => string
  noCommit: string
  started: (n: number) => string
  failedStart: (detail: string) => string
  discard: string
  discarded: string
  noChanges: string
  notShown: string
  judge: string
  judgeThinking: string
  judgeFailed: string
  onlyOne: (n: number) => string
  nothingToKeep: string
  recommended: string
  choose: (n: number) => string
  merged: (n: number, branch: string) => string
  wrongBranch: (base: string, current: string) => string
  dirty: string
  conflict: (detail: string) => string
  close: string
  quieted: string
}

const EN: Words = {
  title: 'Arena',
  lane: n => `Variant ${n}`,
  status: { starting: 'starting', running: 'working', done: 'done', failed: 'failed' },
  steps: n => (n === 1 ? '1 step' : `${n} steps`),
  tokens: 'tokens',
  total: 'total',
  noBout: 'No bout yet. Start one with /arena <task>.',
  usage: 'Usage: /arena [--repo <path>] <task>, e.g. /arena write a function that reverses a string',
  busy: 'A bout is still running: wait for it to finish, or discard it from the Arena pane.',
  notRepo: (folder, detail) =>
    `Arena needs a git repository, and ${folder} is not inside one (git said: ${detail || 'nothing'}). Name one with /arena --repo <path> <task>.`,
  noCommit: 'Arena needs at least one commit to start from.',
  started: n => `Arena started: ${n} variants are working, each in its own worktree.`,
  failedStart: detail => `Arena could not start: ${detail}`,
  discard: 'Discard bout',
  discarded: 'Bout discarded: worktrees and branches removed.',
  noChanges: 'no changes',
  notShown: 'The Arena pane could not be shown here: this surface draws no pane right now.',
  judge: 'Judge',
  judgeThinking: 'comparing the two changes…',
  judgeFailed: 'could not judge this time: pick a variant yourself.',
  onlyOne: n => `only variant ${n} finished with changes, so it is the one to keep.`,
  nothingToKeep: 'no variant left changes to keep.',
  recommended: 'recommended',
  choose: n => `Keep variant ${n}`,
  merged: (n, branch) => `Variant ${n} merged into ${branch}; worktrees and branches removed.`,
  wrongBranch: (base, current) => `Not merged: the repository is on ${current || 'another branch'}, not on ${base}. Switch back to ${base} and pick again.`,
  dirty: 'Not merged: the repository has uncommitted changes. Commit or stash them, then pick again.',
  conflict: detail => `Not merged: git could not merge the change cleanly${detail ? ` (${detail})` : ''}. The merge was undone; nothing changed.`,
  close: 'Close',
  quieted: 'arena: a variant finished; its result is in the Arena pane.',
}

const IT: Words = {
  title: 'Arena',
  lane: n => `Variante ${n}`,
  status: { starting: 'in partenza', running: 'al lavoro', done: 'finita', failed: 'fallita' },
  steps: n => (n === 1 ? '1 passo' : `${n} passi`),
  tokens: 'token',
  total: 'totale',
  noBout: 'Ancora nessuna sfida. Avviala con /arena <compito>.',
  usage: 'Uso: /arena [--repo <percorso>] <compito>, per esempio /arena scrivi una funzione che inverte una stringa',
  busy: 'Una sfida è ancora in corso: aspetta che finisca, oppure scartala dal pannello Arena.',
  notRepo: (folder, detail) =>
    `Arena ha bisogno di un repository git, e ${folder} non è dentro un repository (git ha risposto: ${detail || 'niente'}). Indicane uno con /arena --repo <percorso> <compito>.`,
  noCommit: 'Arena ha bisogno di almeno un commit da cui partire.',
  started: n => `Arena avviata: ${n} varianti al lavoro, ognuna nella sua copia (worktree).`,
  failedStart: detail => `Arena non è partita: ${detail}`,
  discard: 'Scarta la sfida',
  discarded: 'Sfida scartata: copie e branch rimossi.',
  noChanges: 'nessuna modifica',
  notShown: 'Il pannello Arena non si può mostrare qui: questa vista adesso non disegna pannelli.',
  judge: 'Giudice',
  judgeThinking: 'sta confrontando le due modifiche…',
  judgeFailed: 'questa volta non è riuscito a giudicare: scegli tu una variante.',
  onlyOne: n => `solo la variante ${n} ha finito con delle modifiche, quindi è quella da tenere.`,
  nothingToKeep: 'nessuna variante ha lasciato modifiche da tenere.',
  recommended: 'consigliata',
  choose: n => `Tieni la variante ${n}`,
  merged: (n, branch) => `Variante ${n} unita in ${branch}; copie e branch rimossi.`,
  wrongBranch: (base, current) => `Non unita: il repository è su ${current || 'un altro branch'}, non su ${base}. Torna su ${base} e scegli di nuovo.`,
  dirty: 'Non unita: nel repository ci sono modifiche non salvate (commit). Salvale o mettile da parte, poi scegli di nuovo.',
  conflict: detail => `Non unita: git non è riuscito a unire la modifica senza conflitti${detail ? ` (${detail})` : ''}. L'unione è stata annullata; non è cambiato niente.`,
  close: 'Chiudi',
  quieted: 'arena: una variante ha finito; il risultato è nel pannello Arena.',
}

export function words(lang: Lang): Words {
  return lang === 'it' ? IT : EN
}

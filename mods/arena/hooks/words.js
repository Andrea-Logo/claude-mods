const EN = {
    title: 'Arena',
    lane: n => `Variant ${n}`,
    status: { starting: 'starting', running: 'working', done: 'done', failed: 'failed' },
    steps: n => (n === 1 ? '1 step' : `${n} steps`),
    tokens: 'tokens',
    total: 'total',
    noBout: 'No bout yet. Start one with /arena <task>.',
    usage: 'Usage: /arena <task>, e.g. /arena write a function that reverses a string',
    busy: 'A bout is still running: wait for it to finish, or discard it from the Arena pane.',
    notRepo: 'Arena needs a git repository: the session is not inside one.',
    noCommit: 'Arena needs at least one commit to start from.',
    started: n => `Arena started: ${n} variants are working, each in its own worktree.`,
    failedStart: detail => `Arena could not start: ${detail}`,
    discard: 'Discard bout',
    discarded: 'Bout discarded: worktrees and branches removed.',
    noChanges: 'no changes',
};
const IT = {
    title: 'Arena',
    lane: n => `Variante ${n}`,
    status: { starting: 'in partenza', running: 'al lavoro', done: 'finita', failed: 'fallita' },
    steps: n => (n === 1 ? '1 passo' : `${n} passi`),
    tokens: 'token',
    total: 'totale',
    noBout: 'Ancora nessuna sfida. Avviala con /arena <compito>.',
    usage: 'Uso: /arena <compito>, per esempio /arena scrivi una funzione che inverte una stringa',
    busy: 'Una sfida è ancora in corso: aspetta che finisca, oppure scartala dal pannello Arena.',
    notRepo: 'Arena ha bisogno di un repository git: la sessione non è dentro un repository.',
    noCommit: 'Arena ha bisogno di almeno un commit da cui partire.',
    started: n => `Arena avviata: ${n} varianti al lavoro, ognuna nella sua copia (worktree).`,
    failedStart: detail => `Arena non è partita: ${detail}`,
    discard: 'Scarta la sfida',
    discarded: 'Sfida scartata: copie e branch rimossi.',
    noChanges: 'nessuna modifica',
};
export function words(lang) {
    return lang === 'it' ? IT : EN;
}

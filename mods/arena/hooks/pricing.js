const PRICES = [
    ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
    ['claude-mythos-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
    ['claude-fable-5', { input: 10, output: 50, cacheRead: 1 }],
    ['claude-mythos-5', { input: 10, output: 50, cacheRead: 1 }],
    ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
    ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5 }],
    ['claude-opus-4', { input: 5, output: 25, cacheRead: 0.5 }],
    ['claude-sonnet-5-5', { input: 2, output: 10, cacheRead: 0.2 }],
    ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
    ['claude-sonnet-4', { input: 3, output: 15, cacheRead: 0.3 }],
    ['claude-haiku-5-5', { input: 0.1, output: 0.5, cacheRead: 0.01 }],
    ['claude-haiku-4', { input: 1, output: 5, cacheRead: 0.1 }],
];
const ALIASES = {
    fable: 'claude-fable-5-1',
    opus: 'claude-opus-5-5',
    sonnet: 'claude-sonnet-5-5',
    haiku: 'claude-haiku-5-5',
};
/** A model id as the API or a setting spells it, made comparable. */
export function normalizeModel(model) {
    const bare = model
        .toLowerCase()
        .replace(/\[[^\]]*\]$/, '')
        .replace(/^(us\.|eu\.|global\.)?anthropic\./, '')
        .replace(/@.*$/, '');
    return ALIASES[bare] ?? bare;
}
function priceOf(model) {
    const id = normalizeModel(model);
    return PRICES.find(([prefix]) => id.startsWith(prefix))?.[1];
}
/** Dollars for one response's tokens; 0 for a model not in the table. */
export function costOf(model, t) {
    const p = priceOf(model);
    if (p === undefined)
        return 0;
    return ((t.input * p.input +
        t.output * p.output +
        t.cacheRead * p.cacheRead +
        t.cacheWrite * p.input * 1.25) /
        1_000_000);
}
/** 'claude-opus-5-5' -> 'Opus 5.5'; anything else as given. */
export function modelName(model) {
    const id = normalizeModel(model);
    const m = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(id);
    if (m === null || m[1] === undefined)
        return model;
    const family = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return m[3] === undefined ? `${family} ${m[2]}` : `${family} ${m[2]}.${m[3]}`;
}

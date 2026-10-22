import type { CrewStatus } from '../types'
import type { Costume } from './sprites'

export type Lang = 'en' | 'it'

type Words = {
  title: string
  empty: string
  working: (n: number) => string
  estimate: string
  session: string
  clear: string
  steps: (n: number) => string
  tools: (n: number) => string
  tokens: string
  cache: string
  thinking: string
  status: Record<CrewStatus, string>
  costume: Record<Costume, string>
  effort: Record<string, string>
  opened: string
}

const EN: Words = {
  title: 'Crew',
  empty: 'No agents yet.',
  working: n => (n === 1 ? '1 at work' : `${n} at work`),
  estimate: 'estimated',
  session: 'session (/cost)',
  clear: 'Clear finished',
  steps: n => (n === 1 ? '1 step' : `${n} steps`),
  tools: n => (n === 1 ? '1 tool' : `${n} tools`),
  tokens: 'tokens',
  cache: 'cache',
  thinking: 'thinking…',
  status: {
    pending: 'queued',
    running: 'working',
    waiting: 'waiting',
    idle: 'idle',
    completed: 'done',
    failed: 'failed',
    killed: 'stopped',
  },
  costume: {
    captain: 'captain',
    explorer: 'explorer',
    architect: 'architect',
    painter: 'painter',
    builder: 'builder',
    reviewer: 'reviewer',
    writer: 'writer',
    scientist: 'scientist',
    helper: 'helper',
  },
  effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  opened: 'Crew pane opened.',
}

const IT: Words = {
  title: 'Ciurma',
  empty: 'Ancora nessun agente.',
  working: n => (n === 1 ? '1 al lavoro' : `${n} al lavoro`),
  estimate: 'stimati',
  session: 'sessione (/cost)',
  clear: 'Togli i finiti',
  steps: n => (n === 1 ? '1 passo' : `${n} passi`),
  tools: n => (n === 1 ? '1 strumento' : `${n} strumenti`),
  tokens: 'token',
  cache: 'cache',
  thinking: 'pensa…',
  status: {
    pending: 'in coda',
    running: 'al lavoro',
    waiting: 'in attesa',
    idle: 'a riposo',
    completed: 'finito',
    failed: 'fallito',
    killed: 'fermato',
  },
  costume: {
    captain: 'capitano',
    explorer: 'esploratore',
    architect: 'architetto',
    painter: 'pittore',
    builder: 'costruttore',
    reviewer: 'revisore',
    writer: 'scrittore',
    scientist: 'scienziato',
    helper: 'aiutante',
  },
  effort: { low: 'basso', medium: 'medio', high: 'alto', xhigh: 'molto alto', max: 'massimo' },
  opened: 'Pannello della ciurma aperto.',
}

export function words(lang: Lang): Words {
  return lang === 'it' ? IT : EN
}

type ToolInput = Record<string, unknown>

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function short(text: string, max = 40): string {
  const line = (text.split('\n')[0] ?? '').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function base(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function host(url: string): string {
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(url)
  return m?.[1] ?? short(url)
}

/** What a tool call is doing, in a few words. */
export function activityOf(lang: Lang, tool: string, input: ToolInput): string {
  const it = lang === 'it'
  const file = str(input, 'file_path') ?? str(input, 'notebook_path') ?? str(input, 'path')
  switch (tool) {
    case 'Read':
      return file ? `${it ? 'legge' : 'reads'} ${base(file)}` : it ? 'legge un file' : 'reads a file'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return file ? `${it ? 'modifica' : 'edits'} ${base(file)}` : it ? 'modifica un file' : 'edits a file'
    case 'Write':
      return file ? `${it ? 'scrive' : 'writes'} ${base(file)}` : it ? 'scrive un file' : 'writes a file'
    case 'Bash': {
      const cmd = str(input, 'description') ?? str(input, 'command')
      return cmd ? `${it ? 'esegue' : 'runs'}: ${short(cmd)}` : it ? 'esegue un comando' : 'runs a command'
    }
    case 'Grep':
    case 'Glob': {
      const pattern = str(input, 'pattern')
      return pattern ? `${it ? 'cerca' : 'searches'} "${short(pattern, 30)}"` : it ? 'cerca nei file' : 'searches files'
    }
    case 'WebSearch': {
      const q = str(input, 'query')
      return q ? `${it ? 'cerca sul web' : 'searches the web'}: ${short(q, 30)}` : it ? 'cerca sul web' : 'searches the web'
    }
    case 'WebFetch': {
      const url = str(input, 'url')
      return url ? `${it ? 'legge' : 'reads'} ${host(url)}` : it ? 'legge una pagina web' : 'reads a web page'
    }
    case 'Agent':
    case 'Task': {
      const d = str(input, 'description')
      return d ? `${it ? 'affida' : 'delegates'}: ${short(d, 30)}` : it ? 'affida un compito' : 'delegates a task'
    }
    case 'AskUserQuestion':
      return it ? 'ti fa una domanda' : 'asks you a question'
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TodoWrite':
      return it ? 'aggiorna la lista dei compiti' : 'updates the task list'
    default:
      return `${it ? 'usa' : 'uses'} ${tool.replace(/^mcp__/, '').replace(/__/g, ' › ')}`
  }
}

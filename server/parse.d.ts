export type CueParseResult = {
  status: number
  body: unknown
}

export function parseCueItem(options: {
  apiKey?: string
  model?: string
  input?: unknown
  now?: unknown
  timeZone?: unknown
}): Promise<CueParseResult>

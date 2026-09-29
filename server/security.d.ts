export type CueAccessAllowed = {
  ok: true
  userId: string
  isAdmin: boolean
  headers: Record<string, string>
}

export type CueAccessDenied = {
  ok: false
  status: number
  body: { error: string }
  headers: Record<string, string>
}

export function authorizeAiRequest(options: {
  authorization?: string | string[]
  clientIp?: string
  env?: Record<string, string | undefined>
}): Promise<CueAccessAllowed | CueAccessDenied>

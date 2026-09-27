const schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    kind: { type: 'string', enum: ['task', 'event'] },
    dueAt: { type: ['string', 'null'] },
    scheduledAt: { type: ['string', 'null'] },
    durationMinutes: { type: ['integer', 'null'], minimum: 1 },
    flexibility: { type: 'string', enum: ['flexible', 'hard'] },
    recurrence: {
      anyOf: [
        {
          type: 'object',
          properties: {
            interval: { type: 'integer', minimum: 1 },
            unit: { type: 'string', enum: ['day', 'week', 'month'] },
            daysOfWeek: {
              type: 'array',
              items: { type: 'integer', minimum: 0, maximum: 6 },
            },
            mode: { type: 'string', enum: ['schedule', 'after_completion'] },
          },
          required: ['interval', 'unit', 'daysOfWeek', 'mode'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
  },
  required: [
    'title',
    'kind',
    'dueAt',
    'scheduledAt',
    'durationMinutes',
    'flexibility',
    'recurrence',
  ],
  additionalProperties: false,
}

function makePrompt(now, timeZone) {
  return `Parse one short entry for Cue, a minimal personal task list.
Current datetime: ${now}
IANA timezone: ${timeZone}

Rules:
- Return only the structured object requested by the schema.
- Keep title concise and remove date, time, duration, and recurrence wording when that wording is only metadata.
- kind=event only when the user must do or attend something at a specific clock time, such as a meeting, appointment, class, call, flight, practice, reservation, or similar commitment.
- scheduledAt is only for fixed-time events. Otherwise scheduledAt=null.
- dueAt is for task deadlines or target dates. Otherwise dueAt=null.
- Resolve relative dates from the supplied current datetime in the supplied timezone.
- If a task has a date but no explicit time, use 5:00 PM local time for dueAt.
- Do not invent a duration.
- A fixed-time event is always flexibility=hard.
- Recurrence is null unless repetition is explicit.
- recurrence.daysOfWeek uses 0=Sunday through 6=Saturday.
- recurrence.mode=after_completion only for wording like "after I do it", "after completion", or "X days after I last do it". Otherwise use schedule.
- Do not invent any date, time, recurrence, or duration the user did not imply.`
}

export async function parseCueItem({
  apiKey,
  model = 'gpt-6-luna',
  input,
  now = new Date().toISOString(),
  timeZone = 'UTC',
}) {
  if (!apiKey) {
    return { status: 503, body: { error: 'AI is not configured' } }
  }

  const cleanInput = typeof input === 'string' ? input.trim() : ''
  const cleanNow = typeof now === 'string' ? now : new Date().toISOString()
  const cleanTimeZone = typeof timeZone === 'string' ? timeZone : 'UTC'

  if (!cleanInput || cleanInput.length > 500) {
    return { status: 400, body: { error: 'Invalid input' } }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: 'none' },
        store: false,
        max_output_tokens: 450,
        input: [
          { role: 'system', content: makePrompt(cleanNow, cleanTimeZone) },
          { role: 'user', content: cleanInput },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'cue_item',
            strict: true,
            schema,
          },
        },
      }),
    })

    if (!response.ok) {
      const details = await response.text()
      console.error('OpenAI parse failed:', response.status, details.slice(0, 500))
      return { status: 502, body: { error: 'AI parse failed' } }
    }

    const data = await response.json()
    const outputText = data.output_text || data.output
      ?.flatMap((item) => item.content || [])
      .find((part) => part.type === 'output_text')
      ?.text

    if (!outputText) {
      return { status: 502, body: { error: 'Empty AI response' } }
    }

    return { status: 200, body: JSON.parse(outputText) }
  } catch (error) {
    console.error('Cue parse error:', error)
    return { status: 500, body: { error: 'AI parse failed' } }
  }
}

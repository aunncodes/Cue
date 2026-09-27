# Cue

A small task list style list of things to do.

## Local development

Install dependencies:

```
npm install
```

Copy the local environment file:

```
cp .env.example .env.local
```

Put your OpenAI API key in `.env.local`:

```
OPENAI_API_KEY=sk-...
CUE_AI_MODEL=gpt-6-luna
```

Then run:

```
npm run dev
```
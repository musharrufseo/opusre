# Puter Advanced AI Chat

A modern, real-time multi-model AI chat interface powered by **[Puter.js](https://developer.puter.com)**.

No backend. No API keys. Users cover their own AI usage (User-Pays model).

![License](https://img.shields.io/badge/license-MIT-blue)
![Puter.js](https://img.shields.io/badge/Puter.js-v2-38bdf8)

## Features

| Feature | Description |
|--------|-------------|
| **Streaming** | Live token-by-token responses via `puter.ai.chat(..., { stream: true })` |
| **Multi-model** | Claude Opus 5.5, GPT-5.5, Gemini, Grok, DeepSeek, and 500+ models |
| **Live model list** | Refresh models with `puter.ai.listModels()` |
| **Conversation history** | Saved in `localStorage`, sidebar navigation |
| **Vision / images** | Attach images for multimodal models |
| **System prompt** | Custom system instructions in Settings |
| **Temperature & max tokens** | Tunable generation parameters |
| **TTS** | Read last reply aloud with `puter.ai.txt2speech()` |
| **Export** | Download conversation as Markdown |
| **Themes** | Dark / light mode |
| **Responsive** | Works on desktop and mobile |
| **Keyboard** | `Enter` send · `Shift+Enter` newline · `Ctrl/Cmd+N` new chat · `Esc` close settings |

## Quick start

### Option A — open locally (recommended with a static server)

```bash
git clone https://github.com/YOUR_USERNAME/puter-advanced-ai-chat.git
cd puter-advanced-ai-chat

# Any static server, e.g.:
npx serve .
# or: python -m http.server 8080
```

Open the URL shown (e.g. `http://localhost:3000`).  
**Do not open `index.html` via `file://`** — Puter.js requires a proper origin.

### Option B — deploy on Puter / any static host

Upload the three files (`index.html`, `styles.css`, `app.js`) to any static host, GitHub Pages, Netlify, Cloudflare Pages, or host via [Puter Hosting API](https://docs.puter.com/Hosting/).

## Project structure

```
puter-advanced-ai-chat/
├── index.html    # Shell + Puter.js CDN
├── styles.css    # Dark-first responsive UI
├── app.js        # Chat logic, streaming, history, TTS
└── README.md
```

## How it works

```js
// Streaming example (core of the app)
const resp = await puter.ai.chat(messages, {
  model: "anthropic/claude-opus-5-5",
  stream: true,
  normalize: true,
  temperature: 0.7,
});

for await (const part of resp) {
  // part.text grows the reply in real time
  updateUI(part.text);
}
```

- **Auth & billing**: Puter handles sign-in and metering. First AI call may prompt the user to sign in / accept usage.
- **No keys**: You never ship OpenAI/Anthropic/etc. secrets.

## Configuration

Open **Settings** in the sidebar:

- Temperature (0–2)
- Max tokens (optional)
- System prompt
- Normalize responses (OpenAI-style `message.content`)
- Save history to `localStorage`
- Custom model ID (add any model string Puter supports)

## Supported models (examples)

Defaults in the selector:

- `anthropic/claude-opus-5-5`
- `openai/gpt-5.5`
- `google/gemini-3.8-flash`
- `xai/grok-4.7`
- `deepseek/deepseek-v4-pro`
- `openai/gpt-5.4-nano`
- `anthropic/claude-sonnet-5-5`

Click **↻** to pull the live list from `puter.ai.listModels()`.  
Full directory: [developer.puter.com/ai/models](https://developer.puter.com/ai/models/)

## Extending

Ideas that fit cleanly on top of this codebase:

1. **Cloud history** — replace `localStorage` with `puter.kv` or `puter.fs`
2. **Peer collab** — share a session with `puter.peer`
3. **Tools / function calling** — pass `tools: [...]` into `puter.ai.chat`
4. **Image generation** — call `puter.ai.txt2img()` and insert the result into the thread
5. **Web search tool** — `{ tools: [{ type: "web_search" }] }` (see Puter docs)

## License

MIT — use freely in personal and commercial projects.

## Links

- [Puter.js docs](https://docs.puter.com)
- [AI chat API](https://docs.puter.com/AI/chat/)
- [Developer portal](https://developer.puter.com)
- [User-Pays model](https://docs.puter.com/user-pays-model/)

---

Built for maximum updatability: vanilla JS, no build step, single CDN script. Fork, tweak, ship.

# AI TA — AI Teaching Assistant

A modern, Gemini-powered teaching assistant for a web development course. Ask anything about HTML, CSS, JavaScript or programming in general and get clear, step-by-step answers with code examples — streamed live into a polished chat interface.

**Live app:** deployable to Vercel in one click (see below).

## Features

- 💬 **Streaming chat UI** — responses render live, with full Markdown, syntax-highlighted code blocks and copy buttons
- 🗂️ **Chat history** — conversations are saved locally in your browser, with a sidebar to switch between them
- 🔑 **Bring your own key** — enter your own free Gemini API key in Settings (stored only in your browser, sent directly to Google), or use the site's built-in key if the deployment has one configured
- 🤖 **Model picker** — Gemini 2.5 Flash / 2.5 Pro / 2.0 Flash / 2.0 Flash Lite
- 📚 **Course-aware answers (RAG)** — ship your course transcripts as an embedded search index and the assistant answers "where is X taught?" with the exact video number and time range, plus source chips under each answer
- 📝 **Course notes** — or simply paste lecture notes in Settings and the assistant will use them
- 🌗 **Dark & light themes**, fully responsive (mobile sidebar, safe-area aware)
- ⏹️ Stop generation, regenerate answers, suggestion cards to get started

## How it works

```
public/          Static frontend (vanilla JS, no build step)
api/chat.js      Vercel Edge Function — proxies Gemini chat using the
                 server-side GEMINI_API_KEY so the key never ships
                 to the client
api/embed.js     Edge Function — embeds search queries for course RAG
build_web_index.py  Builds public/data/index.json from your transcripts
```

- If you saved **your own API key** in Settings, the browser calls the Gemini API **directly** — your key never touches the server.
- Otherwise the frontend calls `/api/chat`, which uses the `GEMINI_API_KEY` environment variable configured on Vercel.

## Make it answer from YOUR course (RAG)

By default the assistant answers from Gemini's general knowledge. To make it answer from your actual course videos ("Flexbox is taught in Video 16 (00:00 - 02:40)"):

```bash
# 1. Generate transcripts (one-time, requires FFmpeg + Whisper — see below)
python video_to_mp3.py
python mp3_to_json.py

# 2. Build the web search index (needs GEMINI_API_KEY in .env)
python build_web_index.py

# 3. Ship it
git add public/data/index.json
git commit -m "Add course search index"
git push
```

The script embeds every transcript chunk with `gemini-embedding-001` and writes a compact `public/data/index.json`. The frontend detects it automatically: a "📚 Course data" badge appears, each question is matched against the transcripts client-side, and answers cite video numbers and timestamps with source chips underneath. No index file → the app quietly runs in general mode.

## Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository. The defaults are fine — no build command needed.
3. *(Optional but recommended)* In **Project Settings → Environment Variables**, add:
   - `GEMINI_API_KEY` = your Gemini API key ([get one free](https://aistudio.google.com/apikey))

   With this set, visitors can chat without entering a key. Without it, each visitor adds their own key in Settings.
4. Deploy. Done 🎉

## Run locally

The frontend is plain static files:

```bash
# from the repo root
python -m http.server 5173 --directory public
# open http://localhost:5173 and add your API key in Settings
```

Or with the full serverless setup (uses `.env` — copy `.env.example` to `.env` and fill in your key):

```bash
npm i -g vercel
vercel dev
```

---

## Local RAG pipeline (original project)

This repo also contains the original fully-local retrieval pipeline that answers questions from **course video transcripts** using FAISS + Ollama + Whisper.

### Requirements

- Python, FFmpeg
- Ollama with the `bge-m3` (embeddings) and `llama3.2` (generation) models

```bash
pip install -r requirements.txt
```

### Steps

```bash
# 1. Put course videos in rag_videos/
python video_to_mp3.py        # 2. Convert videos to MP3 (audios/)
python mp3_to_json.py         # 3. Transcribe with Whisper (jsons/)
python json_preprocessing.py  # 4. Build the FAISS index
python app.py                 # 5. Flask app at http://localhost:5000
```

The Flask app retrieves the most relevant transcript chunks and answers with the exact video number and time range, e.g. *"CSS is introduced in Video 14 (02:10 - 05:45)."*

### Folder guide

| Folder | Purpose |
|---|---|
| `public/` | Web app frontend (deployed to Vercel) |
| `api/` | Vercel Edge Function (Gemini proxy) |
| `rag_videos/` | Source video files (local pipeline) |
| `audios/` | Generated MP3 files |
| `jsons/` | Generated transcripts |
| `templates/`, `static/` | Flask app UI (local pipeline) |

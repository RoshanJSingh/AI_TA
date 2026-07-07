# AI TA — AI Teaching Assistant

A modern, Gemini-powered teaching assistant for a web development course. Ask anything about HTML, CSS, JavaScript or programming in general and get clear, step-by-step answers with code examples — streamed live into a polished chat interface.

**Live app:** deployable to Vercel in one click (see below).

## Features

- 💬 **Streaming chat UI** — responses render live, with full Markdown, syntax-highlighted code blocks and copy buttons
- 🗂️ **Chat history** — conversations are saved locally in your browser, with a sidebar to switch between them
- 🔑 **Bring your own key** — enter your own free Gemini API key in Settings (stored only in your browser, sent directly to Google), or use the site's built-in key if the deployment has one configured
- 🤖 **Model picker** — Gemini 2.5 Flash / 2.5 Pro / 2.0 Flash / 2.0 Flash Lite
- 📚 **Course notes** — paste lecture notes or transcripts in Settings and the assistant will use them when answering questions about your course
- 🌗 **Dark & light themes**, fully responsive (mobile sidebar, safe-area aware)
- ⏹️ Stop generation, regenerate answers, suggestion cards to get started

## How it works

```
public/          Static frontend (vanilla JS, no build step)
api/chat.js      Vercel Edge Function — proxies Gemini using the
                 server-side GEMINI_API_KEY so the key never ships
                 to the client
```

- If you saved **your own API key** in Settings, the browser calls the Gemini API **directly** — your key never touches the server.
- Otherwise the frontend calls `/api/chat`, which uses the `GEMINI_API_KEY` environment variable configured on Vercel.

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

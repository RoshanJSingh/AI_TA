# AI Teaching Assistant

This project is a simple retrieval-based teaching assistant for a web development course. It uses course transcripts to find the most relevant video parts and then generates a short answer with the video number and time range.

## Project Summary

The app works in four steps:

1. Convert course videos to MP3 files.
2. Transcribe the audio files into JSON files.
3. Create embeddings from the transcript chunks and store them in a FAISS index.
4. Run a Flask app that answers questions by searching the transcript data and asking a local language model to write the final response.

## Main Tools

- Python
- Flask
- FAISS
- Ollama
- OpenAI Whisper
- FFmpeg

## Folder Use

- `rag_videos/`: source video files
- `audios/`: generated MP3 files
- `jsons/`: generated transcript files
- `templates/`: HTML template
- `static/`: CSS file

## Requirements

Before you run the project, make sure these tools are available:

- Python
- FFmpeg
- Ollama with the `bge-m3` embedding model
- Ollama with the `llama3.2` model

Install Python packages with:

```bash
pip install -r requirements.txt
```

## How To Run

### 1. Add course videos

Place your course videos in the `rag_videos/` folder.

### 2. Convert videos to audio

Run:

```bash
python video_to_mp3.py
```

### 3. Transcribe audio files

Run:

```bash
python mp3_to_json.py
```

### 4. Build the search index

Run:

```bash
python json_preprocessing.py
```

This creates the FAISS index and metadata files used by the app.

### 5. Start the web app

Run:

```bash
python app.py
```

Then open:

```text
http://localhost:5000
```

## Example Question

Question:

```text
When is CSS taught in this course?
```

Expected answer style:

```text
CSS is introduced in Video 14. See Video 14 (MM:SS - MM:SS) for the relevant section.
```

## Notes

- The project expects the local models and generated files to be ready before the app starts.
- The assistant only answers from the transcript data it can retrieve.

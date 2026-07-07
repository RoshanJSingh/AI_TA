"""Build the course search index used by the web app (public/data/index.json).

Reads the Whisper transcripts from jsons/, merges segments into ~30-60s
chunks, embeds them with the Gemini embedding API and writes a compact
JSON index that the frontend searches client-side.

Usage:
    1. Run the transcript pipeline first (video_to_mp3.py, mp3_to_json.py).
    2. Put your Gemini key in .env (GEMINI_API_KEY=...) or the environment.
    3. python build_web_index.py
    4. Commit public/data/index.json and push - the deployed site now
       answers course questions with video numbers and timestamps.
"""

import json
import math
import os
import time

import requests

EMBED_MODEL = "gemini-embedding-001"
EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{EMBED_MODEL}:batchEmbedContents"
)
EMBED_DIM = 256
GROUP_SIZE = 5  # transcript segments merged per chunk
BATCH_SIZE = 64
OUTPUT_PATH = os.path.join("public", "data", "index.json")


def load_api_key():
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    if os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(
        "No Gemini API key found. Set GEMINI_API_KEY in .env or the environment."
    )


def load_chunks():
    if not os.path.isdir("jsons"):
        raise SystemExit("No 'jsons' directory found. Run mp3_to_json.py first.")

    chunks = []
    for name in sorted(os.listdir("jsons")):
        if not name.endswith(".json"):
            continue
        with open(os.path.join("jsons", name), "r", encoding="utf-8") as file:
            data = json.load(file)

        segments = data.get("chunks") or []
        if not segments:
            continue

        group_count = math.ceil(len(segments) / GROUP_SIZE)
        for g in range(group_count):
            group = segments[g * GROUP_SIZE : (g + 1) * GROUP_SIZE]
            text = " ".join(seg["text"].strip() for seg in group).strip()
            if not text:
                continue
            chunks.append(
                {
                    "video": str(group[0]["vid_no"]),
                    "title": group[0]["vid_title"],
                    "start": round(float(group[0]["start"]), 1),
                    "end": round(float(group[-1]["end"]), 1),
                    "text": text,
                }
            )
        print(f"  {name}: {len(segments)} segments")

    if not chunks:
        raise SystemExit("No transcript chunks found in jsons/.")
    return chunks


def embed_batch(api_key, texts):
    body = {
        "requests": [
            {
                "model": f"models/{EMBED_MODEL}",
                "content": {"parts": [{"text": text}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": EMBED_DIM,
            }
            for text in texts
        ]
    }
    for attempt in range(4):
        response = requests.post(
            EMBED_URL,
            params={"key": api_key},
            json=body,
            timeout=120,
        )
        if response.status_code == 429:
            wait = 10 * (attempt + 1)
            print(f"  Rate limited, waiting {wait}s...")
            time.sleep(wait)
            continue
        response.raise_for_status()
        return [item["values"] for item in response.json()["embeddings"]]
    raise SystemExit("Still rate limited after several retries. Try again later.")


def normalize(vector):
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [round(v / norm, 4) for v in vector]


def main():
    api_key = load_api_key()

    print("Reading transcripts...")
    chunks = load_chunks()
    print(f"Merged into {len(chunks)} chunks. Embedding with {EMBED_MODEL}...")

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        embeddings = embed_batch(api_key, [c["text"] for c in batch])
        for chunk, embedding in zip(batch, embeddings):
            chunk["embedding"] = normalize(embedding)
        print(f"  Embedded {min(i + BATCH_SIZE, len(chunks))}/{len(chunks)}")

    videos = {}
    for chunk in chunks:
        videos.setdefault(chunk["video"], chunk["title"])

    def video_sort_key(number):
        return (0, int(number)) if number.isdigit() else (1, number)

    index = {
        "version": 1,
        "model": EMBED_MODEL,
        "dim": EMBED_DIM,
        "videos": [
            {"no": no, "title": videos[no]}
            for no in sorted(videos, key=video_sort_key)
        ],
        "chunks": chunks,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as file:
        json.dump(index, file, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(OUTPUT_PATH) / 1024 / 1024
    print(
        f"Wrote {OUTPUT_PATH} ({size_mb:.2f} MB, {len(chunks)} chunks, "
        f"{len(videos)} videos).\nCommit it and push to update the live site."
    )


if __name__ == "__main__":
    main()

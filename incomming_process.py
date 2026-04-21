import json
import os
import pickle

import faiss
import numpy as np
import requests

EMBEDDING_URL = "http://localhost:11434/api/embed"
GENERATION_URL = "http://localhost:11434/api/generate"
EMBEDDING_MODEL = "bge-m3"
GENERATION_MODEL = "llama3.2"

index = None
metadata = None


def load_resources():
    global index, metadata

    if index is None:
        if os.path.exists("vector_store.faiss"):
            print("Loading FAISS index...")
            index = faiss.read_index("vector_store.faiss")
        else:
            print("Warning: vector_store.faiss not found.")

    if metadata is None:
        if os.path.exists("metadata.pkl"):
            print("Loading metadata...")
            with open("metadata.pkl", "rb") as file:
                metadata = pickle.load(file)
        else:
            print("Warning: metadata.pkl not found.")


def create_embedding(text_list):
    try:
        response = requests.post(
            EMBEDDING_URL,
            json={"model": EMBEDDING_MODEL, "input": text_list},
            timeout=60,
        )
        response.raise_for_status()
        return response.json().get("embeddings", [])
    except requests.RequestException as error:
        print(f"Error generating embedding: {error}")
        return []


def generate_response(prompt):
    try:
        response = requests.post(
            GENERATION_URL,
            json={"model": GENERATION_MODEL, "prompt": prompt, "stream": False},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as error:
        print(f"Error generating response: {error}")
        return {"response": "The model service is not available right now."}


def build_prompt(query, context_data):
    return f"""You are answering questions about a web development course.
Use only the transcript data below.

Transcript data:
{json.dumps(context_data, indent=2)}

Question: "{query}"

Rules:
1. Answer only from the transcript data.
2. Include the exact video number and time range.
3. Format the time as "Video X (MM:SS - MM:SS)".
4. Keep the answer short and clear.
5. If the answer is not in the transcript data, say that clearly.
"""


def icopro(query):
    global index, metadata

    if index is None or metadata is None:
        load_resources()
        if index is None or metadata is None:
            return "The system is not ready. Run json_preprocessing.py first."

    print(f"Processing query: {query}")
    query_embedding = create_embedding([query])
    if not query_embedding:
        return "The query embedding could not be created."

    query_vector = np.array(query_embedding, dtype="float32")
    faiss.normalize_L2(query_vector)

    top_k = 5
    _, indices = index.search(query_vector, top_k)

    retrieved_chunks = []
    for item_index in indices[0]:
        if item_index < len(metadata):
            retrieved_chunks.append(metadata[item_index])

    context_data = []
    for chunk in retrieved_chunks:
        context_data.append(
            {
                "video_title": chunk.get("vid_title", "Unknown"),
                "video_number": chunk.get("vid_no", "Unknown"),
                "start_time": chunk.get("start", 0.0),
                "end_time": chunk.get("end", 0.0),
                "text": chunk.get("text", ""),
            }
        )

    prompt = build_prompt(query, context_data)
    response_data = generate_response(prompt)
    return response_data.get("response", "No response generated.")


load_resources()

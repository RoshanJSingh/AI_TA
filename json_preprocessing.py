import json
import os
import pickle

import faiss
import numpy as np
import requests

EMBEDDING_URL = "http://localhost:11434/api/embed"
EMBEDDING_MODEL = "bge-m3"

def create_embedding(text_list):
    response = requests.post(
        EMBEDDING_URL,
        json={"model": EMBEDDING_MODEL, "input": text_list},
        timeout=120,
    )
    response.raise_for_status()
    return response.json().get("embeddings", [])

def main():
    if not os.path.exists("jsons"):
        print("No 'jsons' directory found.")
        return

    json_files = os.listdir("jsons")
    all_chunks = []
    chunk_id = 0
    all_embeddings = []

    print("Processing JSON files...")
    for json_name in json_files:
        if not json_name.endswith(".json"):
            continue

        file_path = os.path.join("jsons", json_name)
        with open(file_path, "r", encoding="utf-8") as file:
            content = json.load(file)

        print(f"Creating embeddings for {json_name}...")
        texts = [chunk["text"] for chunk in content["chunks"]]
        if not texts:
            continue

        embeddings = create_embedding(texts)
        for index, chunk in enumerate(content["chunks"]):
            chunk["chunk_id"] = chunk_id
            chunk_id += 1
            all_chunks.append(chunk)
            all_embeddings.append(embeddings[index])

    if not all_embeddings:
        print("No embeddings generated.")
        return

    embeddings_array = np.array(all_embeddings, dtype="float32")
    print("Normalizing embeddings...")
    faiss.normalize_L2(embeddings_array)

    dimension = embeddings_array.shape[1]
    print(f"Creating FAISS index with dimension {dimension}...")
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings_array)

    print("Saving index and metadata...")
    faiss.write_index(index, "vector_store.faiss")
    with open("metadata.pkl", "wb") as file:
        pickle.dump(all_chunks, file)

    print(f"Successfully indexed {len(all_chunks)} chunks.")

if __name__ == "__main__":
    main()

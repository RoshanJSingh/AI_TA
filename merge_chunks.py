import json
import math
import os

GROUP_SIZE = 5


def main():
    os.makedirs("newjsons", exist_ok=True)

    for file_name in os.listdir("jsons"):
        if not file_name.endswith(".json"):
            continue

        file_path = os.path.join("jsons", file_name)
        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)

        if not data.get("chunks"):
            continue

        new_chunks = []
        chunk_count = len(data["chunks"])
        group_count = math.ceil(chunk_count / GROUP_SIZE)

        for group_index in range(group_count):
            start_index = group_index * GROUP_SIZE
            end_index = min((group_index + 1) * GROUP_SIZE, chunk_count)
            group = data["chunks"][start_index:end_index]

            new_chunks.append(
                {
                    "vid_no": data["chunks"][0]["vid_no"],
                    "vid_title": group[0]["vid_title"],
                    "start": group[0]["start"],
                    "end": group[-1]["end"],
                    "text": " ".join(chunk["text"] for chunk in group),
                }
            )

        output_path = os.path.join("newjsons", file_name)
        with open(output_path, "w", encoding="utf-8") as json_file:
            json.dump({"chunks": new_chunks, "text": data["text"]}, json_file, indent=4)


if __name__ == "__main__":
    main()

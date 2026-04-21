import json
import os
import torch
import whisper

device = "cuda" if torch.cuda.is_available() else "cpu"
model = whisper.load_model("large-v2").to(device)


def main():
    os.makedirs("jsons", exist_ok=True)

    for audio_name in os.listdir("audios"):
        if "_" not in audio_name:
            continue

        audio_path = os.path.join("audios", audio_name)
        result = model.transcribe(
            audio=audio_path,
            language="hi",
            task="translate",
            word_timestamps=False,
        )

        video_no, raw_title = audio_name.split("_", 1)
        title = raw_title[:-4]
        chunks = []

        for segment in result["segments"]:
            chunks.append(
                {
                    "vid_no": video_no,
                    "vid_title": title,
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"],
                }
            )

        output = {"chunks": chunks, "text": result["text"]}
        output_path = os.path.join("jsons", f"{video_no}_{title}.json")
        with open(output_path, "w", encoding="utf-8") as file:
            json.dump(output, file, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()


import os
import subprocess

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm"}


def main():
    os.makedirs("audios", exist_ok=True)

    for file_name in os.listdir("rag_videos"):
        _, extension = os.path.splitext(file_name)
        if extension.lower() not in VIDEO_EXTENSIONS:
            continue

        if " #" not in file_name or "[" not in file_name:
            print(f"Skipping file with unexpected name: {file_name}")
            continue

        tutorial_number = file_name.split(" #", 1)[1].split("[", 1)[0].strip()
        mp3_name = file_name.split(" #", 1)[0].strip()
        output_name = f"{tutorial_number}_{mp3_name}.mp3"
        print(output_name)
        subprocess.run(
            ["ffmpeg", "-i", os.path.join("rag_videos", file_name), os.path.join("audios", output_name)],
            check=False,
        )


if __name__ == "__main__":
    main()

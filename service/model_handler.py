import os
from pathlib import Path

import requests


MAGENTA_BASE_URL = os.getenv("MAGENTA_BASE_URL", "http://127.0.0.1:6006").rstrip("/")
REQUEST_TIMEOUT = int(os.getenv("MAGENTA_TIMEOUT", "600"))


def generate_audio(description: str, audio_path: str | None, duration: int) -> bytes:
    print(
        f"[remote_magenta] start duration={duration} "
        f"has_audio={audio_path is not None} base_url={MAGENTA_BASE_URL}"
    )

    if audio_path:
        with open(audio_path, "rb") as audio:
            response = requests.post(
                f"{MAGENTA_BASE_URL}/v1/generate/file",
                data={
                    "prompts": description,
                    "duration_seconds": str(float(duration)),
                    "injection_mix": "1.0",
                },
                files={
                    "audio_file": (Path(audio_path).name, audio, "audio/wav"),
                },
                timeout=REQUEST_TIMEOUT,
            )
    else:
        response = requests.post(
            f"{MAGENTA_BASE_URL}/v1/generate",
            json={
                "prompts": [description],
                "duration_seconds": float(duration),
            },
            timeout=REQUEST_TIMEOUT,
        )

    if not response.ok:
        print("[remote_magenta] failed", response.status_code, response.text[:1000])
        response.raise_for_status()

    print(f"[remote_magenta] completed bytes={len(response.content)}")
    return response.content

import json
import os
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from logging_utils import get_logger


logger = get_logger("model")

MAGENTA_BASE_URL = os.getenv("MAGENTA_BASE_URL", "http://127.0.0.1:6006").rstrip("/")
MAGENTA_TIMEOUT = float(os.getenv("MAGENTA_TIMEOUT", "600"))

MUSICGEN_BASE_URL = os.getenv("MUSICGEN_BASE_URL", "http://127.0.0.1:6008").rstrip("/")
MUSICGEN_TIMEOUT = float(os.getenv("MUSICGEN_TIMEOUT", "600"))


def _raise_for_status(exc: HTTPError) -> None:
    error_body = exc.read().decode("utf-8", errors="replace")
    logger.error(
        "[ERROR] remote_magenta.failed status=%s body=%s",
        exc.code,
        error_body[:1000],
    )
    raise RuntimeError(f"Remote Magenta request failed with status {exc.code}") from exc


def _post_json(path: str, payload: dict) -> bytes:
    data = json.dumps(payload).encode("utf-8")
    request = Request(
        f"{MAGENTA_BASE_URL}{path}",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "audio/wav,application/octet-stream,*/*",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=MAGENTA_TIMEOUT) as response:
            return response.read()
    except HTTPError as exc:
        _raise_for_status(exc)


def _encode_multipart(fields: dict[str, str], audio_path: str) -> tuple[bytes, str]:
    boundary = f"----musicgen-magenta-{uuid.uuid4().hex}"
    audio_file = Path(audio_path)
    body = bytearray()

    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8")
        )
        body.extend(value.encode("utf-8"))
        body.extend(b"\r\n")

    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(
        (
            f'Content-Disposition: form-data; name="audio_file"; '
            f'filename="{audio_file.name}"\r\n'
            "Content-Type: audio/wav\r\n\r\n"
        ).encode("utf-8")
    )
    body.extend(audio_file.read_bytes())
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), boundary


def _post_audio_file(path: str, fields: dict[str, str], audio_path: str) -> bytes:
    data, boundary = _encode_multipart(fields, audio_path)
    request = Request(
        f"{MAGENTA_BASE_URL}{path}",
        data=data,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "audio/wav,application/octet-stream,*/*",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=MAGENTA_TIMEOUT) as response:
            return response.read()
    except HTTPError as exc:
        _raise_for_status(exc)


def generate_audio(
    description: str,
    audio_path: str | None,
    duration: int,
    *,
    prompts: list[str] | None = None,
    prompt_weights: list[float] | None = None,
    temperature: float | None = None,
    topk: int | None = None,
    guidance_weight: float | None = None,
    seed: int | None = None,
) -> bytes:
    prompt_list = prompts or [description]
    logger.info(
        "[STEP] remote_magenta.start duration=%s has_audio=%s prompt_count=%s base_url=%s",
        duration,
        audio_path is not None,
        len(prompt_list),
        MAGENTA_BASE_URL,
    )

    if audio_path:
        fields = {
            "prompts": ", ".join(prompt_list),
            "duration_seconds": str(float(duration)),
            "injection_mix": "1.0",
        }
        if prompt_weights is not None and len(prompt_weights) == 1:
            fields["prompt_weights"] = json.dumps(prompt_weights)
        if temperature is not None:
            fields["temperature"] = str(temperature)
        if topk is not None:
            fields["topk"] = str(topk)
        if guidance_weight is not None:
            fields["guidance_weight"] = str(guidance_weight)
        if seed is not None:
            fields["seed"] = str(seed)

        audio_data = _post_audio_file(
            "/v1/generate/file",
            fields=fields,
            audio_path=audio_path,
        )
    else:
        payload = {
            "prompts": prompt_list,
            "duration_seconds": float(duration),
        }
        if prompt_weights is not None:
            payload["prompt_weights"] = prompt_weights
        if temperature is not None:
            payload["temperature"] = temperature
        if topk is not None:
            payload["topk"] = topk
        if guidance_weight is not None:
            payload["guidance_weight"] = guidance_weight
        if seed is not None:
            payload["seed"] = seed

        audio_data = _post_json("/v1/generate", payload)

    logger.info("[STEP] remote_magenta.completed bytes=%s", len(audio_data))
    return audio_data


def _get_json_url(base_url: str, path: str, timeout: float) -> dict:
    request = Request(
        f"{base_url}{path}",
        headers={"Accept": "application/json"},
        method="GET",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _post_json_url(base_url: str, path: str, payload: dict, timeout: float) -> tuple[bytes, dict[str, str]]:
    data = json.dumps(payload).encode("utf-8")
    request = Request(
        f"{base_url}{path}",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "audio/wav,application/octet-stream,*/*",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            headers = {key.lower(): value for key, value in response.headers.items()}
            return response.read(), headers
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        logger.error(
            "[ERROR] remote_musicgen.failed status=%s body=%s",
            exc.code,
            error_body[:1000],
        )
        raise RuntimeError(f"Remote MusicGen request failed with status {exc.code}") from exc


def check_musicgen_health() -> dict:
    return _get_json_url(MUSICGEN_BASE_URL, "/health", MUSICGEN_TIMEOUT)


def generate_musicgen_audio(
    *,
    prompt: str,
    duration: float = 5.0,
    temperature: float = 1.0,
    top_k: int = 250,
    top_p: float = 0.0,
    cfg_coef: float = 3.0,
) -> tuple[bytes, dict[str, str]]:
    payload = {
        "prompt": prompt,
        "duration": duration,
        "temperature": temperature,
        "top_k": top_k,
        "top_p": top_p,
        "cfg_coef": cfg_coef,
    }
    logger.info(
        "[STEP] remote_musicgen.start prompt=%s duration=%s base_url=%s",
        prompt,
        duration,
        MUSICGEN_BASE_URL,
    )
    audio_data, headers = _post_json_url(MUSICGEN_BASE_URL, "/generate", payload, MUSICGEN_TIMEOUT)
    logger.info(
        "[STEP] remote_musicgen.completed bytes=%s generation_seconds=%s",
        len(audio_data),
        headers.get("x-generation-seconds"),
    )
    return audio_data, headers

# Copilot instructions for MusicGen

## Commands

### Environment and local run

- This repo is set up for **Windows + Conda**. The root README uses a `musicgen` Conda env with Python 3.9.
- Install AudioCraft from the vendored checkout:

  ```powershell
  cd audiocraft
  pip install --upgrade pip setuptools wheel
  pip install -e .
  pip install transformers==4.38.2
  ```

- Install backend dependencies from `service\`:

  ```powershell
  pip install fastapi uvicorn python-multipart aiofiles librosa pydub soundfile
  pip install faiss-cpu
  hf auth whoami
  hf auth login
  ```

- Run the backend:

  ```powershell
  cd service
  uvicorn app:app --host 0.0.0.0 --port 8000
  ```

- Run the frontend:

  ```powershell
  cd frontend
  http-server -p 8080
  ```

### Lint, test, and build

- Formal lint/test/build automation exists in the vendored `audiocraft\` project:

  ```powershell
  cd audiocraft
  flake8 audiocraft && mypy audiocraft
  flake8 tests && mypy tests
  coverage run -m pytest tests
  coverage report
  python setup.py sdist
  ```

- Run a single AudioCraft test file:

  ```powershell
  cd audiocraft
  python -m pytest tests\models\test_musicgen.py
  ```

- Run a single AudioCraft test case:

  ```powershell
  cd audiocraft
  python -m pytest tests\models\test_musicgen.py -k test_generate
  ```

## High-level architecture

- The repo has three layers:
  - `audiocraft\`: upstream AudioCraft checkout that provides MusicGen and its test/lint/build machinery.
  - `service\`: FastAPI wrapper around MusicGen generation plus CLAP+FAISS similarity indexing.
  - `frontend\`: static HTML/CSS/JS UI served separately from the API.

- `service\app.py` is the API entrypoint. It exposes:
  - `/generate` for text + optional audio-conditioned MusicGen output
  - `/find_similar` for CLAP embedding search over `service\preloaded\*.wav`
  - `/rebuild_index` to rebuild the whole-file FAISS index
  - `/rebuild_slice_index` to rebuild the slice-level FAISS index used by the loop experiment
  - `/echo` and `/loop_audio` for round-trip/loop-audio experiments

- Model loading is **eager at import time**, not per request:
  - `service\model_handler.py` loads `facebook/musicgen-melody`
  - `service\sim_utils.py` loads `laion/clap-htsat-unfused`
  This means backend startup can be slow and may trigger Hugging Face downloads before the first request.

- The frontend keeps one shared `sourceAudio` state. The audio prepared in “区域 1” is reused by both generation and similarity search. The loop-recording area is separate and currently posts captured segments to `/loop_audio`, which still echoes audio back rather than chaining into generation/search.

- The frontend assumes the API is on the **same host at port 8000** (`resolveApiBase()` in `frontend\app.js`). It is designed to be served independently, typically on port 8080.

- Similarity search is file-backed:
  - `service\preloaded\` holds the source WAV library
  - `audio_index.faiss` + `file_order.txt` back whole-file retrieval
  - `audio_slice_index.faiss` + `slice_map.json` back slice retrieval for loop experiments

## Key conventions

- Treat `audiocraft\` as an upstream vendored dependency. Repository-specific product behavior is primarily in `service\` and `frontend\`; only modify `audiocraft\` when the change truly belongs in the underlying model library.

- Keep the Windows-oriented setup intact. The root README documents PowerShell commands, Conda usage, and Windows-specific package guidance.

- Pin `transformers==4.38.2` when working with AudioCraft here. The root README explicitly calls newer versions incompatible with this setup.

- Install `faiss-cpu` from **PyPI**, not `conda-forge`, because the repo README warns that the conda package may downgrade MKL/TBB and break PyTorch on this setup.

- The service uses the shared logging helpers in `service\logging_utils.py`. New backend code should use `get_logger(...)`, `log_params(...)`, and the existing structured message style (`[START]`, `[END]`, `[STEP]`, `[ERROR]`, `[RESULT]`) so request IDs and component tags stay consistent.

- Audio preprocessing differs by feature:
  - MusicGen conditioning uses `audio_utils.load_audio()` to produce mono tensors shaped `[1, 1, T]` at the model sample rate.
  - Similarity search resamples to CLAP's target sample rate inside `sim_utils.py`.
  - `service\scripts\convert_preloaded.py` normalizes preloaded MP3s into mono 48 kHz WAVs with `ffmpeg` before indexing.

- `/find_similar` returns the top matched audio file as a WAV response, not the full scored result list, even though `sim_utils.find_similar()` computes multiple matches and scores internally.

# Local Interactive MusicGen Prototype

This repository contains everything you need to run a local interactive music-generation experiment using Meta's MusicGen model. The project is organized into three main folders:

- **audiocraft**: The cloned AudioCraft repository (MusicGen code).
- **service**: A FastAPI backend that exposes `/generate` endpoint.
- **frontend**: A simple web app for recording audio, entering text prompts, and playing back generated music.

---

## Prerequisites

- **Operating System**: Windows 10/11 (tested).
- **CUDA**: NVIDIA GPU drivers + CUDA 11.8 or 12.1 installed (optional for GPU acceleration).
- **Conda**: Anaconda or Miniconda installed.

## 1. Create and activate Conda environment

Open PowerShell or Anaconda Prompt and run:

```powershell
conda create -n musicgen python=3.9 -y
conda activate musicgen
```

## 2. Install PyTorch

Choose the command matching your setup:

- **GPU (CUDA 11.8)**

  ```powershell
  conda install pytorch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 pytorch-cuda=11.8 -c pytorch -c nvidia -y
  ```

- **CPU only**

  ```powershell
  conda install pytorch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 cpuonly -c pytorch -y
  ```

## 3. Install AudioCraft (MusicGen)

From the project root:

```powershell
cd audiocraft
pip install --upgrade pip setuptools wheel
pip install -e .
```

> This will install AudioCraft in editable mode so you can experiment with the code.

## 4. Install backend dependencies

From the project root:

```powershell
cd ../service
pip install fastapi uvicorn librosa pydub soundfile
conda install -c conda-forge ffmpeg -y
```

## 5. Install frontend dependencies

No install needed—frontend is pure HTML/JS. Ensure you have downloaded `Recorder.js` or other libs into `frontend/libs/`.

## Directory Structure

```
MusicGen/
├── audiocraft/       # MusicGen model code (AudioCraft)
├── service/          # FastAPI backend
│   ├── app.py
│   ├── model_handler.py
│   └── audio_utils.py
└── frontend/         # Web UI
    ├── index.html
    ├── style.css
    ├── app.js
    └── libs/         # JS libraries (e.g. recorder.js)
```

---

# Running the Service + Frontend

### 1. Start the backend service

In a `musicgen` shell:

```powershell
cd service
uvicorn app:app --host 0.0.0.0 --port 8000
```

### 2. Open the frontend

In a `musicgen` shell:

```powershell
cd frontend
http-server -p 8080
```

# Usage Example

- **Record**: Click "Start Recording", then "Stop Recording".
- **Prompt**: Type a text description (e.g. `"rock cello"`).
- **Generate**: Click "Generate Music" to hear the AI-generated audio.

### cURL example (PowerShell)

```powershell
curl.exe -Method POST "http://localhost:8000/generate" `
  -Form description="A calm piano melody" `
  -Form duration=5 `
  --output demo_output.wav
```

> You can then play `demo_output.wav` locally.

---

Feel free to customize prompts, extend the service, or integrate into your own application. Happy experimenting!


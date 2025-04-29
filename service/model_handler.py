import torch
from audiocraft.models import MusicGen
import soundfile as sf
from audio_utils import load_audio
import tempfile
import time

# 加载模型
device = "cuda" if torch.cuda.is_available() else "cpu"
start_time = time.time()
print("Loading MusicGen model...")
model = MusicGen.get_pretrained("facebook/musicgen-melody", device=device)
print(f"Model loaded in {time.time() - start_time:.2f} seconds")

def generate_audio(description: str, audio_path: str, duration: int) -> bytes:
    print(f"Generating audio with description: '{description}', duration: {duration}")
    melody = None
    if audio_path:
        print(f"Loading audio from: {audio_path}")
        melody, sr = load_audio(audio_path, model.sample_rate)
        print(f"Loaded audio: shape={melody.shape}, sample_rate={sr}")

    model.set_generation_params(duration=duration)

    if melody is not None:
        print("Generating audio with chroma...")
        wav = model.generate_with_chroma(
            descriptions=[description],
            melody_wavs=melody,
            melody_sample_rate=sr,
            progress=False
        )[0]
    else:
        print("Generating audio without chroma...")
        wav = model.generate([description], progress=False)[0]

    print("Audio generation completed. Saving to temporary file...")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_wav:
        sf.write(temp_wav.name, wav.cpu().numpy().T, samplerate=model.sample_rate)
        temp_wav.seek(0)
        audio_data = temp_wav.read()
    print("Audio saved to temporary file.")
    return audio_data
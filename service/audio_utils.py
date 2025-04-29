# audio_utils.py

import librosa
import torch

def load_audio(file_path: str, target_sr: int):
    """
    Load a WAV file and resample to `target_sr`. 
    Returns a FloatTensor of shape [1,1,T] and the sample rate.
    """
    # librosa.load will convert to mono and resample for us
    audio, sr = librosa.load(file_path, sr=target_sr, mono=True)
    # wrap into a 1×1×T tensor for MusicGen
    audio_tensor = torch.tensor(audio, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
    return audio_tensor, sr

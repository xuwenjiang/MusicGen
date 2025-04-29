import torch
from audiocraft.models import MusicGen
import soundfile as sf
import librosa
import time

# 记录脚本开始时间
start_time = time.time()

# 1. 检查 CUDA 可用性
cuda_start = time.time()
print("Checking CUDA availability...")
cuda_available = torch.cuda.is_available()
print(f"CUDA available: {cuda_available}")
if cuda_available:
    print(f"Device name: {torch.cuda.get_device_name(0)}")
print(f"CUDA check completed in {time.time() - cuda_start:.2f} seconds\n")

# 2. 加载模型
model_load_start = time.time()
print("Loading MusicGen model...")
model = MusicGen.get_pretrained("facebook/musicgen-melody")  # 使用 melody 模型
print(f"Model loaded in {time.time() - model_load_start:.2f} seconds\n")

# 3. 加载输入音频
audio_path = "bach.mp3"  # 替换为你的音频文件路径
print(f"Loading input audio from '{audio_path}'...")
melody, sr = librosa.load(audio_path, sr=model.sample_rate, mono=True)  # 确保采样率匹配
melody = torch.tensor(melody).unsqueeze(0).unsqueeze(0)  # 添加批量维度和通道维度 [B, C, T]
print(f"Input audio loaded. Duration: {melody.shape[-1] / sr:.2f} seconds\n")

# 4. 设置生成参数
param_start = time.time()
print("Setting generation parameters...")
model.set_generation_params(duration=5)  # 生成 5 秒音频
print(f"Generation parameters set in {time.time() - param_start:.2f} seconds\n")

# 5. 生成音频
generation_start = time.time()
print("Generating audio with melody input...")
wav = model.generate_with_chroma(
    descriptions=["An 80s driving pop song with heavy drums and synth pads in the background"],  # 文本描述
melody_wavs=melody,          # 输入的音频
    melody_sample_rate=sr,       # 输入音频的采样率
progress=True                # 显示生成进度
)[0]
print(f"Audio generated in {time.time() - generation_start:.2f} seconds\n")

# 6. 保存生成的音频文件
save_start = time.time()
output_path = "output_audio.wav"
print(f"Saving generated audio to '{output_path}'...")
wav = wav.cpu().numpy()
if wav.ndim == 1:
    wav = wav.reshape(1, -1)
sf.write(output_path, wav.T, samplerate=model.sample_rate)
print(f"Audio saved in {time.time() - save_start:.2f} seconds\n")

# 打印总耗时
print(f"✅ '{output_path}' has been generated successfully!")
print(f"Total execution time: {time.time() - start_time:.2f} seconds")


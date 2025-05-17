#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

# 本脚本用于把预加载的 mp3 转换成 wav 格式
# 源目录，放 mp3 的文件夹
SRC_DIR = Path("preloaded")

for mp3 in SRC_DIR.glob("*.mp3"):
    wav = mp3.with_suffix(".wav")
    print(f"Converting {mp3} → {wav} …")
    # ffmpeg 要在 PATH 里能调用到
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(mp3),
        "-ar", "48000",      # 采样率 48 kHz
        "-ac", "1",          # 单通道
        str(wav)
    ], check=True)
print("✅ All done.")

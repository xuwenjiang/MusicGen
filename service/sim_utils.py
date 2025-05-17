# service/sim_utils.py

import faiss
import numpy as np
import soundfile as sf
import librosa
from transformers import ClapProcessor, ClapModel
from pathlib import Path
import torch

# ---------------------------------------------------------------------
# 1. 初始化 CLAP Processor & Model（首次会从 HF 下载，之后可离线启动）
# ---------------------------------------------------------------------
processor = ClapProcessor.from_pretrained("laion/clap-htsat-unfused")
model = (
    ClapModel
    .from_pretrained("laion/clap-htsat-unfused")
    .eval()  # 推理模式
    .to("cuda" if torch.cuda.is_available() else "cpu")
)

# CLAP 期望的采样率（通常为 48 kHz）
TARGET_SR = processor.feature_extractor.sampling_rate


def _embed_wave(wav: np.ndarray, sr: int) -> np.ndarray:
    """
    将 numpy waveform 转成 CLAP embedding 向量 (float32 1D array)。

    步骤：
    1) 如果输入采样率 != TARGET_SR，先重采样
    2) 用 processor 构造输入 tensors（注意 audios 参数要是列表）
    3) 移到 model.device，然后 no_grad 推理
    4) 返回 feats[0]（batch size=1）的 numpy 向量
    """
    # 1) 重采样
    if sr != TARGET_SR:
        wav = librosa.resample(wav, orig_sr=sr, target_sr=TARGET_SR)
        sr = TARGET_SR

    # 2) 构造输入，注意 audios 要用列表包裹
    inputs = processor(
        audios=[wav],
        sampling_rate=sr,
        return_tensors="pt",
        padding=True,
    )
    # 3) 移到同一设备
    inputs = {k: v.to(model.device) for k, v in inputs.items()}

    # 4) 推理并取第一个 embedding
    with torch.no_grad():
        feats = model.get_audio_features(**inputs)  # (batch, dim)
    emb = feats[0].cpu().numpy().astype("float32")
    return emb


def build_index(preload_dir: str, index_path: str = "audio_index.faiss") -> list[str]:
    """
    遍历 preload_dir 下所有 .wav：
      • 读取音频 → 调用 _embed_wave 得到 embedding
      • 堆叠成 (N, D) 数组 xb → 构建 FAISS 索引 (内积搜索)
      • 保存 index 到 index_path

    返回：已索引的文件名列表
    """
    files = sorted(Path(preload_dir).glob("*.wav"))
    embeddings = []

    for p in files:
        wav, sr = sf.read(str(p))
        emb = _embed_wave(wav, sr)
        embeddings.append(emb)

    xb = np.stack(embeddings, axis=0)           # (N, D)
    index = faiss.IndexFlatIP(xb.shape[1])      # 用内积度量相似度
    index.add(xb)
    faiss.write_index(index, index_path)

    return [p.name for p in files]


def find_similar(
    query_path: str,
    top_k: int = 5,
    index_path: str = "audio_index.faiss",
    preload_dir: str = "preloaded"
) -> tuple[list[str], list[float]]:
    """
    对 query_path:
      1) 读取 wav → _embed_wave → 得到 (D,) 向量 qemb
      2) 载入 FAISS 索引 → search(qemb[None], top_k)
      3) 根据索引结果 I 映射回 preload_dir 中的文件名
      4) 返回 (matches, scores)

    matches: 最相似文件名列表
    scores:  对应的内积分数列表
    """
    wav, sr = sf.read(query_path)
    qemb = _embed_wave(wav, sr)[None]  # (1, D)

    index = faiss.read_index(index_path)
    D, I = index.search(qemb, top_k)  # D: (1, top_k), I: (1, top_k)

    files = sorted(Path(preload_dir).glob("*.wav"))
    matches = [files[i].name for i in I[0]]
    scores = D[0].tolist()

    return matches, scores

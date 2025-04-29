# app.py
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from model_handler import generate_audio
import os, time, tempfile, asyncio, subprocess
from pathlib import Path

app = FastAPI()

# 允许所有源访问（开发阶段）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 创建固定的上传目录
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.post("/generate")
async def generate(
    description: str = Form(...),
    audio_file: UploadFile = File(None),
    duration: int = Form(5),
):
    start_time = time.time()
    print(f"Received request: description='{description}', duration={duration}")

    saved_audio_path = None
    converted_audio_path = None
    if audio_file:
        # 保存上传的音频文件到固定目录
        saved_audio_path = UPLOAD_DIR / audio_file.filename
        with open(saved_audio_path, "wb") as f:
            f.write(await audio_file.read())
        print(f"Uploaded audio saved to: {saved_audio_path}")
    try:
        # 调用生成函数
        audio_data = generate_audio(description, str(saved_audio_path) if saved_audio_path else None, duration)

        # 写到另一个临时 wav 文件
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp.write(audio_data)
        tmp.close()

        print(f"Total request processing time: {time.time() - start_time:.2f}s")
        return FileResponse(tmp.name, media_type="audio/wav", filename="generated.wav")
    except asyncio.CancelledError:
        return {"error": "client cancelled"}
    except Exception as e:
        print("Error:", e)
        return {"error": "生成出错了"}

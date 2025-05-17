// app.js
document.addEventListener("DOMContentLoaded", () => {
  let recorder;
  let audioBlob = null;
  let uploadedFile = null;

  const desc = document.getElementById("description");
  const recBtn = document.getElementById("record-btn");
  const stopBtn = document.getElementById("stop-btn");
  const genBtn = document.getElementById("generate-btn");
  const fileUpload = document.getElementById("file-upload");
  const player = document.getElementById("audio-player");
  const inputPlayer = document.getElementById("input-player");
  const inputCont = document.getElementById("input-player-container");
  const durationInput = document.getElementById("duration");
  const rebuildBtn = document.getElementById("rebuild-btn");
  const findBtn = document.getElementById("find-btn");

  function updateGenerateButtonState() {
    genBtn.disabled = !(
      desc.value.trim() ||
      audioBlob ||
      uploadedFile
    );
  }

  // 监听文字输入
  desc.addEventListener("input", updateGenerateButtonState);

  // 处理上传文件
  fileUpload.addEventListener("change", () => {
    const file = fileUpload.files[0] || null;
    if (file) {
      uploadedFile = file;
      // 显示出来
      const url = URL.createObjectURL(file);
      inputPlayer.src = url;
      inputCont.classList.add("visible");
    } else {
      // 用户清空了上传：保留录制音频或无音频
      uploadedFile = null;
      if (!audioBlob) {
        inputCont.classList.remove("visible");
      }
    }
    updateGenerateButtonState();
  });

  // 开始录音
  recBtn.addEventListener("click", async () => {
    recBtn.disabled = true;
    stopBtn.disabled = false;
    audioBlob = null; // 清除之前的录音
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    recorder = new Recorder(source, { numChannels: 1 });
    recorder.record();
    console.log("Recording started...");
  });

  // 停止录音并导出 WAV
  stopBtn.addEventListener("click", () => {
    recBtn.disabled = false;
    stopBtn.disabled = true;
    recorder.stop();
    recorder.exportWAV(blob => {
      audioBlob = blob;
      // 检查录音是否成功
      if (audioBlob.size <= 44) {
        alert("录音失败，请确保麦克风正常工作并重新录音！");
        audioBlob = null;
        return;
      }
      const url = URL.createObjectURL(audioBlob);
      inputPlayer.src = url;
      inputCont.classList.add("visible");
      updateGenerateButtonState();
      recorder.clear();
    });
  });

  // “生成音乐” 按钮
  genBtn.addEventListener("click", async () => {
    if (!desc.value.trim() && !audioBlob && !uploadedFile) {
      alert("请输入描述、录制一段音频，或上传一个文件！");
      return;
    }

    const duration = parseInt(durationInput.value, 10) || 5;
    const fd = new FormData();
    fd.append("description", desc.value.trim());
    fd.append("duration", duration);

    // 优先使用上传的文件，否则使用录音
    if (uploadedFile) {
      fd.append("audio_file", uploadedFile, uploadedFile.name);
    } else if (audioBlob) {
      fd.append("audio_file", audioBlob, "input.wav");
    }

    try {
      console.log("→ POST /generate");
      const resp = await fetch("http://localhost:8000/generate", {
        method: "POST",
        body: fd
      });
      if (!resp.ok) throw new Error(resp.statusText);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      player.src = url;
      player.play();
    } catch (e) {
      console.error("generate error:", e);
      alert("生成失败，请重试");
    }
  });

  // 重建索引
  rebuildBtn.addEventListener("click", async () => {
    try {
      const resp = await fetch("http://localhost:8000/rebuild_index", { method: "POST" });
      const info = await resp.json();
      alert(`Index built: ${info.built} files`);
    } catch {
      alert("重建索引失败");
    }
  });

  // 查找相似
  findBtn.addEventListener("click", async () => {
    if (!audioBlob && !uploadedFile) {
      alert("请先录音或上传音频！");
      return;
    }

    const fd = new FormData();
    // 和后端参数名保持一致
    fd.append("audio_file", uploadedFile || audioBlob, "query.wav");
    // fd.append("top_k", "1"); // 只要最相似的第一条

    try {
      console.log("→ POST /find_similar");
      const resp = await fetch("http://localhost:8000/find_similar", {
        method: "POST",
        body: fd
      });
      if (!resp.ok) throw new Error(resp.statusText);
      // 直接拿回音频文件（stream）
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      player.src = url;
      player.play();
    } catch (e) {
      console.error("find_similar error:", e);
      alert("检索失败，请重试");
    }
  });

  updateGenerateButtonState();
});

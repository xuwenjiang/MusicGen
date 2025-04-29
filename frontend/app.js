document.addEventListener("DOMContentLoaded", () => {
  let recorder, audioBlob = null, uploadedFile = null;
  const desc        = document.getElementById("description");
  const recBtn      = document.getElementById("record-btn");
  const stopBtn     = document.getElementById("stop-btn");
  const genBtn      = document.getElementById("generate-btn");
  const fileUpload  = document.getElementById("file-upload");
  const player      = document.getElementById("audio-player");
  const inputPlayer = document.getElementById("input-player");
  const inputCont   = document.getElementById("input-player-container");
  const durationInput = document.getElementById("duration");

  function updateGenerateButtonState() {
    genBtn.disabled = !(desc.value.trim() || audioBlob || uploadedFile);
  }

  desc.addEventListener("input", updateGenerateButtonState);

  fileUpload.addEventListener("change", () => {
    const file = fileUpload.files[0];
    if (file) {
      uploadedFile = file;
      console.log("Uploaded file:", file.name);
      const url = URL.createObjectURL(file);
      inputPlayer.src = url;
      inputCont.classList.add("visible");
      updateGenerateButtonState();
    }
  });

  recBtn.addEventListener("click", async () => {
    console.log(">>> start recording");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);

    recorder = new Recorder(source, { numChannels: 1 });
    recorder.record();

    recBtn.disabled = true;
    stopBtn.disabled = false;
    console.log("Recording started...");
  });

  stopBtn.addEventListener("click", () => {
    console.log(">>> stopping recording");
    recorder.stop();
    recorder.exportWAV(blob => {
      audioBlob = blob;

      // 检查录音是否成功
      if (audioBlob.size <= 44) { // 44 字节是 WAV 文件的最小头部大小
        alert("录音失败，请确保麦克风正常工作并重新录音！");
        console.error("Audio Blob is too small:", audioBlob.size, "bytes");
        return;
      }

      const url = URL.createObjectURL(audioBlob);
      inputPlayer.src = url;
      inputCont.classList.add("visible");
      console.log("audioBlob ready, input-player visible");
      updateGenerateButtonState();
    });

    recBtn.disabled = false;
    stopBtn.disabled = true;
  });

  genBtn.addEventListener("click", async () => {
    console.log(">>> generate clicked");
    if (!desc.value.trim() && !audioBlob && !uploadedFile) {
      alert("请输入描述、录制一段音频，或上传一个文件！");
      return;
    }

    const duration = parseInt(durationInput.value, 10) || 5; // 默认 5 秒
    const fd = new FormData();
    fd.append("description", desc.value.trim());
    fd.append("duration", duration);
    if (uploadedFile) {
      fd.append("audio_file", uploadedFile, uploadedFile.name);
    } else if (audioBlob) {
      fd.append("audio_file", audioBlob, "input.wav");
    }

    try {
      const resp = await fetch("http://localhost:8000/generate", {
        method: "POST", body: fd
      });
      if (!resp.ok) throw new Error(resp.statusText);
      const blob = await resp.blob();
      console.log(">>> got generated audio blob");
      const url  = URL.createObjectURL(blob);
      player.src = url;
      player.play();
    } catch (e) {
      console.error("generate error:", e);
      alert("生成失败，请重试");
    }
  });

  updateGenerateButtonState();
});

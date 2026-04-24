document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = resolveApiBase();

  let recorder = null;
  let recordStream = null;
  let recordAudioContext = null;
  let sourceAudio = null;
  let sourceAudioName = "";
  let sourcePreviewUrl = "";
  let generatePreviewUrl = "";
  let searchPreviewUrl = "";
  let loopPreviewUrl = "";

  const desc = document.getElementById("description");
  const durationInput = document.getElementById("duration");
  const fileUpload = document.getElementById("file-upload");

  const recBtn = document.getElementById("record-btn");
  const stopBtn = document.getElementById("stop-btn");
  const genBtn = document.getElementById("generate-btn");
  const findBtn = document.getElementById("find-btn");
  const rebuildBtn = document.getElementById("rebuild-btn");
  const rebuildSliceBtn = document.getElementById("rebuild-slice-btn");
  const startLoopBtn = document.getElementById("start-loop-btn");
  const stopLoopBtn = document.getElementById("stop-loop-btn");

  const inputPlayer = document.getElementById("input-player");
  const generatePlayer = document.getElementById("generate-player");
  const searchPlayer = document.getElementById("search-player");
  const loopPlayer = document.getElementById("audio-player");

  const appStatus = document.getElementById("app-status");
  const audioStatus = document.getElementById("audio-status");
  const generateStatus = document.getElementById("generate-status");
  const libraryStatus = document.getElementById("library-status");
  const loopStatus = document.getElementById("loop-status");
  const sourceCaption = document.getElementById("source-caption");

  const silenceThresholdInput = document.getElementById("silence-threshold");
  const silenceDurationInput = document.getElementById("silence-duration");
  const maxSegmentMsInput = document.getElementById("max-segment-ms");
  const silenceThresholdDisplay = document.getElementById("silence-threshold-display");
  const silenceDurationDisplay = document.getElementById("silence-duration-display");
  const maxSegmentMsDisplay = document.getElementById("max-segment-ms-display");
  const saveTagsBtn = document.getElementById("save-tags-btn");
  const analyzeTagsBtn = document.getElementById("analyze-tags-btn");
  const tagThresholdInput = document.getElementById("tag-threshold");
  const tagTopKInput = document.getElementById("tag-top-k");
  const tagStatus = document.getElementById("tag-status");
  const tagEditorList = document.getElementById("tag-editor-list");
  const tagResultsEmpty = document.getElementById("tag-results-empty");
  const tagResultsList = document.getElementById("tag-results-list");

  let loopStream = null;
  let loopAudioContext = null;
  let loopRecorder = null;
  let analyserNode = null;
  let loopDetectInterval = null;
  let wasSpeaking = false;
  let segmentStartTime = null;
  let silentSince = null;
  let tagCategories = {};

  desc.addEventListener("input", refreshActionAvailability);

  fileUpload.addEventListener("change", () => {
    const file = fileUpload.files[0] || null;

    if (!file) {
      clearSourceAudio();
      refreshActionAvailability();
      return;
    }

    setSourceAudio(file, file.name);
    setStatus(audioStatus, "success", "音频输入已载入。现在可以去生成，或者去素材库里找相似内容。", true);
    setStatus(appStatus, "success", "音频输入已准备好，后面的生成区和检索区都可以直接使用。", true);
    refreshActionAvailability();
  });

  recBtn.addEventListener("click", async () => {
    recBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus(audioStatus, "busy", "正在录音。录完以后点击“停止录音”。");
    setStatus(appStatus, "busy", "正在准备共享音频输入。", true);

    try {
      recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = recordAudioContext.createMediaStreamSource(recordStream);
      recorder = new Recorder(source, { numChannels: 1 });
      recorder.record();
    } catch (error) {
      recBtn.disabled = false;
      stopBtn.disabled = true;
      setStatus(audioStatus, "error", "麦克风不可用。请检查浏览器权限后重试。", true);
      setStatus(appStatus, "error", "录音没有成功启动。", true);
      cleanupRecorder();
      console.error("record start error:", error);
    }
  });

  stopBtn.addEventListener("click", () => {
    if (!recorder) {
      recBtn.disabled = false;
      stopBtn.disabled = true;
      return;
    }

    const activeRecorder = recorder;
    recBtn.disabled = false;
    stopBtn.disabled = true;
    activeRecorder.stop();

    activeRecorder.exportWAV((blob) => {
      cleanupRecorder();
      activeRecorder.clear();

      if (blob.size <= 44) {
        setStatus(audioStatus, "error", "录到的内容是空的。请靠近麦克风后再试一次。", true);
        setStatus(appStatus, "error", "没有拿到可用的音频输入。", true);
        return;
      }

      setSourceAudio(blob, "录音输入");
      setStatus(audioStatus, "success", "录音已经保存为当前音频输入。现在可以去生成或检索。", true);
      setStatus(appStatus, "success", "共享音频输入已经准备好。", true);
      refreshActionAvailability();
    });
  });

  genBtn.addEventListener("click", async () => {
    const effectivePrompt = getEffectivePrompt();

    if (!sourceAudio) {
      setStatus(generateStatus, "error", "要先在上面的区域准备一份音频输入，生成区才能工作。", true);
      return;
    }

    if (!effectivePrompt) {
      setStatus(generateStatus, "error", "当前没有可用的文本提示。", true);
      return;
    }

    const duration = parseInt(durationInput.value, 10) || 5;
    const formData = new FormData();
    formData.append("description", effectivePrompt);
    formData.append("duration", String(duration));
    formData.append("audio_file", sourceAudio, normalizeSourceFilename(sourceAudioName));

    setButtonBusy(genBtn, true, "生成中...");
    setStatus(generateStatus, "busy", "正在生成新音频。CPU 模式下可能会稍微久一点。", true);
    setStatus(appStatus, "busy", "模型正在生成结果。", true);

    try {
      const blob = await postForAudio("/generate", formData, 180000);
      assignAudioPreview(generatePlayer, blob, "generate");
      await safePlay(generatePlayer);
      setStatus(generateStatus, "success", "生成完成。新的音频结果已经放到下方播放器里。", true);
      setStatus(appStatus, "success", "生成区已经返回结果。", true);
    } catch (error) {
      setStatus(generateStatus, "error", error.message || "生成失败。", true);
      setStatus(appStatus, "error", "生成区执行失败。", true);
      console.error("generate error:", error);
    } finally {
      setButtonBusy(genBtn, false);
      refreshActionAvailability();
    }
  });

  findBtn.addEventListener("click", async () => {
    if (!sourceAudio) {
      setStatus(libraryStatus, "error", "要先在上面的区域准备一份音频输入，才能做相似检索。", true);
      return;
    }

    generatePlayer.pause();

    const formData = new FormData();
    formData.append("audio_file", sourceAudio, normalizeSourceFilename(sourceAudioName));
    formData.append("top_k", "5");

    setButtonBusy(findBtn, true, "检索中...");
    setStatus(libraryStatus, "busy", "正在素材库中检索最接近的音频。", true);
    setStatus(appStatus, "busy", "正在执行相似素材检索。", true);

    try {
      const blob = await postForAudio("/find_similar", formData, 90000);
      assignAudioPreview(searchPlayer, blob, "search");
      await safePlay(searchPlayer);
      setStatus(libraryStatus, "success", "检索完成。最接近的素材已经放到下方播放器里。", true);
      setStatus(appStatus, "success", "素材库检索已经返回结果。", true);
    } catch (error) {
      setStatus(libraryStatus, "error", error.message || "相似检索失败。", true);
      setStatus(appStatus, "error", "素材库检索失败。", true);
      console.error("find_similar error:", error);
    } finally {
      setButtonBusy(findBtn, false);
      refreshActionAvailability();
    }
  });

  rebuildBtn.addEventListener("click", async () => {
    setButtonBusy(rebuildBtn, true, "重建中...");
    setStatus(libraryStatus, "busy", "正在重建素材库索引。", true);
    setStatus(appStatus, "busy", "素材库索引维护正在执行。", true);

    try {
      const response = await postForJson("/rebuild_index", null, 120000);
      setStatus(libraryStatus, "success", `素材库索引重建完成，共处理 ${response.built} 个文件。`, true);
      setStatus(appStatus, "success", "素材库索引已经刷新。", true);
    } catch (error) {
      setStatus(libraryStatus, "error", error.message || "素材库索引重建失败。", true);
      setStatus(appStatus, "error", "素材库索引维护失败。", true);
      console.error("rebuild index error:", error);
    } finally {
      setButtonBusy(rebuildBtn, false);
      refreshActionAvailability();
    }
  });

  rebuildSliceBtn.addEventListener("click", async () => {
    setButtonBusy(rebuildSliceBtn, true, "重建中...");
    setStatus(loopStatus, "busy", "正在重建循环录制试验区使用的切片索引。", true);
    setStatus(appStatus, "busy", "试验区索引维护正在执行。", true);

    try {
      const response = await postForJson("/rebuild_slice_index", null, 120000);
      setStatus(loopStatus, "success", response.detail || "切片索引重建成功。", true);
      setStatus(appStatus, "success", "试验区切片索引已经刷新。", true);
    } catch (error) {
      setStatus(loopStatus, "error", error.message || "切片索引重建失败。", true);
      setStatus(appStatus, "error", "试验区切片索引维护失败。", true);
      console.error("rebuild slice index error:", error);
    } finally {
      setButtonBusy(rebuildSliceBtn, false);
    }
  });

  silenceThresholdInput.addEventListener("input", () => {
    silenceThresholdDisplay.textContent = parseFloat(silenceThresholdInput.value).toFixed(3);
  });

  silenceDurationInput.addEventListener("input", () => {
    silenceDurationDisplay.textContent = silenceDurationInput.value;
  });

  maxSegmentMsInput.addEventListener("input", () => {
    maxSegmentMsDisplay.textContent = maxSegmentMsInput.value;
  });

  startLoopBtn.addEventListener("click", async () => {
    startLoopBtn.disabled = true;
    stopLoopBtn.disabled = false;
    setStatus(loopStatus, "busy", "循环录制已开始，正在监听新的片段。", true);
    setStatus(appStatus, "busy", "试验区正在持续录音。", true);

    try {
      loopStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      loopAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      const loopSource = loopAudioContext.createMediaStreamSource(loopStream);

      loopRecorder = new Recorder(loopSource, { numChannels: 1 });
      loopRecorder.record();

      analyserNode = loopAudioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      loopSource.connect(analyserNode);

      wasSpeaking = false;
      segmentStartTime = null;
      silentSince = null;

      loopDetectInterval = window.setInterval(() => {
        const dataArray = new Float32Array(analyserNode.fftSize);
        analyserNode.getFloatTimeDomainData(dataArray);

        let sumSquares = 0;
        for (let index = 0; index < dataArray.length; index += 1) {
          sumSquares += dataArray[index] * dataArray[index];
        }

        const rms = Math.sqrt(sumSquares / dataArray.length);
        const now = Date.now();
        const silenceThreshold = parseFloat(silenceThresholdInput.value) || 0.01;
        const silenceDuration = parseInt(silenceDurationInput.value, 10) || 1500;
        const maxSegmentMs = parseInt(maxSegmentMsInput.value, 10) || 5000;

        if (rms > silenceThreshold) {
          if (!wasSpeaking) {
            wasSpeaking = true;
            segmentStartTime = now;
            silentSince = null;
            setStatus(loopStatus, "busy", "检测到声音，正在截取片段。", true);
          } else if (now - segmentStartTime >= maxSegmentMs) {
            wasSpeaking = false;
            silentSince = null;
            exportAndSendSegment();
          }
          return;
        }

        if (!wasSpeaking) {
          return;
        }

        if (!silentSince) {
          silentSince = now;
          return;
        }

        if (now - silentSince >= silenceDuration) {
          wasSpeaking = false;
          silentSince = null;
          exportAndSendSegment();
        }
      }, 200);
    } catch (error) {
      stopLoopRecording();
      setStatus(loopStatus, "error", "循环录制启动失败。请检查麦克风权限。", true);
      setStatus(appStatus, "error", "试验区没有成功启动。", true);
      console.error("loop start error:", error);
    }
  });

  stopLoopBtn.addEventListener("click", () => {
    stopLoopRecording();
    setStatus(loopStatus, "idle", "循环录制当前处于空闲状态。", true);
    setStatus(appStatus, "idle", "试验区已经停止。", true);
  });

  saveTagsBtn.addEventListener("click", saveAvailableTags);
  analyzeTagsBtn.addEventListener("click", analyzeCurrentAudioTags);

  refreshActionAvailability();
  renderTagResults();
  void initializeTagging();

  function refreshActionAvailability() {
    const hasPrompt = Boolean(getEffectivePrompt());
    const hasSourceAudio = Boolean(sourceAudio);
    const hasTags = collectCurrentTags().length > 0;

    genBtn.disabled = !hasPrompt || !hasSourceAudio;
    findBtn.disabled = !hasSourceAudio;
    analyzeTagsBtn.disabled = !hasSourceAudio || !hasTags;

    if (!hasSourceAudio) {
      if (!isPinned(audioStatus)) {
        setStatus(audioStatus, "idle", "还没有音频输入。请先录音或上传文件。", true);
      }
      if (!isPinned(libraryStatus)) {
        setStatus(libraryStatus, "idle", "准备好音频输入后，就可以查找素材库中的相似音频。", true);
      }
    } else {
      if (!isPinned(audioStatus)) {
        setStatus(audioStatus, "success", "当前音频输入已经准备好。", true);
      }
      if (!isPinned(libraryStatus)) {
        setStatus(libraryStatus, "idle", "可以开始查找相似素材，也可以按需重建素材库索引。", true);
      }
    }

    if (!hasSourceAudio && !isPinned(generateStatus)) {
      setStatus(generateStatus, "idle", "先准备音频输入；文本留空时会自动使用默认提示词。", true);
    } else if (hasSourceAudio && !desc.value.trim() && !isPinned(generateStatus)) {
      setStatus(generateStatus, "idle", "将使用默认示例提示词生成新音频。", true);
    } else if (hasPrompt && hasSourceAudio && !isPinned(generateStatus)) {
      setStatus(generateStatus, "idle", "文本提示和音频输入都准备好了，可以开始生成。", true);
    }

    if (!hasTags && !isPinned(tagStatus)) {
      setStatus(tagStatus, "idle", "先准备一批可用 tags，才能开始做 CLAP 标签分析。", true);
    } else if (!hasSourceAudio && !isPinned(tagStatus)) {
      setStatus(tagStatus, "idle", "可用 tags 已准备好。上传或录音后就可以分析当前音频。", true);
    }
  }

  function getEffectivePrompt() {
    const manualPrompt = desc.value.trim();
    if (manualPrompt) {
      return manualPrompt;
    }

    return desc.placeholder.trim();
  }

  function setSourceAudio(audioLike, label) {
    sourceAudio = audioLike;
    sourceAudioName = label;

    if (sourcePreviewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl);
    }

    sourcePreviewUrl = URL.createObjectURL(audioLike);
    inputPlayer.src = sourcePreviewUrl;
    sourceCaption.textContent = label;
  }

  function clearSourceAudio() {
    sourceAudio = null;
    sourceAudioName = "";

    if (sourcePreviewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl);
      sourcePreviewUrl = "";
    }

    sourceCaption.textContent = "尚未准备";
    inputPlayer.removeAttribute("src");
    inputPlayer.load();
  }

  async function initializeTagging() {
    setStatus(tagStatus, "busy", "正在加载可用 tags。", true);

    try {
      const response = await fetchJson("/tags", 30000);
      tagCategories = normalizeCategoryMap(response.categories);
      renderTagEditor();
      refreshActionAvailability();
      setStatus(tagStatus, "success", `已加载 ${collectCategoryCount()} 个分类、${collectCurrentTags().length} 个可用 tags。可以继续编辑，或直接分析当前音频。`, true);
    } catch (error) {
      setStatus(tagStatus, "error", error.message || "可用 tags 加载失败。", true);
      console.error("load tags error:", error);
    }
  }

  function renderTagEditor() {
    tagEditorList.innerHTML = "";

    const entries = Object.entries(tagCategories);

    if (!entries.length) {
      const emptyNote = document.createElement("p");
      emptyNote.className = "empty-note";
      emptyNote.textContent = "当前还没有可用 tags 分类。请先检查本地配置文件。";
      tagEditorList.appendChild(emptyNote);
      return;
    }

    entries.forEach(([categoryName, tags]) => {
      const section = document.createElement("section");
      section.className = "tag-category";

      const head = document.createElement("div");
      head.className = "tag-category-head";

      const title = document.createElement("h4");
      title.className = "tag-category-title";
      title.textContent = categoryName;

      const count = document.createElement("span");
      count.className = "tag-category-count";
      count.textContent = `${tags.length} tags`;

      head.appendChild(title);
      head.appendChild(count);
      section.appendChild(head);

      const list = document.createElement("div");
      list.className = "tag-chip-list";

      tags.forEach((tag, index) => {
        list.appendChild(createTagChip(categoryName, index, tag));
      });

      list.appendChild(createTagAddChip(categoryName));
      section.appendChild(list);
      tagEditorList.appendChild(section);
    });
  }

  function createTagChip(categoryName, index, tag) {
    const chip = document.createElement("div");
    chip.className = "tag-chip";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tag-chip-input";
    input.value = tag;
    input.size = Math.max(tag.length + 1, 8);
    input.addEventListener("input", (event) => {
      const value = event.target.value;
      tagCategories[categoryName][index] = value;
      event.target.size = Math.max(value.length + 1, 8);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "tag-chip-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "删除这个 tag";
    removeBtn.addEventListener("click", () => {
      tagCategories[categoryName].splice(index, 1);
      renderTagEditor();
      refreshActionAvailability();
    });

    chip.appendChild(input);
    chip.appendChild(removeBtn);
    return chip;
  }

  function createTagAddChip(categoryName) {
    const chip = document.createElement("div");
    chip.className = "tag-chip tag-chip-add";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tag-chip-add-input";
    input.placeholder = `回车添加 ${categoryName} tag`;
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      const nextTag = normalizeTagText(event.target.value);
      if (!nextTag) {
        return;
      }

      if (hasDuplicateTag(nextTag, categoryName)) {
        setStatus(tagStatus, "error", `tag 已存在：${nextTag}`, true);
        return;
      }

      tagCategories[categoryName].push(nextTag);
      renderTagEditor();
      refreshActionAvailability();
      setStatus(tagStatus, "success", `已在 ${categoryName} 下添加 tag：${nextTag}。记得保存。`, true);
    });

    chip.appendChild(input);
    return chip;
  }

  function hasDuplicateTag(nextTag, categoryName) {
    return tagCategories[categoryName].some(
      (tag) => normalizeTagText(tag).localeCompare(nextTag, undefined, { sensitivity: "accent" }) === 0,
    );
  }

  async function saveAvailableTags() {
    setButtonBusy(saveTagsBtn, true, "保存中...");

    try {
      const response = await postJson("/tags", { categories: collectCurrentCategories() }, 30000);
      tagCategories = normalizeCategoryMap(response.categories);
      renderTagEditor();
      refreshActionAvailability();
      setStatus(tagStatus, "success", `已保存 ${collectCategoryCount()} 个分类、${collectCurrentTags().length} 个 tags。`, true);
    } catch (error) {
      setStatus(tagStatus, "error", error.message || "保存可用 tags 失败。", true);
      console.error("save tags error:", error);
    } finally {
      setButtonBusy(saveTagsBtn, false);
    }
  }

  async function analyzeCurrentAudioTags() {
    if (!sourceAudio) {
      setStatus(tagStatus, "error", "要先在上面的区域准备一份音频输入，才能分析标签。", true);
      return;
    }

    const tags = collectCurrentTags();
    if (!tags.length) {
      setStatus(tagStatus, "error", "当前没有可用 tags。请先添加并保存。", true);
      return;
    }

    const threshold = parseFloat(tagThresholdInput.value);
    const topK = parseInt(tagTopKInput.value, 10);
    const formData = new FormData();
    formData.append("audio_file", sourceAudio, normalizeSourceFilename(sourceAudioName));
    formData.append("tags", JSON.stringify(tags));
    formData.append("threshold", String(Number.isFinite(threshold) ? threshold : 0.25));
    formData.append("top_k", String(Number.isFinite(topK) && topK > 0 ? topK : 8));

    setButtonBusy(analyzeTagsBtn, true, "分析中...");
    setStatus(tagStatus, "busy", "正在用 CLAP 给当前音频打标签。", true);
    setStatus(appStatus, "busy", "CLAP 标签分析正在执行。", true);

    try {
      const response = await postForJson("/analyze_tags", formData, 120000);
      renderTagResults(response.results || [], "当前阈值下没有命中的 tags。你可以降低 threshold，或者补充更贴切的 tags。");
      setStatus(tagStatus, "success", `标签分析完成，共返回 ${(response.results || []).length} 个命中。`, true);
      setStatus(appStatus, "success", "CLAP 标签分析已经返回结果。", true);
    } catch (error) {
      renderTagResults();
      setStatus(tagStatus, "error", error.message || "标签分析失败。", true);
      setStatus(appStatus, "error", "CLAP 标签分析失败。", true);
      console.error("analyze tags error:", error);
    } finally {
      setButtonBusy(analyzeTagsBtn, false);
      refreshActionAvailability();
    }
  }

  function collectCurrentCategories() {
    const normalized = {};

    Object.entries(tagCategories).forEach(([categoryName, tags]) => {
      const cleanCategoryName = normalizeTagText(categoryName);
      const cleanTags = tags
        .map(normalizeTagText)
        .filter(Boolean);

      if (cleanCategoryName && cleanTags.length) {
        normalized[cleanCategoryName] = cleanTags;
      }
    });

    return normalized;
  }

  function collectCurrentTags() {
    return Object.values(collectCurrentCategories()).flat();
  }

  function normalizeCategoryMap(categories) {
    const normalized = {};

    if (!categories || typeof categories !== "object") {
      return normalized;
    }

    Object.entries(categories).forEach(([categoryName, tags]) => {
      if (!Array.isArray(tags)) {
        return;
      }
      normalized[categoryName] = tags.slice();
    });

    return normalized;
  }

  function collectCategoryCount() {
    return Object.keys(collectCurrentCategories()).length;
  }

  function normalizeTagText(value) {
    return value.trim().replace(/\s+/g, " ");
  }

  function renderTagResults(results = [], emptyMessage = "准备好音频后，就可以试试 CLAP 的标签判断效果。") {
    tagResultsList.innerHTML = "";

    if (!results.length) {
      tagResultsEmpty.style.display = "";
      tagResultsEmpty.textContent = emptyMessage;
      return;
    }

    tagResultsEmpty.style.display = "none";

    results.forEach((result) => {
      const row = document.createElement("div");
      row.className = "tag-result-item";

      const label = document.createElement("span");
      label.className = "tag-result-label";
      label.textContent = result.label;

      const score = document.createElement("span");
      score.className = "tag-result-score";
      score.textContent = Number(result.score).toFixed(4);

      row.appendChild(label);
      row.appendChild(score);
      tagResultsList.appendChild(row);
    });
  }

  function assignAudioPreview(player, blob, target) {
    const nextUrl = URL.createObjectURL(blob);

    if (target === "generate" && generatePreviewUrl) {
      URL.revokeObjectURL(generatePreviewUrl);
    }
    if (target === "search" && searchPreviewUrl) {
      URL.revokeObjectURL(searchPreviewUrl);
    }
    if (target === "loop" && loopPreviewUrl) {
      URL.revokeObjectURL(loopPreviewUrl);
    }

    if (target === "generate") {
      generatePreviewUrl = nextUrl;
    }
    if (target === "search") {
      searchPreviewUrl = nextUrl;
    }
    if (target === "loop") {
      loopPreviewUrl = nextUrl;
    }

    player.src = nextUrl;
  }

  async function exportAndSendSegment() {
    if (!loopRecorder) {
      return;
    }

    const activeLoopRecorder = loopRecorder;
    activeLoopRecorder.stop();

    activeLoopRecorder.exportWAV(async (blob) => {
      let trimmedBlob = blob;

      try {
        trimmedBlob = await trimSilenceFromWav(blob);
      } catch (error) {
        console.warn("trim silence error:", error);
      }

      activeLoopRecorder.clear();
      if (loopRecorder === activeLoopRecorder) {
        activeLoopRecorder.record();
      }

      const formData = new FormData();
      formData.append("audio_file", trimmedBlob, "segment.wav");
      setStatus(loopStatus, "busy", "正在处理刚刚截取到的片段。", true);

      try {
        const returnedBlob = await postForAudio("/loop_audio", formData, 90000);
        assignAudioPreview(loopPlayer, returnedBlob, "loop");
        await safePlay(loopPlayer);
        setStatus(loopStatus, "success", "最新片段已经返回并可试听。", true);
      } catch (error) {
        setStatus(loopStatus, "error", error.message || "循环片段处理失败。", true);
        console.error("loop segment error:", error);
      }
    });
  }

  async function trimSilenceFromWav(wavBlob) {
    const arrayBuffer = await wavBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const threshold = parseFloat(silenceThresholdInput.value) || 0.01;

    let startSample = 0;
    for (let index = 0; index < channelData.length; index += 1) {
      if (Math.abs(channelData[index]) > threshold) {
        startSample = index;
        break;
      }
    }

    let endSample = channelData.length;
    for (let index = channelData.length - 1; index >= 0; index -= 1) {
      if (Math.abs(channelData[index]) > threshold) {
        endSample = index + 1;
        break;
      }
    }

    if (startSample >= endSample) {
      audioContext.close?.();
      return wavBlob;
    }

    const trimmedData = channelData.slice(startSample, endSample);
    const trimmedBlob = encodeWav(trimmedData, sampleRate);
    audioContext.close?.();
    return trimmedBlob;
  }

  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return new Blob([view], { type: "audio/wav" });
  }

  function writeString(view, offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  function cleanupRecorder() {
    if (recordStream) {
      recordStream.getTracks().forEach((track) => track.stop());
      recordStream = null;
    }

    if (recordAudioContext) {
      recordAudioContext.close();
      recordAudioContext = null;
    }

    recorder = null;
  }

  function stopLoopRecording() {
    if (loopDetectInterval) {
      clearInterval(loopDetectInterval);
      loopDetectInterval = null;
    }

    if (loopRecorder) {
      loopRecorder.stop();
      loopRecorder.clear();
      loopRecorder = null;
    }

    if (loopStream) {
      loopStream.getTracks().forEach((track) => track.stop());
      loopStream = null;
    }

    if (loopAudioContext) {
      loopAudioContext.close();
      loopAudioContext = null;
    }

    analyserNode = null;
    wasSpeaking = false;
    segmentStartTime = null;
    silentSince = null;
    startLoopBtn.disabled = false;
    stopLoopBtn.disabled = true;
  }

  function setButtonBusy(button, busy, busyLabel) {
    if (!button.dataset.idleLabel) {
      button.dataset.idleLabel = button.textContent;
    }

    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.idleLabel;
  }

  function setStatus(element, kind, message, pin = false) {
    if (!element) {
      return;
    }

    element.className = `status-banner status-${kind}`;
    element.textContent = message;
    element.dataset.pinned = pin ? "true" : "false";
  }

  function isPinned(element) {
    return element?.dataset.pinned === "true";
  }

  async function postForAudio(path, body, timeoutMs) {
    const response = await fetchWithTimeout(`${API_BASE}${path}`, {
      method: "POST",
      body,
    }, timeoutMs);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "请求失败。"));
    }

    return response.blob();
  }

  async function postForJson(path, body, timeoutMs) {
    const response = await fetchWithTimeout(`${API_BASE}${path}`, {
      method: "POST",
      body,
    }, timeoutMs);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "请求失败。"));
    }

    return response.json();
  }

  async function postJson(path, payload, timeoutMs) {
    const response = await fetchWithTimeout(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, timeoutMs);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "请求失败。"));
    }

    return response.json();
  }

  async function fetchJson(path, timeoutMs) {
    const response = await fetchWithTimeout(`${API_BASE}${path}`, {
      method: "GET",
    }, timeoutMs);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "请求失败。"));
    }

    return response.json();
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("请求超时了。后端可能还在加载模型，或者仍在处理音频。");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readErrorMessage(response, fallbackMessage) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      return payload?.detail || payload?.error || fallbackMessage;
    }

    const text = await response.text().catch(() => "");
    return text || fallbackMessage;
  }

  async function safePlay(player) {
    try {
      await player.play();
    } catch (error) {
      console.warn("audio autoplay blocked:", error);
    }
  }

  function normalizeSourceFilename(label) {
    if (!label) {
      return "input.wav";
    }

    const lower = label.toLowerCase();
    return lower.endsWith(".wav") || lower.endsWith(".mp3") ? label : `${label}.wav`;
  }

  function resolveApiBase() {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }

    return "http://localhost:8000";
  }
});

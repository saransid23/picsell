(() => {
  "use strict";

  // ---------- Config ----------
  const isSelfHosted = (window.location.protocol === "http:" || window.location.protocol === "https:") && window.location.host;
  let API_BASE = localStorage.getItem("picsell_api_base") || (isSelfHosted ? "" : "http://127.0.0.1:5000");

  // ---------- State ----------
  let sessionId = null;
  let allPresets = [];          // [{id, name, category}]
  let categories = [];
  let activeCategory = "All";
  let activePresetId = null;
  let activePresetBase = null;   // baseline preset adjustment values
  let searchQuery = "";
  let thumbCache = {};           // preset_id -> base64 jpeg
  let applyAbortController = null;
  let thumbAbortController = null;
  let originalImageURL = null;
  let currentEditedURL = null;
  let isComparing = false;

  // ---------- DOM Elements ----------
  const el = (id) => document.getElementById(id);
  const fileInput = el("file-input");
  const dropzone = el("dropzone");
  const mainImage = el("main-image");
  const originalImage = el("original-image");
  const imageWrapper = el("image-wrapper");
  const stageFrame = el("stage-frame");
  const stageLoading = el("stage-loading");
  const loadingText = el("loading-text");
  const stageMessage = el("stage-message");
  const stageToolbar = el("stage-toolbar");
  const presetActiveLabel = el("preset-active-label");
  const categoryTabs = el("category-tabs");
  const presetGrid = el("preset-grid");
  const presetCountBadge = el("preset-count-badge");
  const presetSearchInput = el("preset-search-input");
  const searchClearBtn = el("search-clear-btn");
  const downloadBtn = el("download-btn");
  const resetBtn = el("reset-btn");
  const resetStageBtn = el("reset-stage-btn");
  const compareToggleBtn = el("compare-toggle-btn");
  const compareBtnLabel = el("compare-btn-label");
  const compareBadge = el("compare-badge");
  const adjustEmpty = el("adjust-empty");
  const adjustControls = el("adjust-controls");
  const settingsToggle = el("settings-toggle");
  const settingsPanel = el("settings-panel");
  const settingsClose = el("settings-close");
  const apiBaseInput = el("api-base-input");
  const settingsSave = el("settings-save");
  const settingsStatus = el("settings-status");

  // Transform buttons
  const rotateLeftBtn = el("rotate-left-btn");
  const rotateRightBtn = el("rotate-right-btn");
  const flipHBtn = el("flip-h-btn");
  const flipVBtn = el("flip-v-btn");

  const sliders = {
    brightness: el("slider-brightness"),
    contrast: el("slider-contrast"),
    saturation: el("slider-saturation"),
    vibrance: el("slider-vibrance"),
    warmth: el("slider-warmth"),
    tint: el("slider-tint"),
    shadows_warmth: el("slider-shadows-warmth"),
    shadows_tint: el("slider-shadows-tint"),
    midtones_warmth: el("slider-midtones-warmth"),
    midtones_tint: el("slider-midtones-tint"),
    highlights_warmth: el("slider-highlights-warmth"),
    highlights_tint: el("slider-highlights-tint"),
    vignette: el("slider-vignette"),
    grain: el("slider-grain"),
    fade: el("slider-fade"),
  };

  const sliderValues = {
    brightness: el("val-brightness"),
    contrast: el("val-contrast"),
    saturation: el("val-saturation"),
    vibrance: el("val-vibrance"),
    warmth: el("val-warmth"),
    tint: el("val-tint"),
    shadows_warmth: el("val-shadows-warmth"),
    shadows_tint: el("val-shadows-tint"),
    midtones_warmth: el("val-midtones-warmth"),
    midtones_tint: el("val-midtones-tint"),
    highlights_warmth: el("val-highlights-warmth"),
    highlights_tint: el("val-highlights-tint"),
    vignette: el("val-vignette"),
    grain: el("val-grain"),
    fade: el("val-fade"),
  };

  const monoToggle = el("toggle-mono");

  // ---------- Helpers ----------
  function showMessage(text, isError = true) {
    stageMessage.textContent = text || "";
    stageMessage.style.display = text ? "block" : "none";
    stageMessage.style.color = isError ? "var(--danger)" : "var(--text-muted)";
  }

  function setLoading(isLoading, text = "Processing photo...") {
    loadingText.textContent = text;
    stageLoading.hidden = !isLoading;
  }

  async function apiFetch(path, options = {}) {
    let res;
    const url = API_BASE ? `${API_BASE}${path}` : path;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (err.name === "AbortError") throw err; // propagate abort
      throw new Error(
        `Unable to reach backend server. Please ensure Python server is running.`
      );
    }
    if (!res.ok) {
      let msg = `Server Error (${res.status})`;
      try {
        const data = await res.clone().json();
        if (data.error) msg = data.error;
      } catch (_) {}
      throw new Error(msg);
    }
    return res;
  }

  // ---------- Init ----------
  apiBaseInput.value = API_BASE || window.location.origin;
  loadPresetList();

  // ---------- Settings drawer ----------
  settingsToggle.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });
  if (settingsClose) {
    settingsClose.addEventListener("click", () => {
      settingsPanel.hidden = true;
    });
  }
  settingsSave.addEventListener("click", () => {
    const val = apiBaseInput.value.trim().replace(/\/$/, "");
    API_BASE = val;
    localStorage.setItem("picsell_api_base", val);
    settingsStatus.textContent = "Saved configuration!";
    setTimeout(() => {
      settingsStatus.textContent = "";
      settingsPanel.hidden = true;
    }, 1200);
    loadPresetList();
  });

  // ---------- Load preset list ----------
  async function loadPresetList() {
    try {
      const res = await apiFetch("/api/presets");
      const data = await res.json();
      allPresets = data.presets;
      categories = ["All", ...data.categories];
      presetCountBadge.textContent = allPresets.length;
      renderCategoryTabs();
      renderPresetGrid();
    } catch (err) {
      presetGrid.innerHTML = `<p class="rail-empty">${escapeHTML(err.message)}</p>`;
    }
  }

  function renderCategoryTabs() {
    categoryTabs.innerHTML = "";
    categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "tab" + (cat === activeCategory ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        activeCategory = cat;
        renderCategoryTabs();
        renderPresetGrid();
      });
      categoryTabs.appendChild(btn);
    });
  }

  // Search filter handler
  presetSearchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    searchClearBtn.hidden = !searchQuery;
    renderPresetGrid();
  });

  searchClearBtn.addEventListener("click", () => {
    presetSearchInput.value = "";
    searchQuery = "";
    searchClearBtn.hidden = true;
    renderPresetGrid();
  });

  function renderPresetGrid() {
    if (!allPresets.length) return;

    let visible = activeCategory === "All"
      ? allPresets
      : allPresets.filter((p) => p.category === activeCategory);

    if (searchQuery) {
      visible = visible.filter((p) =>
        p.name.toLowerCase().includes(searchQuery) ||
        p.category.toLowerCase().includes(searchQuery)
      );
    }

    presetGrid.innerHTML = "";

    if (!sessionId) {
      presetGrid.innerHTML = `<p class="rail-empty">Upload a photo to see preset thumbnails rendered live on your image.</p>`;
      return;
    }

    if (visible.length === 0) {
      presetGrid.innerHTML = `<p class="rail-empty">No presets found matching "${escapeHTML(searchQuery)}".</p>`;
      return;
    }

    visible.forEach((preset) => {
      const btn = document.createElement("button");
      btn.className = "preset-thumb" + (preset.id === activePresetId ? " active" : "");
      btn.setAttribute("data-preset-id", preset.id);

      const img = document.createElement("img");
      img.alt = preset.name;
      if (thumbCache[preset.id]) {
        img.src = `data:image/jpeg;base64,${thumbCache[preset.id]}`;
      } else {
        img.classList.add("thumb-placeholder");
      }

      const name = document.createElement("span");
      name.className = "preset-name";
      name.textContent = preset.name;

      btn.appendChild(img);
      btn.appendChild(name);
      btn.addEventListener("click", () => selectPreset(preset.id, preset.name));
      presetGrid.appendChild(btn);
    });

    // Fetch missing thumbnails in current view in small batches of 16
    const missing = visible.filter((p) => !thumbCache[p.id]).map((p) => p.id);
    if (missing.length) fetchThumbnailsInBatches(missing);
  }

  async function fetchThumbnailsInBatches(presetIds) {
    if (thumbAbortController) {
      thumbAbortController.abort();
    }
    thumbAbortController = new AbortController();

    const BATCH_SIZE = 16;
    for (let i = 0; i < presetIds.length; i += BATCH_SIZE) {
      if (thumbAbortController.signal.aborted) break;
      const chunk = presetIds.slice(i, i + BATCH_SIZE);
      try {
        const res = await apiFetch("/api/thumbnails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, preset_ids: chunk }),
          signal: thumbAbortController.signal
        });
        const data = await res.json();
        Object.assign(thumbCache, data);

        // Update thumbnail images in-place without re-rendering the whole grid
        for (const [pid, base64] of Object.entries(data)) {
          const thumbBtn = presetGrid.querySelector(`[data-preset-id="${pid}"]`);
          if (thumbBtn) {
            const img = thumbBtn.querySelector("img");
            if (img) {
              img.src = `data:image/jpeg;base64,${base64}`;
              img.classList.remove("thumb-placeholder");
            }
          }
        }
      } catch (err) {
        if (err.name === "AbortError") break;
        showMessage(err.message);
      }
    }
  }

  // ---------- Image Upload ----------
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleUpload(e.target.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    })
  );

  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
    })
  );

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  });

  async function handleUpload(file) {
    if (!file.type.startsWith("image/")) {
      showMessage("Please upload a valid image file (JPEG, PNG or WEBP).");
      return;
    }
    showMessage("");
    setLoading(true, "Uploading & preparing photo...");

    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      sessionId = data.session_id;

      // Reset application state for the new photo
      thumbCache = {};
      activePresetId = null;
      activePresetBase = null;
      presetActiveLabel.textContent = "Original Unedited Photo";
      resetBtn.disabled = true;
      resetStageBtn.disabled = true;
      downloadBtn.disabled = false;
      compareToggleBtn.disabled = false;
      adjustEmpty.hidden = false;
      adjustControls.hidden = true;

      if (originalImageURL) URL.revokeObjectURL(originalImageURL);
      if (currentEditedURL) URL.revokeObjectURL(currentEditedURL);

      originalImageURL = URL.createObjectURL(file);
      currentEditedURL = originalImageURL;

      mainImage.src = currentEditedURL;
      originalImage.src = originalImageURL;

      dropzone.hidden = true;
      imageWrapper.hidden = false;
      stageToolbar.hidden = false;

      renderPresetGrid();
    } catch (err) {
      showMessage(err.message);
      dropzone.hidden = false;
    } finally {
      setLoading(false);
    }
  }

  // ---------- Preset Selection ----------
  async function selectPreset(presetId, presetName) {
    if (!sessionId) {
      showMessage("Please upload a photo first before selecting a preset.");
      return;
    }

    activePresetId = presetId;
    const labelText = presetName || `Preset #${presetId}`;
    presetActiveLabel.textContent = `${labelText} • Applying...`;
    presetGrid.querySelectorAll(".preset-thumb").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-preset-id") == presetId);
    });
    showMessage("");

    if (applyAbortController) {
      applyAbortController.abort();
    }
    applyAbortController = new AbortController();

    const inMem = allPresets.find((p) => p.id === presetId);
    if (inMem) {
      activePresetBase = inMem;
      seedSlidersFrom(activePresetBase);
      adjustEmpty.hidden = true;
      adjustControls.hidden = false;
      resetBtn.disabled = false;
      resetStageBtn.disabled = false;
    }

    try {
      const res = await apiFetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, preset_id: presetId }),
        signal: applyAbortController.signal
      });
      const blob = await res.blob();

      if (!inMem) {
        activePresetBase = await fetchPresetDetail(presetId);
        seedSlidersFrom(activePresetBase);
        adjustEmpty.hidden = true;
        adjustControls.hidden = false;
        resetBtn.disabled = false;
        resetStageBtn.disabled = false;
      }

      displayEditedBlob(blob);
      presetActiveLabel.textContent = labelText;
    } catch (err) {
      if (err.name !== "AbortError") showMessage(err.message);
      presetActiveLabel.textContent = labelText;
    }
  }

  const presetDetailCache = {};
  async function fetchPresetDetail(presetId) {
    if (presetDetailCache[presetId]) return presetDetailCache[presetId];
    const res = await apiFetch(`/api/presets/${presetId}`);
    const detail = await res.json();
    presetDetailCache[presetId] = detail;
    return detail;
  }

  function seedSlidersFrom(values) {
    const bright = values.brightness ?? 1;
    const cont = values.contrast ?? 1;
    const sat = values.saturation ?? 1;
    const vib = values.vibrance ?? 0;
    const warm = values.warmth ?? 0;
    const t = values.tint ?? 0;
    const shW = values.shadows_warmth ?? 0;
    const shT = values.shadows_tint ?? 0;
    const hlW = values.highlights_warmth ?? 0;
    const hlT = values.highlights_tint ?? 0;
    const vig = values.vignette ?? 0;
    const gr = values.grain ?? 0;
    const fd = values.fade ?? 0;

    sliders.brightness.value = bright;
    sliders.contrast.value = cont;
    sliders.saturation.value = sat;
    sliders.vibrance.value = vib;
    sliders.warmth.value = warm;
    sliders.tint.value = t;
    sliders.shadows_warmth.value = shW;
    sliders.shadows_tint.value = shT;
    sliders.highlights_warmth.value = hlW;
    sliders.highlights_tint.value = hlT;
    sliders.vignette.value = vig;
    sliders.grain.value = gr;
    sliders.fade.value = fd;
    monoToggle.checked = !!values.mono;

    updateSliderBadgeValues();
  }

  function updateSliderBadgeValues() {
    sliderValues.brightness.textContent = parseFloat(sliders.brightness.value).toFixed(2);
    sliderValues.contrast.textContent = parseFloat(sliders.contrast.value).toFixed(2);
    sliderValues.saturation.textContent = parseFloat(sliders.saturation.value).toFixed(2);
    sliderValues.vibrance.textContent = parseFloat(sliders.vibrance.value).toFixed(2);
    sliderValues.warmth.textContent = parseFloat(sliders.warmth.value).toFixed(2);
    sliderValues.tint.textContent = parseFloat(sliders.tint.value).toFixed(2);
    sliderValues.shadows_warmth.textContent = parseFloat(sliders.shadows_warmth.value).toFixed(2);
    sliderValues.shadows_tint.textContent = parseFloat(sliders.shadows_tint.value).toFixed(2);
    sliderValues.highlights_warmth.textContent = parseFloat(sliders.highlights_warmth.value).toFixed(2);
    sliderValues.highlights_tint.textContent = parseFloat(sliders.highlights_tint.value).toFixed(2);
    sliderValues.vignette.textContent = parseFloat(sliders.vignette.value).toFixed(2);
    sliderValues.grain.textContent = parseFloat(sliders.grain.value).toFixed(2);
    sliderValues.fade.textContent = parseFloat(sliders.fade.value).toFixed(2);
  }

  function displayEditedBlob(blob) {
    if (currentEditedURL && currentEditedURL !== originalImageURL) {
      URL.revokeObjectURL(currentEditedURL);
    }
    currentEditedURL = URL.createObjectURL(blob);
    mainImage.src = currentEditedURL;
  }

  // ---------- Slider fine-tuning ----------
  function currentOverrides() {
    return {
      brightness: parseFloat(sliders.brightness.value),
      contrast: parseFloat(sliders.contrast.value),
      saturation: parseFloat(sliders.saturation.value),
      vibrance: parseFloat(sliders.vibrance.value),
      warmth: parseFloat(sliders.warmth.value),
      tint: parseFloat(sliders.tint.value),
      shadows_warmth: parseFloat(sliders.shadows_warmth.value),
      shadows_tint: parseFloat(sliders.shadows_tint.value),
      midtones_warmth: parseFloat(sliders.midtones_warmth.value),
      midtones_tint: parseFloat(sliders.midtones_tint.value),
      highlights_warmth: parseFloat(sliders.highlights_warmth.value),
      highlights_tint: parseFloat(sliders.highlights_tint.value),
      vignette: parseFloat(sliders.vignette.value),
      grain: parseFloat(sliders.grain.value),
      fade: parseFloat(sliders.fade.value),
      mono: monoToggle.checked,
      curves: getCurvesPayload(),
    };
  }

  let debounceTimer = null;
  function scheduleApplyWithOverrides() {
    updateSliderBadgeValues();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyWithOverrides, 50);
  }

  async function applyWithOverrides() {
    if (!sessionId) return;
    showMessage("");

    if (applyAbortController) {
      applyAbortController.abort();
    }
    applyAbortController = new AbortController();

    try {
      const res = await apiFetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          preset_id: activePresetId,
          adjustments: currentOverrides(),
        }),
        signal: applyAbortController.signal
      });
      const blob = await res.blob();
      displayEditedBlob(blob);
    } catch (err) {
      if (err.name !== "AbortError") showMessage(err.message);
    }
  }

  Object.values(sliders).forEach((input) =>
    input.addEventListener("input", scheduleApplyWithOverrides)
  );
  monoToggle.addEventListener("change", scheduleApplyWithOverrides);

  function resetToPreset() {
    if (!activePresetBase) return;
    seedSlidersFrom(activePresetBase);
    applyWithOverrides();
  }

  resetBtn.addEventListener("click", resetToPreset);
  resetStageBtn.addEventListener("click", resetToPreset);

  // ---------- Image Transformation Tools ----------
  rotateLeftBtn.addEventListener("click", () => transformImage("rotate", { angle: 270 }));
  rotateRightBtn.addEventListener("click", () => transformImage("rotate", { angle: 90 }));
  flipHBtn.addEventListener("click", () => transformImage("flip", { mode: "horizontal" }));
  flipVBtn.addEventListener("click", () => transformImage("flip", { mode: "vertical" }));

  async function transformImage(type, params) {
    if (!sessionId) return;
    showMessage("");
    try {
      const path = type === "rotate" ? "/api/transform/rotate" : "/api/transform/flip";
      await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, ...params }),
      });
      thumbCache = {};
      renderPresetGrid();
      await applyWithOverrides();
    } catch (err) {
      showMessage(err.message);
    }
  }

  // ---------- Before / After Comparison ----------
  function setComparing(state) {
    if (!sessionId) return;
    isComparing = state;
    originalImage.hidden = !state;
    compareBadge.hidden = !state;
    compareBtnLabel.textContent = state ? "Viewing Original" : "Compare Original";
    compareToggleBtn.classList.toggle("btn-primary", state);
  }

  compareToggleBtn.addEventListener("mousedown", () => setComparing(true));
  compareToggleBtn.addEventListener("mouseup", () => setComparing(false));
  compareToggleBtn.addEventListener("mouseleave", () => setComparing(false));

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (e.code === "Space" && !isComparing) {
      e.preventDefault();
      setComparing(true);
    } else if (e.code === "KeyR") {
      resetToPreset();
    } else if (e.code === "KeyD") {
      triggerDownload();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      setComparing(false);
    }
  });

  // ---------- Export & Download ----------
  downloadBtn.addEventListener("click", triggerDownload);

  async function triggerDownload() {
    if (!sessionId) return;
    setLoading(true, "Generating full resolution image...");
    showMessage("");
    try {
      const body = {
        session_id: sessionId,
        preset_id: activePresetId,
        adjustments: currentOverrides()
      };

      const res = await apiFetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, preset_id: activePresetId, adjustments: currentOverrides() }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "picsell-edited-photo.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ---------- Tone Curve Graph Studio ----------
  let curveChannel = "rgb";
  const curveNodes = {
    rgb: [0, 64, 128, 192, 255],
    r: [0, 64, 128, 192, 255],
    g: [0, 64, 128, 192, 255],
    b: [0, 64, 128, 192, 255]
  };

  const curveCanvas = el("curve-canvas");
  const curveCtx = curveCanvas ? curveCanvas.getContext("2d") : null;
  let activeNodeIndex = -1;

  const channelColors = {
    rgb: { stroke: "#6366f1", fill: "rgba(99, 102, 241, 0.18)", node: "#818cf8" },
    r: { stroke: "#ef4444", fill: "rgba(239, 68, 68, 0.18)", node: "#f87171" },
    g: { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.18)", node: "#34d399" },
    b: { stroke: "#3b82f6", fill: "rgba(59, 130, 246, 0.18)", node: "#60a5fa" }
  };

  function getCurvesPayload() {
    return curveNodes;
  }

  function drawCurveGraph() {
    if (!curveCanvas || !curveCtx) return;
    const w = curveCanvas.width;
    const h = curveCanvas.height;
    const padding = 12;
    const gw = w - padding * 2;
    const gh = h - padding * 2;

    curveCtx.clearRect(0, 0, w, h);

    // Grid (4x4)
    curveCtx.strokeStyle = "#1e293b";
    curveCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = padding + (gw / 4) * i;
      const y = padding + (gh / 4) * i;
      curveCtx.beginPath(); curveCtx.moveTo(x, padding); curveCtx.lineTo(x, h - padding); curveCtx.stroke();
      curveCtx.beginPath(); curveCtx.moveTo(padding, y); curveCtx.lineTo(w - padding, y); curveCtx.stroke();
    }

    // 45 deg diagonal line
    curveCtx.strokeStyle = "#334155";
    curveCtx.setLineDash([4, 4]);
    curveCtx.beginPath();
    curveCtx.moveTo(padding, h - padding);
    curveCtx.lineTo(w - padding, padding);
    curveCtx.stroke();
    curveCtx.setLineDash([]);

    // Nodes
    const nodes = curveNodes[curveChannel];
    const colors = channelColors[curveChannel];

    const points = nodes.map((val, idx) => ({
      x: padding + (gw / 4) * idx,
      y: h - padding - (val / 255) * gh
    }));

    // Spline curve
    curveCtx.beginPath();
    curveCtx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      curveCtx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    curveCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

    curveCtx.strokeStyle = colors.stroke;
    curveCtx.lineWidth = 2.5;
    curveCtx.stroke();

    // Fill area under curve
    curveCtx.lineTo(w - padding, h - padding);
    curveCtx.lineTo(padding, h - padding);
    curveCtx.closePath();
    curveCtx.fillStyle = colors.fill;
    curveCtx.fill();

    // Draw handles
    points.forEach((pt, idx) => {
      curveCtx.beginPath();
      curveCtx.arc(pt.x, pt.y, idx === activeNodeIndex ? 7 : 5, 0, Math.PI * 2);
      curveCtx.fillStyle = colors.node;
      curveCtx.fill();
      curveCtx.lineWidth = 2;
      curveCtx.strokeStyle = "#ffffff";
      curveCtx.stroke();
    });
  }

  if (curveCanvas) {
    drawCurveGraph();

    function getCanvasCoords(e) {
      const rect = curveCanvas.getBoundingClientRect();
      const scaleX = curveCanvas.width / rect.width;
      const scaleY = curveCanvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    curveCanvas.addEventListener("mousedown", (e) => {
      const { x, y } = getCanvasCoords(e);
      const padding = 12;
      const gw = curveCanvas.width - padding * 2;
      const gh = curveCanvas.height - padding * 2;
      const nodes = curveNodes[curveChannel];

      let closestIdx = -1;
      let minDist = 22;

      nodes.forEach((val, idx) => {
        const nx = padding + (gw / 4) * idx;
        const ny = curveCanvas.height - padding - (val / 255) * gh;
        const dist = Math.hypot(x - nx, y - ny);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = idx;
        }
      });

      if (closestIdx !== -1) {
        activeNodeIndex = closestIdx;
        drawCurveGraph();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (activeNodeIndex === -1) return;
      const { y } = getCanvasCoords(e);
      const padding = 12;
      const gh = curveCanvas.height - padding * 2;
      const clampedY = Math.max(padding, Math.min(curveCanvas.height - padding, y));
      const val = Math.round(((curveCanvas.height - padding - clampedY) / gh) * 255);

      curveNodes[curveChannel][activeNodeIndex] = val;
      drawCurveGraph();
      scheduleApplyWithOverrides();
    });

    window.addEventListener("mouseup", () => {
      if (activeNodeIndex !== -1) {
        activeNodeIndex = -1;
        drawCurveGraph();
      }
    });
  }

  const curveChannelsEl = el("curve-channels");
  if (curveChannelsEl) {
    curveChannelsEl.querySelectorAll(".curve-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        curveChannelsEl.querySelectorAll(".curve-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        curveChannel = btn.getAttribute("data-channel") || "rgb";
        drawCurveGraph();
      });
    });
  }

  document.querySelectorAll("[data-curve-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-curve-preset");
      const presets = {
        linear: [0, 64, 128, 192, 255],
        scurve: [0, 48, 128, 208, 255],
        matte: [28, 72, 128, 192, 255],
        punchy: [0, 36, 128, 220, 255]
      };
      if (presets[type]) {
        curveNodes[curveChannel] = [...presets[type]];
        drawCurveGraph();
        scheduleApplyWithOverrides();
      }
    });
  });

  const curveResetBtn = el("curve-reset-btn");
  if (curveResetBtn) {
    curveResetBtn.addEventListener("click", () => {
      curveNodes.rgb = [0, 64, 128, 192, 255];
      curveNodes.r = [0, 64, 128, 192, 255];
      curveNodes.g = [0, 64, 128, 192, 255];
      curveNodes.b = [0, 64, 128, 192, 255];
      drawCurveGraph();
      scheduleApplyWithOverrides();
    });
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();

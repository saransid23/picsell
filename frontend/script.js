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
    warmth: el("slider-warmth"),
    tint: el("slider-tint"),
    vignette: el("slider-vignette"),
    grain: el("slider-grain"),
    fade: el("slider-fade"),
  };

  const sliderValues = {
    brightness: el("val-brightness"),
    contrast: el("val-contrast"),
    saturation: el("val-saturation"),
    warmth: el("val-warmth"),
    tint: el("val-tint"),
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
        renderPresetGrid();
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
    renderPresetGrid();
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
    const warm = values.warmth ?? 0;
    const t = values.tint ?? 0;
    const vig = values.vignette ?? 0;
    const gr = values.grain ?? 0;
    const fd = values.fade ?? 0;

    sliders.brightness.value = bright;
    sliders.contrast.value = cont;
    sliders.saturation.value = sat;
    sliders.warmth.value = warm;
    sliders.tint.value = t;
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
    sliderValues.warmth.textContent = parseFloat(sliders.warmth.value).toFixed(2);
    sliderValues.tint.textContent = parseFloat(sliders.tint.value).toFixed(2);
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
      warmth: parseFloat(sliders.warmth.value),
      tint: parseFloat(sliders.tint.value),
      vignette: parseFloat(sliders.vignette.value),
      grain: parseFloat(sliders.grain.value),
      fade: parseFloat(sliders.fade.value),
      mono: monoToggle.checked,
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

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();

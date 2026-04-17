const API_BASE = "";

const PROJECTS_STORAGE_KEY = "aq_projects_v3";
const ACTIVE_PROJECT_STORAGE_KEY = "aq_active_project_v3";
const PROJECT_DRAFTS_STORAGE_KEY = "aq_project_drafts_v3";
const PROJECT_DATASET_SETTINGS_KEY = "aq_dataset_settings_v3";

const DEFAULT_PROJECTS = ["Игрулька", "Чебурашка", "Простоквашино"];

const state = {
  videoId: null,
  fileUrl: null,
  defects: [],
  projectName: "Игрулька",
  videoTitle: "...",
  executorName: "",
  selectedDefectId: null,
  pendingPoint: null,
  clickTimer: null,
  historyItems: [],
  historySort: {
    key: "created_at",
    direction: "desc",
  },
  formMode: "ai",
  analysisDone: false,
  reviewSubmitted: false,
  sidebarCollapsed: false,
  projects: [],
  activeHistoryReviewId: null,
  projectDrafts: {},
  dataset: {
    attachedZipName: "",
    attachedLink: "",
    savedMasks: [],
    trainingStatus: "Не запущено",
    settingsByProject: {},
    hasModel: false,
    datasetItemsCount: 0,
    sourceType: "",
  },
  maskDrawing: {
    enabled: false,
    drawing: false,
    erasing: false,
    brushSize: 14,
  },
  trainingPollTimer: null,
};

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),

  uploadMeta: document.getElementById("uploadMeta"),
  fileNameValue: document.getElementById("fileNameValue"),
  videoIdValue: document.getElementById("videoIdValue"),

  statusValue: document.getElementById("statusValue"),
  defectsCountValue: document.getElementById("defectsCountValue"),
  acceptedCountValue: document.getElementById("acceptedCountValue"),
  rejectedCountValue: document.getElementById("rejectedCountValue"),
  manualCountValue: document.getElementById("manualCountValue"),
  aiCountValue: document.getElementById("aiCountValue"),

  videoPlayer: document.getElementById("videoPlayer"),
  videoWrapper: document.getElementById("videoWrapper"),
  annotationLayer: document.getElementById("annotationLayer"),
  clickPreview: document.getElementById("clickPreview"),
  markerTooltip: document.getElementById("markerTooltip"),
  defectsList: document.getElementById("defectsList"),
  maskCanvas: document.getElementById("maskCanvas"),

  modeAiBtn: document.getElementById("modeAiBtn"),
  modeManualBtn: document.getElementById("modeManualBtn"),
  modeMaskBtn: document.getElementById("modeMaskBtn"),

  aiFormSection: document.getElementById("aiFormSection"),
  manualFormSection: document.getElementById("manualFormSection"),
  maskFormSection: document.getElementById("maskFormSection"),

  aiDefectSelect: document.getElementById("aiDefectSelect"),
  defectNameField: document.getElementById("defectNameField"),
  defectTypeSelect: document.getElementById("defectTypeSelect"),
  aiDefectTimeField: document.getElementById("aiDefectTimeField"),
  aiDecisionWrap: document.getElementById("aiDecisionWrap"),
  aiRejectBtn: document.getElementById("aiRejectBtn"),
  aiAcceptBtn: document.getElementById("aiAcceptBtn"),
  aiDefectCommentField: document.getElementById("aiDefectCommentField"),

  manualDefectNameInput: document.getElementById("manualDefectNameInput"),
  manualDefectTypeInput: document.getElementById("manualDefectTypeInput"),
  manualDefectTimeInput: document.getElementById("manualDefectTimeInput"),
  manualDefectCommentInput: document.getElementById("manualDefectCommentInput"),
  saveManualDefectBtn: document.getElementById("saveManualDefectBtn"),

  maskDefectNameInput: document.getElementById("maskDefectNameInput"),
  maskDefectTypeInput: document.getElementById("maskDefectTypeInput"),
  maskAnnotationCommentInput: document.getElementById("maskAnnotationCommentInput"),
  enableMaskDrawBtn: document.getElementById("enableMaskDrawBtn"),
  clearMaskBtn: document.getElementById("clearMaskBtn"),
  maskBrushSizeInput: document.getElementById("maskBrushSizeInput"),
  saveTrainingMaskBtn: document.getElementById("saveTrainingMaskBtn"),

  projectNameField: document.getElementById("projectNameField"),
  videoTitleField: document.getElementById("videoTitleField"),
  executorSelect: document.getElementById("executorSelect"),
  projectBreadcrumb: document.getElementById("projectBreadcrumb"),
  headerSubmitBtn: document.getElementById("headerSubmitBtn"),
  footerAnalyzeBtn: document.getElementById("footerAnalyzeBtn"),

  tabWorkspace: document.getElementById("tabWorkspace"),
  tabHistory: document.getElementById("tabHistory"),
  tabDataset: document.getElementById("tabDataset"),

  workspaceView: document.getElementById("workspaceView"),
  historyView: document.getElementById("historyView"),
  datasetView: document.getElementById("datasetView"),

  historyTableBody: document.getElementById("historyTableBody"),
  sortButtons: Array.from(document.querySelectorAll(".sort-btn")),

  datasetDropzone: document.getElementById("datasetDropzone"),
  datasetZipInput: document.getElementById("datasetZipInput"),
  datasetLinkInput: document.getElementById("datasetLinkInput"),
  attachDatasetBtn: document.getElementById("attachDatasetBtn"),
  exportDatasetBtn: document.getElementById("exportDatasetBtn"),
  trainModelBtn: document.getElementById("trainModelBtn"),
  datasetMasksCountValue: document.getElementById("datasetMasksCountValue"),
  datasetZipStatusValue: document.getElementById("datasetZipStatusValue"),
  datasetLinkStatusValue: document.getElementById("datasetLinkStatusValue"),
  datasetTrainingStatusValue: document.getElementById("datasetTrainingStatusValue"),
  datasetExamplesEmpty: document.getElementById("datasetExamplesEmpty"),
  datasetExamplesList: document.getElementById("datasetExamplesList"),

  manualDatasetFrameDropzone: document.getElementById("manualDatasetFrameDropzone"),
  manualDatasetMaskDropzone: document.getElementById("manualDatasetMaskDropzone"),
  manualDatasetFrameInput: document.getElementById("manualDatasetFrameInput"),
  manualDatasetMaskInput: document.getElementById("manualDatasetMaskInput"),
  manualDatasetNameInput: document.getElementById("manualDatasetNameInput"),
  manualDatasetTypeInput: document.getElementById("manualDatasetTypeInput"),
  manualDatasetCommentInput: document.getElementById("manualDatasetCommentInput"),
  saveManualDatasetBtn: document.getElementById("saveManualDatasetBtn"),

  catalogSidebar: document.getElementById("catalogSidebar"),
  sidebarToggleBtn: document.getElementById("sidebarToggleBtn"),
  addProjectBtn: document.getElementById("addProjectBtn"),
  projectCreateRow: document.getElementById("projectCreateRow"),
  newProjectInput: document.getElementById("newProjectInput"),
  saveProjectBtn: document.getElementById("saveProjectBtn"),
  cancelProjectBtn: document.getElementById("cancelProjectBtn"),
  projectsList: document.getElementById("projectsList"),
  catalogTitle: document.getElementById("catalogTitle"),
};

const controlEls = {
  root: null,
  playBtn: null,
  backBtn: null,
  forwardBtn: null,
  markBtn: null,
  brushBtn: null,
  eraserBtn: null,
  fullscreenBtn: null,
  scrubber: null,
  timeLabel: null,
};

const maskCtx = els.maskCanvas ? els.maskCanvas.getContext("2d") : null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeLabel(value) {
  if (!value) return "Без названия";
  return String(value).replaceAll("_", " ");
}

function normalizeAssetUrl(value) {
  if (!value) return "";
  const str = String(value).trim();
  if (!str) return "";
  if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("data:")) return str;
  if (str.startsWith("/")) return str;
  return `/${str.replace(/^\.?\//, "")}`;
}

function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "00:00.00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString("ru-RU");
  } catch {
    return value || "—";
  }
}

function middleEllipsis(filename, maxLength = 30) {
  if (!filename || filename.length <= maxLength) return filename;
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex > 0 ? filename.slice(dotIndex) : "";
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const available = maxLength - ext.length - 3;
  if (available <= 4) return filename;
  const leftCount = Math.ceil(available / 2);
  const rightCount = Math.floor(available / 2);
  return `${base.slice(0, leftCount)}...${base.slice(-rightCount)}${ext}`;
}

function ensureTypeOption(select, value) {
  if (!select || !value) return;
  const exists = [...select.options].some((opt) => opt.value === value);
  if (!exists) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function getCurrentHeaderText() {
  return `${state.projectName || "Без названия"} / ${state.videoTitle || "..."}`;
}

function updateHeaderTitle() {
  if (els.projectBreadcrumb) {
    els.projectBreadcrumb.textContent = getCurrentHeaderText();
  }
}

function setStatus(label) {
  if (els.statusValue) els.statusValue.textContent = label;
}

function setProjectName(value) {
  const next = (value || "").trim() || "Без названия";
  const prev = state.projectName;

  state.projectName = next;
  if (els.projectNameField) els.projectNameField.value = next;
  updateHeaderTitle();

  if (!state.projects.includes(next)) {
    state.projects.push(next);
    saveProjects();
  }

  if (prev !== next && state.projectDrafts[prev]) {
    state.projectDrafts[next] = state.projectDrafts[prev];
    delete state.projectDrafts[prev];
    saveProjectDrafts();
  }

  saveActiveProject();
  renderProjectsList();
}

function setVideoTitle(value) {
  state.videoTitle = (value || "").trim() || "...";
  updateHeaderTitle();
  saveCurrentDraft();
}

function setExecutorName(value) {
  state.executorName = value || "";
  saveCurrentDraft();
}

function saveProjects() {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state.projects));
}

function loadProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return [...DEFAULT_PROJECTS];
}

function saveActiveProject() {
  localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, state.projectName);
}

function loadActiveProject() {
  return localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) || DEFAULT_PROJECTS[0];
}

function saveProjectDrafts() {
  localStorage.setItem(PROJECT_DRAFTS_STORAGE_KEY, JSON.stringify(state.projectDrafts));
}

function loadProjectDrafts() {
  try {
    const raw = localStorage.getItem(PROJECT_DRAFTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return {};
}

function saveDatasetSettings() {
  localStorage.setItem(PROJECT_DATASET_SETTINGS_KEY, JSON.stringify(state.dataset.settingsByProject));
}

function loadDatasetSettings() {
  try {
    const raw = localStorage.getItem(PROJECT_DATASET_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return {};
}

function buildDraft() {
  return {
    videoId: state.videoId || null,
    fileUrl: state.fileUrl || "",
    videoTitle: state.videoTitle || "...",
    executorName: state.executorName || "",
    defects: Array.isArray(state.defects) ? state.defects : [],
    analysisDone: Boolean(state.analysisDone),
    reviewSubmitted: Boolean(state.reviewSubmitted),
    status: els.statusValue?.textContent || "Ожидание",
    uploadMeta: {
      fileName: els.fileNameValue?.title || "",
      videoId: state.videoId || "",
    },
  };
}

function saveCurrentDraft() {
  if (state.activeHistoryReviewId) return;
  state.projectDrafts[state.projectName] = buildDraft();
  saveProjectDrafts();
}

function applyDraft(projectName) {
  const draft = state.projectDrafts[projectName] || {
    videoId: null,
    fileUrl: "",
    videoTitle: "...",
    executorName: "",
    defects: [],
    analysisDone: false,
    reviewSubmitted: false,
    status: "Ожидание",
    uploadMeta: { fileName: "", videoId: "" },
  };

  state.videoId = draft.videoId || null;
  state.fileUrl = draft.fileUrl || "";
  state.videoTitle = draft.videoTitle || "...";
  state.executorName = draft.executorName || "";
  state.defects = Array.isArray(draft.defects) ? draft.defects : [];
  state.analysisDone = Boolean(draft.analysisDone);
  state.reviewSubmitted = Boolean(draft.reviewSubmitted);
  state.selectedDefectId = null;
  state.pendingPoint = null;
  state.activeHistoryReviewId = null;

  if (els.projectNameField) els.projectNameField.value = projectName;
  if (els.videoTitleField) els.videoTitleField.value = state.videoTitle === "..." ? "" : state.videoTitle;
  if (els.executorSelect) els.executorSelect.value = state.executorName;

  if (els.videoPlayer) {
    els.videoPlayer.pause();
    els.videoPlayer.removeAttribute("src");
    els.videoPlayer.load();
    if (state.fileUrl) {
      els.videoPlayer.src = state.fileUrl;
    }
  }

  if (draft.uploadMeta?.fileName || draft.uploadMeta?.videoId) {
    els.uploadMeta?.classList.remove("hidden");
    if (els.fileNameValue) {
      els.fileNameValue.textContent = middleEllipsis(draft.uploadMeta.fileName || "—", 30);
      els.fileNameValue.title = draft.uploadMeta.fileName || "";
    }
    if (els.videoIdValue) {
      els.videoIdValue.textContent = draft.uploadMeta.videoId || "—";
    }
  } else {
    els.uploadMeta?.classList.add("hidden");
    if (els.fileNameValue) {
      els.fileNameValue.textContent = "—";
      els.fileNameValue.title = "";
    }
    if (els.videoIdValue) {
      els.videoIdValue.textContent = "—";
    }
  }

  setStatus(draft.status || "Ожидание");
  updateHeaderTitle();
  updateCounters();
  updateAiSelect();
  renderDefects();
  renderMarkers();
  updateFormPanel();
  syncControls();
  syncFooterActionLabel();
  updateActionButtons();
}

function applyDatasetSettingsForProject(projectName) {
  const settings = state.dataset.settingsByProject[projectName] || {
    attachedZipName: "",
    attachedLink: "",
    trainingStatus: "Не запущено",
    hasModel: false,
    datasetItemsCount: 0,
    sourceType: "",
  };

  state.dataset.attachedZipName = settings.attachedZipName || "";
  state.dataset.attachedLink = settings.attachedLink || "";
  state.dataset.trainingStatus = settings.trainingStatus || "Не запущено";
  state.dataset.hasModel = Boolean(settings.hasModel);
  state.dataset.datasetItemsCount = Number(settings.datasetItemsCount || 0);
  state.dataset.sourceType = settings.sourceType || "";

  if (els.datasetLinkInput) {
    els.datasetLinkInput.value = state.dataset.attachedLink;
  }
}

function persistCurrentDatasetSettings() {
  state.dataset.settingsByProject[state.projectName] = {
    attachedZipName: state.dataset.attachedZipName || "",
    attachedLink: state.dataset.attachedLink || "",
    trainingStatus: state.dataset.trainingStatus || "Не запущено",
    hasModel: Boolean(state.dataset.hasModel),
    datasetItemsCount: Number(state.dataset.datasetItemsCount || 0),
    sourceType: state.dataset.sourceType || "",
  };
  saveDatasetSettings();
}

function updateCounters() {
  const total = state.defects.length;
  const accepted = state.defects.filter((item) => item.status === "accepted").length;
  const rejected = state.defects.filter((item) => item.status === "rejected").length;
  const ai = state.defects.filter((item) => item.source === "ai").length;
  const manual = state.defects.filter((item) => item.source === "manual").length;

  if (els.defectsCountValue) els.defectsCountValue.textContent = String(total);
  if (els.acceptedCountValue) els.acceptedCountValue.textContent = String(accepted);
  if (els.rejectedCountValue) els.rejectedCountValue.textContent = String(rejected);
  if (els.aiCountValue) els.aiCountValue.textContent = String(ai);
  if (els.manualCountValue) els.manualCountValue.textContent = String(manual);
}

function syncFooterActionLabel() {
  if (!els.footerAnalyzeBtn) return;
  els.footerAnalyzeBtn.textContent = state.analysisDone ? "Отправить" : "Анализ";
}

function updateActionButtons() {
  if (!els.footerAnalyzeBtn || !els.headerSubmitBtn) return;

  els.headerSubmitBtn.style.display = "none";

  if (!state.videoId) {
    els.footerAnalyzeBtn.style.display = "none";
    els.footerAnalyzeBtn.disabled = false;
    return;
  }

  els.footerAnalyzeBtn.style.display = "block";
  els.footerAnalyzeBtn.disabled = false;

  if (!state.analysisDone) {
    els.footerAnalyzeBtn.textContent = "Анализ";
    return;
  }

  if (state.reviewSubmitted) {
    els.footerAnalyzeBtn.style.display = "none";
    return;
  }

  els.footerAnalyzeBtn.textContent = "Отправить";
}

function renderUploadMeta(filename, videoId) {
  if (els.uploadMeta) els.uploadMeta.classList.remove("hidden");
  if (els.fileNameValue) {
    els.fileNameValue.textContent = middleEllipsis(filename, 30) || "—";
    els.fileNameValue.title = filename || "";
  }
  if (els.videoIdValue) {
    els.videoIdValue.textContent = videoId || "—";
  }
}

function clearPendingPoint() {
  state.pendingPoint = null;
  els.clickPreview?.classList.add("hidden");
}

function getDisplayedVideoRect() {
  if (!els.videoWrapper || !els.videoPlayer) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const wrapperWidth = els.videoWrapper.clientWidth;
  const wrapperHeight = els.videoWrapper.clientHeight;
  const videoWidth = els.videoPlayer.videoWidth;
  const videoHeight = els.videoPlayer.videoHeight;

  if (!wrapperWidth || !wrapperHeight || !videoWidth || !videoHeight) {
    return { left: 0, top: 0, width: wrapperWidth, height: wrapperHeight };
  }

  const videoAspect = videoWidth / videoHeight;
  const wrapperAspect = wrapperWidth / wrapperHeight;

  let width;
  let height;
  let left;
  let top;

  if (videoAspect > wrapperAspect) {
    width = wrapperWidth;
    height = width / videoAspect;
    left = 0;
    top = (wrapperHeight - height) / 2;
  } else {
    height = wrapperHeight;
    width = height * videoAspect;
    top = 0;
    left = (wrapperWidth - width) / 2;
  }

  return { left, top, width, height };
}

function resizeMaskCanvas() {
  if (!els.maskCanvas || !els.videoWrapper) return;
  els.maskCanvas.width = els.videoWrapper.clientWidth;
  els.maskCanvas.height = els.videoWrapper.clientHeight;
}

function clearMaskCanvas() {
  if (!maskCtx || !els.maskCanvas) return;
  maskCtx.clearRect(0, 0, els.maskCanvas.width, els.maskCanvas.height);
}

function toggleMaskCanvas() {
  if (!els.maskCanvas) return;

  const active = state.formMode === "mask";
  els.maskCanvas.classList.toggle("hidden", !active);
  els.maskCanvas.classList.toggle("active", active && state.maskDrawing.enabled);

  if (active) {
    els.maskCanvas.style.pointerEvents = state.maskDrawing.enabled ? "auto" : "none";
  } else {
    els.maskCanvas.style.pointerEvents = "none";
  }
}

function updateDrawToolButtons() {
  if (!controlEls.brushBtn || !controlEls.eraserBtn) return;

  controlEls.brushBtn.style.opacity =
    state.formMode === "mask" && state.maskDrawing.enabled && !state.maskDrawing.erasing ? "1" : "0.75";

  controlEls.eraserBtn.style.opacity =
    state.formMode === "mask" && state.maskDrawing.enabled && state.maskDrawing.erasing ? "1" : "0.75";
}

function setMaskDrawingEnabled(enabled, erasing = false) {
  state.maskDrawing.enabled = enabled;
  state.maskDrawing.erasing = enabled ? erasing : false;

  if (els.enableMaskDrawBtn) {
    els.enableMaskDrawBtn.textContent = enabled
      ? (erasing ? "Ластик включён" : "Кисть включена")
      : "Кисть";
  }

  toggleMaskCanvas();
  updateDrawToolButtons();
}

function drawMaskPoint(clientX, clientY) {
  if (!maskCtx || !els.maskCanvas) return;

  const rect = els.maskCanvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  if (state.maskDrawing.erasing) {
    maskCtx.globalCompositeOperation = "destination-out";
    maskCtx.beginPath();
    maskCtx.arc(x, y, state.maskDrawing.brushSize, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.globalCompositeOperation = "source-over";
    return;
  }

  maskCtx.fillStyle = "rgba(255,255,255,0.95)";
  maskCtx.beginPath();
  maskCtx.arc(x, y, state.maskDrawing.brushSize, 0, Math.PI * 2);
  maskCtx.fill();
}

function hideMarkerTooltip() {
  els.markerTooltip?.classList.add("hidden");
}

function showMarkerTooltip(defect, leftPct, topPct) {
  if (!els.markerTooltip) return;

  const sourceLabel = defect.source === "manual" ? "ручной" : "AI";
  const statusLabel =
    defect.status === "accepted"
      ? "принят"
      : defect.status === "rejected"
        ? "отклонён"
        : "новый";

  els.markerTooltip.innerHTML = `
    <strong>${escapeHtml(normalizeLabel(defect.label || defect.type))}</strong>
    <div>Тип: ${escapeHtml(defect.type || "other")}</div>
    <div>Время: ${formatTime(defect.time)}</div>
    <div>Источник: ${sourceLabel}</div>
    <div>Статус: ${statusLabel}</div>
    <div>Confidence: ${Number(defect.confidence ?? 1).toFixed(2)}</div>
  `;

  els.markerTooltip.style.left = `${Math.min(84, leftPct + 2)}%`;
  els.markerTooltip.style.top = `${Math.max(6, topPct - 4)}%`;
  els.markerTooltip.classList.remove("hidden");
}

function showPendingPoint(x, y) {
  if (!els.clickPreview || !els.videoWrapper) return;

  const displayed = getDisplayedVideoRect();
  const leftPct = ((displayed.left + displayed.width * x) / els.videoWrapper.clientWidth) * 100;
  const topPct = ((displayed.top + displayed.height * y) / els.videoWrapper.clientHeight) * 100;

  els.clickPreview.style.left = `${leftPct}%`;
  els.clickPreview.style.top = `${topPct}%`;
  els.clickPreview.classList.remove("hidden");
}

function getPendingAiDefects() {
  return state.defects
    .filter((item) => item.source === "ai" && item.status === "new")
    .sort((a, b) => a.time - b.time);
}

function updateAiSelect() {
  if (!els.aiDefectSelect) return;

  const items = getPendingAiDefects();
  els.aiDefectSelect.innerHTML = "";

  if (!items.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Нет необработанных дефектов";
    els.aiDefectSelect.appendChild(option);
    state.selectedDefectId = null;
    return;
  }

  items.forEach((defect) => {
    const option = document.createElement("option");
    option.value = defect.id;
    option.textContent = `${normalizeLabel(defect.label || defect.type)} • ${formatTime(defect.time)}`;
    els.aiDefectSelect.appendChild(option);
  });

  const stillExists = items.some((item) => item.id === state.selectedDefectId);
  if (!stillExists) {
    state.selectedDefectId = items[0].id;
  }

  els.aiDefectSelect.value = state.selectedDefectId;
}

function setFormMode(mode) {
  state.formMode = mode;

  els.modeAiBtn?.classList.toggle("active", mode === "ai");
  els.modeManualBtn?.classList.toggle("active", mode === "manual");
  els.modeMaskBtn?.classList.toggle("active", mode === "mask");

  els.aiFormSection?.classList.toggle("hidden", mode !== "ai");
  els.manualFormSection?.classList.toggle("hidden", mode !== "manual");
  els.maskFormSection?.classList.toggle("hidden", mode !== "mask");

  updateAiSelect();
  updateFormPanel();
  toggleMaskCanvas();
  updateDrawToolButtons();

  if (mode !== "mask") {
    setMaskDrawingEnabled(false);
  }
}

function updateFormPanel() {
  if (state.formMode === "manual") {
    const currentTime = els.videoPlayer?.currentTime || 0;
    if (!document.activeElement?.isSameNode(els.manualDefectTimeInput) && els.manualDefectTimeInput) {
      els.manualDefectTimeInput.value = currentTime.toFixed(2);
    }
    return;
  }

  if (state.formMode === "mask") {
    if (els.maskDefectNameInput && document.activeElement !== els.maskDefectNameInput && !els.maskDefectNameInput.value.trim()) {
      els.maskDefectNameInput.value = "manual defect mask";
    }
    return;
  }

  const defect = state.defects.find(
    (item) => item.id === state.selectedDefectId && item.source === "ai" && item.status === "new"
  );

  const hasPending = Boolean(defect) && !state.activeHistoryReviewId;
  els.aiDecisionWrap?.classList.toggle("hidden", !hasPending);

  if (!defect) {
    if (els.defectNameField) els.defectNameField.value = "";
    if (els.aiDefectTimeField) els.aiDefectTimeField.value = "";
    if (els.aiDefectCommentField) els.aiDefectCommentField.value = "";
    return;
  }

  ensureTypeOption(els.defectTypeSelect, defect.type);
  if (els.defectNameField) els.defectNameField.value = normalizeLabel(defect.label || defect.type);
  if (els.defectTypeSelect) els.defectTypeSelect.value = defect.type || "other";
  if (els.aiDefectTimeField) els.aiDefectTimeField.value = formatTime(defect.time);
  if (els.aiDefectCommentField) els.aiDefectCommentField.value = defect.comment || "";
}

function renderMarkers() {
  if (!els.annotationLayer || !els.videoWrapper) return;

  els.annotationLayer.innerHTML = "";
  hideMarkerTooltip();

  const displayed = getDisplayedVideoRect();

  state.defects.forEach((defect) => {
    if (typeof defect.x !== "number" || typeof defect.y !== "number") return;

    const leftPct = ((displayed.left + displayed.width * defect.x) / els.videoWrapper.clientWidth) * 100;
    const topPct = ((displayed.top + displayed.height * defect.y) / els.videoWrapper.clientHeight) * 100;

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `defect-marker ${defect.source === "manual" ? "manual" : ""} ${state.selectedDefectId === defect.id ? "active" : ""}`;
    marker.style.left = `${leftPct}%`;
    marker.style.top = `${topPct}%`;

    marker.addEventListener("mouseenter", () => showMarkerTooltip(defect, leftPct, topPct));
    marker.addEventListener("mouseleave", hideMarkerTooltip);
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedDefectId = defect.id;
      setFormMode(!state.activeHistoryReviewId && defect.source === "ai" && defect.status === "new" ? "ai" : "manual");
      updateAiSelect();
      updateFormPanel();
      renderMarkers();
      renderDefects();
    });

    els.annotationLayer.appendChild(marker);
  });
}

function renderDefects() {
  if (!els.defectsList) return;
  els.defectsList.innerHTML = "";

  if (!state.defects.length) {
    els.defectsList.className = "defects-list empty-state";
    els.defectsList.textContent = "Пока нет дефектов";
    return;
  }

  els.defectsList.className = "defects-list";

  [...state.defects]
    .sort((a, b) => a.time - b.time)
    .forEach((defect) => {
      const sourceLabel = defect.source === "manual" ? "ручной" : "ai";
      const statusLabel =
        defect.status === "accepted"
          ? "принят"
          : defect.status === "rejected"
            ? "отклонён"
            : "новый";

      const previewUrl = normalizeAssetUrl(defect.frame_url || defect.mask_url || "");

      const card = document.createElement("div");
      card.className = `defect-card ${state.selectedDefectId === defect.id ? "active" : ""}`;
      card.innerHTML = `
        <div class="defect-card-top">
          <div class="defect-card-top-left">
            <div class="defect-card-title">${escapeHtml(normalizeLabel(defect.label || defect.type))}</div>
            <div class="defect-meta-inline">
              <span class="chip ${defect.source === "manual" ? "chip-manual" : "chip-ai"}">${sourceLabel}</span>
              <span class="chip chip-status-${defect.status || "new"}">${statusLabel}</span>
              <span class="chip">${escapeHtml(defect.type || "other")}</span>
              <span class="chip">conf ${Number(defect.confidence ?? 1).toFixed(2)}</span>
            </div>
          </div>
          <div class="defect-card-time">${formatTime(defect.time)}</div>
        </div>
        ${defect.comment ? `<div class="defect-comment">${escapeHtml(defect.comment)}</div>` : ""}
        ${previewUrl ? `<div class="defect-preview"><img src="${escapeHtml(previewUrl)}" alt="" loading="lazy" /></div>` : ""}
      `;

      card.addEventListener("click", () => {
        state.selectedDefectId = defect.id;
        setFormMode(!state.activeHistoryReviewId && defect.source === "ai" && defect.status === "new" ? "ai" : "manual");
        updateAiSelect();
        updateFormPanel();
        renderMarkers();
        renderDefects();
        if (els.videoPlayer?.src) {
          els.videoPlayer.currentTime = defect.time || 0;
        }
      });

      els.defectsList.appendChild(card);
    });
}

function buildCustomControls() {
  if (controlEls.root || !els.videoWrapper) return;

  const controls = document.createElement("div");
  controls.className = "aq-controls";
  controls.innerHTML = `
    <div class="aq-controls__group">
      <button type="button" class="aq-btn aq-btn--icon" data-role="play" title="Плей / пауза">▶</button>
      <button type="button" class="aq-btn" data-role="back" title="Назад 0.5 секунды">−0.5с</button>
      <button type="button" class="aq-btn" data-role="forward" title="Вперёд 0.5 секунды">+0.5с</button>
      <button type="button" class="aq-btn aq-btn--icon" data-role="mark" title="Ручная метка">✎</button>
      <button type="button" class="aq-btn aq-btn--icon" data-role="brush" title="Кисть">🖌</button>
      <button type="button" class="aq-btn aq-btn--icon" data-role="eraser" title="Ластик">◌</button>
      <button type="button" class="aq-btn aq-btn--icon" data-role="fullscreen" title="Полный экран">⛶</button>
    </div>
    <input type="range" class="aq-scrubber" min="0" max="1000" value="0" step="1" data-role="scrubber" />
    <div class="aq-time" data-role="time">00:00.00 / 00:00.00</div>
  `;

  els.videoWrapper.appendChild(controls);

  controlEls.root = controls;
  controlEls.playBtn = controls.querySelector('[data-role="play"]');
  controlEls.backBtn = controls.querySelector('[data-role="back"]');
  controlEls.forwardBtn = controls.querySelector('[data-role="forward"]');
  controlEls.markBtn = controls.querySelector('[data-role="mark"]');
  controlEls.brushBtn = controls.querySelector('[data-role="brush"]');
  controlEls.eraserBtn = controls.querySelector('[data-role="eraser"]');
  controlEls.fullscreenBtn = controls.querySelector('[data-role="fullscreen"]');
  controlEls.scrubber = controls.querySelector('[data-role="scrubber"]');
  controlEls.timeLabel = controls.querySelector('[data-role="time"]');

  controlEls.playBtn.addEventListener("click", () => {
    if (!els.videoPlayer?.src) return;
    if (els.videoPlayer.paused) {
      els.videoPlayer.play().catch(() => {});
    } else {
      els.videoPlayer.pause();
    }
  });

  controlEls.backBtn.addEventListener("click", () => seekBy(-0.5));
  controlEls.forwardBtn.addEventListener("click", () => seekBy(0.5));

  controlEls.markBtn.addEventListener("click", () => {
    setFormMode("manual");
    if (els.manualDefectTimeInput) {
      els.manualDefectTimeInput.value = (els.videoPlayer?.currentTime || 0).toFixed(2);
    }
  });

  controlEls.brushBtn.addEventListener("click", () => {
    if (state.activeHistoryReviewId) return;
    setFormMode("mask");
    setMaskDrawingEnabled(true, false);
  });

  controlEls.eraserBtn.addEventListener("click", () => {
    if (state.activeHistoryReviewId) return;
    setFormMode("mask");
    setMaskDrawingEnabled(true, true);
  });

  controlEls.fullscreenBtn.addEventListener("click", toggleFullscreen);

  controlEls.scrubber.addEventListener("input", () => {
    if (!Number.isFinite(els.videoPlayer?.duration)) return;
    const ratio = Number(controlEls.scrubber.value) / 1000;
    els.videoPlayer.currentTime = els.videoPlayer.duration * ratio;
  });

  syncControls();
  updateDrawToolButtons();
}

function syncControls() {
  if (!els.videoPlayer || !controlEls.scrubber || !controlEls.timeLabel || !controlEls.playBtn) return;

  const current = els.videoPlayer.currentTime || 0;
  const duration = Number.isFinite(els.videoPlayer.duration) ? els.videoPlayer.duration : 0;
  const ratio = duration > 0 ? current / duration : 0;

  controlEls.scrubber.value = String(Math.max(0, Math.min(1000, Math.round(ratio * 1000))));
  controlEls.timeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  controlEls.playBtn.textContent = els.videoPlayer.paused ? "▶" : "❚❚";

  if (state.formMode === "manual" && els.manualDefectTimeInput) {
    els.manualDefectTimeInput.value = current.toFixed(2);
  }
}

function toggleFullscreen() {
  if (!els.videoWrapper) return;
  const fullscreenEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (!fullscreenEl) {
    els.videoWrapper.requestFullscreen?.() || els.videoWrapper.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }
}

function seekBy(seconds) {
  if (!els.videoPlayer) return;
  els.videoPlayer.currentTime = Math.max(0, (els.videoPlayer.currentTime || 0) + seconds);
  syncControls();
}

async function uploadFile(file) {
  state.activeHistoryReviewId = null;

  const formData = new FormData();
  formData.append("file", file);

  setStatus("Загрузка");

  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Ошибка загрузки");

  const data = await res.json();

  state.videoId = data.video_id;
  state.fileUrl = normalizeAssetUrl(data.file_url || "");
  state.videoTitle = file.name.replace(/\.[^/.]+$/, "") || "...";
  state.defects = [];
  state.selectedDefectId = null;
  state.analysisDone = false;
  state.reviewSubmitted = false;

  if (els.videoPlayer) els.videoPlayer.src = state.fileUrl;
  if (els.videoTitleField) els.videoTitleField.value = state.videoTitle === "..." ? "" : state.videoTitle;

  renderUploadMeta(file.name, state.videoId);
  updateHeaderTitle();
  clearPendingPoint();
  clearMaskCanvas();

  setStatus("Загружено");
  updateCounters();
  updateAiSelect();
  renderDefects();
  renderMarkers();
  updateFormPanel();
  syncControls();
  syncFooterActionLabel();
  updateActionButtons();
  saveCurrentDraft();
}

async function runAnalysis() {
  if (!state.videoId) {
    alert("Сначала загрузите видео");
    return;
  }

  if (!state.videoTitle || state.videoTitle === "...") {
    alert("Укажите наименование видео");
    els.videoTitleField?.focus();
    return;
  }

  setStatus("Анализ");
  if (els.footerAnalyzeBtn) els.footerAnalyzeBtn.disabled = true;

  const query = new URLSearchParams({ project_name: state.projectName }).toString();
  const res = await fetch(`${API_BASE}/analyze/${state.videoId}?${query}`);

  if (!res.ok) {
    if (els.footerAnalyzeBtn) els.footerAnalyzeBtn.disabled = false;
    throw new Error("Ошибка анализа");
  }

  const data = await res.json();
  state.defects = Array.isArray(data.defects) ? data.defects : [];
  state.analysisDone = true;
  state.reviewSubmitted = false;

  setStatus("Готово");
  updateCounters();
  updateAiSelect();
  renderDefects();
  renderMarkers();
  updateFormPanel();
  syncFooterActionLabel();
  updateActionButtons();
  saveCurrentDraft();
}

async function updateDefectDecision(defectId, status, comment) {
  const res = await fetch(`${API_BASE}/defects/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_id: state.videoId,
      defect_id: defectId,
      status,
      comment,
    }),
  });

  if (!res.ok) throw new Error("Не удалось обновить решение по дефекту");

  const data = await res.json();
  const updated = data.defect;
  state.defects = state.defects.map((item) => (item.id === updated.id ? updated : item));

  updateCounters();
  updateAiSelect();
  renderDefects();
  renderMarkers();
  updateFormPanel();
  saveCurrentDraft();
}

async function addManualDefect() {
  if (!state.videoId) {
    alert("Сначала загрузите и проанализируйте видео");
    return;
  }

  const nameValue = els.manualDefectNameInput?.value.trim();
  const typeValue = els.manualDefectTypeInput?.value;
  const timeValue = Number(els.manualDefectTimeInput?.value);
  const commentValue = els.manualDefectCommentInput?.value.trim() || "";

  if (!nameValue) {
    alert("Введите наименование дефекта");
    return;
  }

  if (Number.isNaN(timeValue) || timeValue < 0) {
    alert("Введите корректный тайминг");
    return;
  }

  const payload = {
    video_id: state.videoId,
    label: nameValue,
    time: timeValue,
    type: typeValue,
    x: state.pendingPoint?.x ?? 0.5,
    y: state.pendingPoint?.y ?? 0.5,
    comment: commentValue,
    confidence: 1.0,
  };

  const res = await fetch(`${API_BASE}/defects/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Не удалось добавить ручной дефект");

  const data = await res.json();
  const defect = data.defect || payload;

  state.defects.push(defect);
  state.selectedDefectId = defect.id;

  if (els.manualDefectNameInput) els.manualDefectNameInput.value = "";
  if (els.manualDefectCommentInput) els.manualDefectCommentInput.value = "";
  clearPendingPoint();

  updateCounters();
  renderDefects();
  renderMarkers();
  updateFormPanel();
  saveCurrentDraft();
}

function exportMaskCanvasAsArray() {
  if (!els.videoPlayer || !els.maskCanvas) return [];
  const temp = document.createElement("canvas");
  temp.width = els.videoPlayer.videoWidth;
  temp.height = els.videoPlayer.videoHeight;
  const tctx = temp.getContext("2d");
  tctx.drawImage(els.maskCanvas, 0, 0, temp.width, temp.height);

  const imageData = tctx.getImageData(0, 0, temp.width, temp.height).data;
  const mask = [];

  for (let y = 0; y < temp.height; y += 1) {
    const row = [];
    for (let x = 0; x < temp.width; x += 1) {
      const index = (y * temp.width + x) * 4;
      row.push(imageData[index + 3] > 0 ? 255 : 0);
    }
    mask.push(row);
  }

  return mask;
}

async function saveTrainingMask() {
  if (state.activeHistoryReviewId) {
    alert("В режиме истории редактирование отключено");
    return;
  }

  if (!state.videoId) {
    alert("Сначала загрузите видео");
    return;
  }

  const name = (els.maskDefectNameInput?.value || "").trim();
  const type = els.maskDefectTypeInput?.value || "deformation_mask";
  const comment = (els.maskAnnotationCommentInput?.value || "").trim();

  if (!name) {
    alert("Введите наименование дефекта");
    return;
  }

  const res = await fetch(`${API_BASE}/training/annotation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_name: state.projectName,
      video_id: state.videoId,
      time: Number((els.videoPlayer?.currentTime || 0).toFixed(2)),
      type,
      name,
      comment,
      mask: exportMaskCanvasAsArray(),
    }),
  });

  if (!res.ok) throw new Error("Не удалось сохранить маску");

  await loadTrainingAnnotations();
  clearMaskCanvas();
  if (els.maskAnnotationCommentInput) els.maskAnnotationCommentInput.value = "";
  alert("Пример сохранён в датасет");
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Файл не выбран"));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function clearDatasetImagePreview(kind) {
  const dropzone = kind === "frame" ? els.manualDatasetFrameDropzone : els.manualDatasetMaskDropzone;
  const input = kind === "frame" ? els.manualDatasetFrameInput : els.manualDatasetMaskInput;

  if (input) input.value = "";
  dropzone?.querySelector(".dataset-upload-preview")?.remove();
}

function createDatasetImagePreview(file, kind) {
  const dropzone = kind === "frame" ? els.manualDatasetFrameDropzone : els.manualDatasetMaskDropzone;
  if (!dropzone || !file) return;

  const reader = new FileReader();
  reader.onload = () => {
    dropzone.querySelector(".dataset-upload-preview")?.remove();

    const fileName = file.name || (kind === "frame" ? "frame image" : "mask image");
    const preview = document.createElement("div");
    preview.className = "dataset-upload-preview";
    preview.innerHTML = `
      <button class="dataset-upload-remove" type="button" title="Удалить">×</button>
      <img src="${reader.result}" alt="${escapeHtml(fileName)}" />
    `;

    preview.querySelector(".dataset-upload-remove")?.addEventListener("click", (event) => {
      event.stopPropagation();
      clearDatasetImagePreview(kind);
    });

    dropzone.appendChild(preview);
  };
  reader.readAsDataURL(file);
}

function bindDatasetImageInputPreview(inputEl, kind) {
  inputEl?.addEventListener("change", () => {
    const file = inputEl.files?.[0];
    if (!file) {
      clearDatasetImagePreview(kind);
      return;
    }
    createDatasetImagePreview(file, kind);
  });
}

async function saveManualDatasetExample() {
  const frameFile = els.manualDatasetFrameInput?.files?.[0] || null;
  const maskFile = els.manualDatasetMaskInput?.files?.[0] || null;
  const name = (els.manualDatasetNameInput?.value || "").trim();
  const type = els.manualDatasetTypeInput?.value || "other";
  const comment = (els.manualDatasetCommentInput?.value || "").trim();

  if (!frameFile) return alert("Выбери frame image");
  if (!maskFile) return alert("Выбери mask image");
  if (!name) return alert("Введите наименование дефекта");

  const frameDataUrl = await readFileAsDataURL(frameFile);
  const maskDataUrl = await readFileAsDataURL(maskFile);

  const res = await fetch(`${API_BASE}/training/annotation/manual-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_name: state.projectName,
      name,
      type,
      comment,
      frame_data_url: frameDataUrl,
      mask_data_url: maskDataUrl,
    }),
  });

  if (!res.ok) throw new Error("Не удалось добавить свой пример");

  clearDatasetImagePreview("frame");
  clearDatasetImagePreview("mask");
  if (els.manualDatasetNameInput) els.manualDatasetNameInput.value = "";
  if (els.manualDatasetCommentInput) els.manualDatasetCommentInput.value = "";

  await loadTrainingAnnotations();
  alert("Пример добавлен в датасет");
}

async function deleteTrainingAnnotation(annotationId) {
  const res = await fetch(`${API_BASE}/training/annotation/${annotationId}`, {
    method: "DELETE",
  });

  if (!res.ok) throw new Error("Не удалось удалить пример");
  await loadTrainingAnnotations();
}

async function exportProjectDataset() {
  const query = new URLSearchParams({ project_name: state.projectName }).toString();
  window.open(`${API_BASE}/training/export?${query}`, "_blank");
}

async function fetchProjectDatasetStatus() {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(state.projectName)}/dataset/status`);
  if (!res.ok) throw new Error("Не удалось получить статус датасета");
  return res.json();
}

async function uploadProjectDatasetZip(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(state.projectName)}/dataset/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить ZIP датасета");
  }

  return res.json();
}

async function saveProjectDatasetLink(url) {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(state.projectName)}/dataset/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось привязать ссылку");
  }

  return res.json();
}

async function startProjectTraining() {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(state.projectName)}/train`, {
    method: "POST",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось запустить обучение");
  }

  return res.json();
}

async function fetchProjectTrainStatus() {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(state.projectName)}/train-status`);
  if (!res.ok) throw new Error("Не удалось получить статус обучения");
  return res.json();
}

function stopTrainingPoll() {
  if (state.trainingPollTimer) {
    clearInterval(state.trainingPollTimer);
    state.trainingPollTimer = null;
  }
}

function startTrainingPoll() {
  stopTrainingPoll();

  state.trainingPollTimer = window.setInterval(async () => {
    try {
      const status = await fetchProjectTrainStatus();
      state.dataset.trainingStatus = mapTrainStatusLabel(status.train_status, status.has_model);
      state.dataset.hasModel = Boolean(status.has_model);
      persistCurrentDatasetSettings();
      renderDatasetView();

      if (status.train_status !== "training") {
        stopTrainingPoll();
      }
    } catch (error) {
      console.error(error);
      stopTrainingPoll();
    }
  }, 3000);
}

function mapTrainStatusLabel(status, hasModel = false) {
  if (status === "training") return "Обучение...";
  if (status === "done") return hasModel ? "Модель обучена" : "Готово";
  if (status === "error") return "Ошибка обучения";
  if (status === "idle" && hasModel) return "Модель обучена";
  return "Не запущено";
}

async function refreshProjectDatasetAndTrainStatus() {
  try {
    const datasetStatus = await fetchProjectDatasetStatus();
    state.dataset.attachedZipName = datasetStatus.zip_filename || "";
    state.dataset.attachedLink = datasetStatus.source_url || "";
    state.dataset.datasetItemsCount = Number(datasetStatus.items_count || 0);
    state.dataset.hasModel = Boolean(datasetStatus.has_model);
    state.dataset.sourceType = datasetStatus.source_type || "";
    if (els.datasetLinkInput) {
      els.datasetLinkInput.value = state.dataset.attachedLink;
    }
  } catch (error) {
    console.error(error);
  }

  try {
    const trainStatus = await fetchProjectTrainStatus();
    state.dataset.trainingStatus = mapTrainStatusLabel(trainStatus.train_status, trainStatus.has_model);
    state.dataset.hasModel = Boolean(trainStatus.has_model);

    if (trainStatus.train_status === "training") {
      startTrainingPoll();
    } else {
      stopTrainingPoll();
    }
  } catch (error) {
    console.error(error);
  }

  persistCurrentDatasetSettings();
  renderDatasetView();
}

async function submitReview(action) {
  if (!state.videoId) return alert("Сначала загрузите видео");
  if (!state.videoTitle || state.videoTitle === "...") {
    alert("Укажите наименование видео");
    els.videoTitleField?.focus();
    return;
  }

  const res = await fetch(`${API_BASE}/reviews/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_id: state.videoId,
      project_name: `${state.projectName} / ${state.videoTitle}`,
      reviewer_name: "Анна Кузнецова",
      executor_name: state.executorName,
      action,
    }),
  });

  if (!res.ok) throw new Error("Не удалось сохранить проверку");

  await loadHistory();
  state.reviewSubmitted = true;
  saveCurrentDraft();
}

async function loadReviewDetail(reviewId) {
  const res = await fetch(`${API_BASE}/reviews/${reviewId}`);
  if (!res.ok) throw new Error("Не удалось загрузить детали проверки");
  return res.json();
}

function sortHistoryItems(items) {
  const { key, direction } = state.historySort;
  const sign = direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av ?? "").localeCompare(String(bv ?? ""), "ru") * sign;
  });
}

function filteredHistoryItems() {
  return state.historyItems.filter((item) => String(item.project_name || "").startsWith(state.projectName));
}

async function openHistoryItem(item) {
  try {
    const data = await loadReviewDetail(item.review_id);
    const review = data.review || item;
    const defects = Array.isArray(data.defects) ? data.defects : [];

    const parts = String(review.project_name || "").split(" / ");
    state.projectName = parts[0] || "Без названия";
    state.videoTitle = parts.slice(1).join(" / ") || "...";
    state.videoId = review.video_id || null;
    state.fileUrl = "";
    state.executorName = review.executor_name || "";
    state.defects = defects;
    state.analysisDone = true;
    state.reviewSubmitted = true;
    state.selectedDefectId = null;
    state.activeHistoryReviewId = review.review_id;

    if (!state.projects.includes(state.projectName)) {
      state.projects.push(state.projectName);
      saveProjects();
    }

    if (els.projectNameField) els.projectNameField.value = state.projectName;
    if (els.videoTitleField) els.videoTitleField.value = state.videoTitle === "..." ? "" : state.videoTitle;
    if (els.executorSelect) els.executorSelect.value = state.executorName;

    if (els.videoPlayer) {
      els.videoPlayer.pause();
      els.videoPlayer.removeAttribute("src");
      els.videoPlayer.load();
    }

    els.uploadMeta?.classList.remove("hidden");
    if (els.fileNameValue) {
      els.fileNameValue.textContent = middleEllipsis(review.filename || "Историческая проверка", 30);
      els.fileNameValue.title = review.filename || "Историческая проверка";
    }
    if (els.videoIdValue) {
      els.videoIdValue.textContent = review.video_id || "—";
    }

    renderProjectsList();
    updateHeaderTitle();
    setStatus(`История • ${review.status || "submitted"}`);
    updateCounters();
    updateAiSelect();
    renderDefects();
    renderMarkers();
    updateFormPanel();
    syncControls();
    syncFooterActionLabel();
    updateActionButtons();
    showWorkspace();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    alert("Не удалось открыть проверку из истории");
  }
}

function renderHistoryTable() {
  if (!els.historyTableBody) return;
  els.historyTableBody.innerHTML = "";

  const filtered = filteredHistoryItems();
  if (!filtered.length) {
    els.historyTableBody.innerHTML = `
      <tr>
        <td colspan="10" class="history-empty">История проекта пока пуста</td>
      </tr>
    `;
    return;
  }

  sortHistoryItems(filtered).forEach((item) => {
    const row = document.createElement("tr");
    row.style.cursor = "pointer";
    row.innerHTML = `
      <td>${escapeHtml(item.project_name || "Без названия")}</td>
      <td>${escapeHtml(item.executor_name || "—")}</td>
      <td>${escapeHtml(item.video_id || "—")}</td>
      <td>${formatDate(item.created_at)}</td>
      <td>${escapeHtml(item.status || "—")}</td>
      <td>${item.ai_count ?? item.total_defects ?? 0}</td>
      <td>${item.manual_count ?? 0}</td>
      <td>${item.accepted_count ?? 0}</td>
      <td>${item.rejected_count ?? 0}</td>
      <td>${escapeHtml(item.reviewer_name || "—")}</td>
    `;
    row.addEventListener("click", () => openHistoryItem(item));
    els.historyTableBody.appendChild(row);
  });
}

async function loadHistory() {
  try {
    const res = await fetch(`${API_BASE}/reviews/history`);
    if (!res.ok) return;
    const data = await res.json();
    state.historyItems = Array.isArray(data.items) ? data.items : [];
    renderHistoryTable();
  } catch {
    state.historyItems = [];
    renderHistoryTable();
  }
}

function makeDatasetPreviewCard(item) {
  const frameUrl = normalizeAssetUrl(item.frame_url);
  const maskUrl = normalizeAssetUrl(item.mask_url);
  const initialUrl = frameUrl || maskUrl || "";

  const card = document.createElement("div");
  card.className = "dataset-example-card";

  card.innerHTML = `
    <div class="dataset-example-preview">
      ${
        initialUrl
          ? `<img src="${escapeHtml(initialUrl)}" alt="${escapeHtml(item.label)}" loading="lazy" />`
          : `<div class="dataset-preview-empty">Нет превью</div>`
      }
      <div class="dataset-preview-switcher">
        <button class="dataset-preview-btn active" type="button" data-preview-mode="frame" ${frameUrl ? "" : "disabled"}>Frame</button>
        <button class="dataset-preview-btn" type="button" data-preview-mode="mask" ${maskUrl ? "" : "disabled"}>Mask</button>
      </div>
    </div>

    <div class="dataset-example-body">
      <div class="defect-card-title">${escapeHtml(item.label)}</div>
      <div class="dataset-example-meta">
        <span class="chip">${escapeHtml(item.type)}</span>
        <span class="chip">${formatTime(item.time)}</span>
        ${item.created_at ? `<span class="chip">${escapeHtml(formatDate(item.created_at))}</span>` : ""}
      </div>
      ${item.comment ? `<div class="defect-comment">${escapeHtml(item.comment)}</div>` : ""}
      <div class="dataset-actions-row">
        <button class="secondary-btn dataset-open-btn" type="button" data-open-preview>Открыть</button>
        <button class="danger-btn" type="button" data-delete-annotation="${escapeHtml(item.id)}">Удалить</button>
      </div>
    </div>
  `;

  const previewWrap = card.querySelector(".dataset-example-preview");
  const frameBtn = card.querySelector('[data-preview-mode="frame"]');
  const maskBtn = card.querySelector('[data-preview-mode="mask"]');
  const openBtn = card.querySelector("[data-open-preview]");
  let currentMode = frameUrl ? "frame" : "mask";

  function renderPreview(mode) {
    const nextUrl = mode === "mask" ? maskUrl : frameUrl;
    currentMode = mode;

    frameBtn?.classList.toggle("active", mode === "frame");
    maskBtn?.classList.toggle("active", mode === "mask");

    previewWrap.querySelector("img")?.remove();
    previewWrap.querySelector(".dataset-preview-empty")?.remove();

    if (!nextUrl) {
      const empty = document.createElement("div");
      empty.className = "dataset-preview-empty";
      empty.textContent = mode === "mask" ? "Нет mask preview" : "Нет frame preview";
      previewWrap.insertBefore(empty, previewWrap.firstChild);
      return;
    }

    const img = document.createElement("img");
    img.src = nextUrl;
    img.alt = item.label;
    img.loading = "lazy";
    previewWrap.insertBefore(img, previewWrap.firstChild);
  }

  frameBtn?.addEventListener("click", () => frameUrl && renderPreview("frame"));
  maskBtn?.addEventListener("click", () => maskUrl && renderPreview("mask"));
  openBtn?.addEventListener("click", () => {
    const url = currentMode === "mask" ? (maskUrl || frameUrl) : (frameUrl || maskUrl);
    if (url) window.open(url, "_blank");
  });

  return card;
}

function renderDatasetView() {
  if (!els.datasetExamplesList || !els.datasetExamplesEmpty) return;

  const items = state.dataset.savedMasks.filter((item) => item.project_name === state.projectName);

  if (els.datasetMasksCountValue) {
    const totalMasks = Math.max(items.length, state.dataset.datasetItemsCount || 0);
    els.datasetMasksCountValue.textContent = String(totalMasks);
  }
  if (els.datasetZipStatusValue) {
    els.datasetZipStatusValue.textContent = state.dataset.attachedZipName ? "Да" : "Нет";
  }
  if (els.datasetLinkStatusValue) {
    els.datasetLinkStatusValue.textContent = state.dataset.attachedLink ? "Да" : "Нет";
  }
  if (els.datasetTrainingStatusValue) {
    els.datasetTrainingStatusValue.textContent = state.dataset.trainingStatus || "Не запущено";
  }

  els.datasetExamplesList.innerHTML = "";

  if (!items.length) {
    els.datasetExamplesEmpty.classList.remove("hidden");
    els.datasetExamplesList.classList.add("hidden");
    return;
  }

  els.datasetExamplesEmpty.classList.add("hidden");
  els.datasetExamplesList.classList.remove("hidden");

  items.forEach((item) => {
    els.datasetExamplesList.appendChild(makeDatasetPreviewCard(item));
  });

  els.datasetExamplesList.querySelectorAll("[data-delete-annotation]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const annotationId = button.getAttribute("data-delete-annotation");
      if (!annotationId) return;

      try {
        await deleteTrainingAnnotation(annotationId);
      } catch (error) {
        console.error(error);
        alert("Не удалось удалить пример");
      }
    });
  });
}

async function loadTrainingAnnotations() {
  const query = new URLSearchParams({ project_name: state.projectName }).toString();
  const res = await fetch(`${API_BASE}/training/annotations?${query}`);
  if (!res.ok) throw new Error("Не удалось загрузить annotations");

  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];

  state.dataset.savedMasks = items.map((item) => ({
    id: item.id,
    project_name: item.project_name || state.projectName,
    frame_url: normalizeAssetUrl(item.frame_url || ""),
    mask_url: normalizeAssetUrl(item.mask_url || ""),
    label: item.name || "Без названия",
    type: item.type || "other",
    time: Number(item.time || 0),
    comment: item.comment || "",
    created_at: item.created_at || "",
    video_id: item.video_id || "",
  }));

  renderDatasetView();
}

function showWorkspace() {
  els.workspaceView?.classList.remove("hidden");
  els.historyView?.classList.add("hidden");
  els.datasetView?.classList.add("hidden");
  els.tabWorkspace?.classList.add("active");
  els.tabHistory?.classList.remove("active");
  els.tabDataset?.classList.remove("active");
}

async function showHistory() {
  els.workspaceView?.classList.add("hidden");
  els.historyView?.classList.remove("hidden");
  els.datasetView?.classList.add("hidden");
  els.tabWorkspace?.classList.remove("active");
  els.tabHistory?.classList.add("active");
  els.tabDataset?.classList.remove("active");
  await loadHistory();
}

async function showDataset() {
  els.workspaceView?.classList.add("hidden");
  els.historyView?.classList.add("hidden");
  els.datasetView?.classList.remove("hidden");
  els.tabWorkspace?.classList.remove("active");
  els.tabHistory?.classList.remove("active");
  els.tabDataset?.classList.add("active");

  await refreshProjectDatasetAndTrainStatus();
  await loadTrainingAnnotations();
}

function placeMarkerFromClick(event) {
  if (!state.videoId || state.formMode === "mask" || state.activeHistoryReviewId) return;

  const displayed = getDisplayedVideoRect();
  const rect = els.videoWrapper.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;

  const insideVideo =
    localX >= displayed.left &&
    localX <= displayed.left + displayed.width &&
    localY >= displayed.top &&
    localY <= displayed.top + displayed.height;

  if (!insideVideo) return;

  state.pendingPoint = {
    x: Math.max(0, Math.min(1, (localX - displayed.left) / displayed.width)),
    y: Math.max(0, Math.min(1, (localY - displayed.top) / displayed.height)),
  };

  showPendingPoint(state.pendingPoint.x, state.pendingPoint.y);

  if (state.formMode === "manual" && els.manualDefectTimeInput) {
    els.manualDefectTimeInput.value = (els.videoPlayer?.currentTime || 0).toFixed(2);
  }
}

function handleVideoWrapperClick(event) {
  const markerClicked = event.target.closest(".defect-marker");
  const controlClicked = event.target.closest(".aq-controls");
  const canvasClicked = event.target === els.maskCanvas;

  if (markerClicked || controlClicked || canvasClicked) return;

  if (state.clickTimer) {
    clearTimeout(state.clickTimer);
    state.clickTimer = null;
  }

  state.clickTimer = window.setTimeout(() => {
    placeMarkerFromClick(event);
    state.clickTimer = null;
  }, 180);
}

function handleVideoWrapperDoubleClick(event) {
  const markerClicked = event.target.closest(".defect-marker");
  const controlClicked = event.target.closest(".aq-controls");
  const canvasClicked = event.target === els.maskCanvas;

  if (markerClicked || controlClicked || canvasClicked || state.activeHistoryReviewId) return;

  if (state.clickTimer) {
    clearTimeout(state.clickTimer);
    state.clickTimer = null;
  }

  if (!els.videoPlayer?.src) return;
  if (els.videoPlayer.paused) {
    els.videoPlayer.play().catch(() => {});
  } else {
    els.videoPlayer.pause();
  }
}

function renderProjectsList() {
  if (!els.projectsList) return;
  els.projectsList.innerHTML = "";

  state.projects.forEach((projectName) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `project-item ${projectName === state.projectName ? "active" : ""}`;
    btn.innerHTML = `<span class="project-item__name">${escapeHtml(projectName)}</span>`;
    btn.addEventListener("click", () => switchProject(projectName));
    els.projectsList.appendChild(btn);
  });
}

async function switchProject(projectName) {
  if (!projectName) return;
  if (!state.activeHistoryReviewId) saveCurrentDraft();

  stopTrainingPoll();
  state.projectName = projectName;
  saveActiveProject();
  renderProjectsList();
  applyDatasetSettingsForProject(projectName);
  applyDraft(projectName);

  try {
    await refreshProjectDatasetAndTrainStatus();
  } catch (error) {
    console.error(error);
  }
}

function openProjectCreateRow() {
  els.projectCreateRow?.classList.remove("hidden");
  if (els.newProjectInput) {
    els.newProjectInput.value = "";
    setTimeout(() => els.newProjectInput.focus(), 0);
  }
}

function closeProjectCreateRow() {
  els.projectCreateRow?.classList.add("hidden");
  if (els.newProjectInput) els.newProjectInput.value = "";
}

async function addProject(projectName) {
  const clean = (projectName || "").trim();
  if (!clean) return;

  if (!state.projects.includes(clean)) {
    state.projects.push(clean);
    saveProjects();
  }

  if (!state.projectDrafts[clean]) {
    state.projectDrafts[clean] = {
      videoId: null,
      fileUrl: "",
      videoTitle: "...",
      executorName: "",
      defects: [],
      analysisDone: false,
      reviewSubmitted: false,
      status: "Ожидание",
      uploadMeta: { fileName: "", videoId: "" },
    };
    saveProjectDrafts();
  }

  closeProjectCreateRow();
  await switchProject(clean);
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  els.catalogSidebar?.classList.toggle("collapsed", state.sidebarCollapsed);

  const appShell = document.querySelector(".app-shell-with-sidebar");
  appShell?.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);

  if (els.sidebarToggleBtn) {
    els.sidebarToggleBtn.textContent = state.sidebarCollapsed ? "›" : "‹";
  }
}

function bindUploadEvents() {
  els.dropzone?.addEventListener("click", () => els.fileInput?.click());

  els.fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadFile(file);
    } catch (error) {
      console.error(error);
      setStatus("Ошибка");
      alert("Не удалось загрузить файл");
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.dropzone.classList.remove("dragover");
    });
  });

  els.dropzone?.addEventListener("drop", async (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadFile(file);
    } catch (error) {
      console.error(error);
      setStatus("Ошибка");
      alert("Не удалось загрузить файл");
    }
  });
}

function bindManualDatasetDropzones() {
  els.manualDatasetFrameDropzone?.addEventListener("click", () => els.manualDatasetFrameInput?.click());
  els.manualDatasetMaskDropzone?.addEventListener("click", () => els.manualDatasetMaskInput?.click());

  ["dragenter", "dragover"].forEach((eventName) => {
    els.manualDatasetFrameDropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.manualDatasetFrameDropzone.classList.add("dragover");
    });

    els.manualDatasetMaskDropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.manualDatasetMaskDropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.manualDatasetFrameDropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.manualDatasetFrameDropzone.classList.remove("dragover");
    });

    els.manualDatasetMaskDropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.manualDatasetMaskDropzone.classList.remove("dragover");
    });
  });

  els.manualDatasetFrameDropzone?.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !els.manualDatasetFrameInput) return;

    const dt = new DataTransfer();
    dt.items.add(file);
    els.manualDatasetFrameInput.files = dt.files;
    createDatasetImagePreview(file, "frame");
  });

  els.manualDatasetMaskDropzone?.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !els.manualDatasetMaskInput) return;

    const dt = new DataTransfer();
    dt.items.add(file);
    els.manualDatasetMaskInput.files = dt.files;
    createDatasetImagePreview(file, "mask");
  });

  bindDatasetImageInputPreview(els.manualDatasetFrameInput, "frame");
  bindDatasetImageInputPreview(els.manualDatasetMaskInput, "mask");
}

function bindDatasetDropzone() {
  els.datasetDropzone?.addEventListener("click", () => els.datasetZipInput?.click());

  els.datasetZipInput?.addEventListener("change", async () => {
    const zipFile = els.datasetZipInput.files?.[0] || null;
    if (!zipFile) return;

    try {
      state.dataset.attachedZipName = zipFile.name;
      state.dataset.trainingStatus = "Загрузка датасета...";
      renderDatasetView();

      const data = await uploadProjectDatasetZip(zipFile);

      state.dataset.attachedZipName = data.zip_filename || zipFile.name;
      state.dataset.attachedLink = "";
      state.dataset.datasetItemsCount = Number(data.items_count || 0);
      state.dataset.sourceType = data.source_type || "zip";
      state.dataset.trainingStatus = "Датасет загружен";
      persistCurrentDatasetSettings();

      await refreshProjectDatasetAndTrainStatus();
      renderDatasetView();
      alert(`ZIP датасет подключён к проекту «${state.projectName}»`);
    } catch (error) {
      console.error(error);
      state.dataset.trainingStatus = "Ошибка загрузки датасета";
      renderDatasetView();
      alert("Не удалось загрузить ZIP датасета");
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.datasetDropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.datasetDropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.datasetDropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.datasetDropzone.classList.remove("dragover");
    });
  });

  els.datasetDropzone?.addEventListener("drop", async (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    try {
      state.dataset.attachedZipName = file.name;
      state.dataset.trainingStatus = "Загрузка датасета...";
      renderDatasetView();

      const data = await uploadProjectDatasetZip(file);

      state.dataset.attachedZipName = data.zip_filename || file.name;
      state.dataset.attachedLink = "";
      state.dataset.datasetItemsCount = Number(data.items_count || 0);
      state.dataset.sourceType = data.source_type || "zip";
      state.dataset.trainingStatus = "Датасет загружен";
      persistCurrentDatasetSettings();

      await refreshProjectDatasetAndTrainStatus();
      renderDatasetView();
      alert(`ZIP датасет подключён к проекту «${state.projectName}»`);
    } catch (error) {
      console.error(error);
      state.dataset.trainingStatus = "Ошибка загрузки датасета";
      renderDatasetView();
      alert("Не удалось загрузить ZIP датасета");
    }
  });
}

function attachKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isTyping = tag === "input" || tag === "textarea" || tag === "select";
    if (isTyping) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekBy(event.shiftKey ? -5 : -0.5);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekBy(event.shiftKey ? 5 : 0.5);
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
    }
  });
}

function attachMaskCanvasEvents() {
  if (!els.maskCanvas || !maskCtx) return;

  els.maskCanvas.addEventListener("mousedown", (event) => {
    if (state.formMode !== "mask" || !state.maskDrawing.enabled || state.activeHistoryReviewId) return;
    state.maskDrawing.drawing = true;
    drawMaskPoint(event.clientX, event.clientY);
  });

  window.addEventListener("mouseup", () => {
    state.maskDrawing.drawing = false;
  });

  els.maskCanvas.addEventListener("mousemove", (event) => {
    if (state.formMode !== "mask" || !state.maskDrawing.enabled || !state.maskDrawing.drawing || state.activeHistoryReviewId) return;
    drawMaskPoint(event.clientX, event.clientY);
  });

  els.maskCanvas.addEventListener("mouseleave", () => {
    state.maskDrawing.drawing = false;
  });
}

function attachVideoEvents() {
  els.videoWrapper?.addEventListener("click", handleVideoWrapperClick);
  els.videoWrapper?.addEventListener("dblclick", handleVideoWrapperDoubleClick);

  els.videoPlayer?.addEventListener("loadedmetadata", () => {
    resizeMaskCanvas();
    syncControls();
    renderMarkers();
  });

  els.videoPlayer?.addEventListener("timeupdate", syncControls);
  els.videoPlayer?.addEventListener("play", syncControls);
  els.videoPlayer?.addEventListener("pause", syncControls);
  els.videoPlayer?.addEventListener("seeking", syncControls);
  els.videoPlayer?.addEventListener("seeked", syncControls);

  window.addEventListener("resize", () => {
    resizeMaskCanvas();
    renderMarkers();
    if (state.pendingPoint) showPendingPoint(state.pendingPoint.x, state.pendingPoint.y);
  });

  document.addEventListener("fullscreenchange", () => {
    setTimeout(() => {
      resizeMaskCanvas();
      renderMarkers();
      syncControls();
    }, 60);
  });
}

function attachUIEvents() {
  els.footerAnalyzeBtn?.addEventListener("click", async () => {
    try {
      if (!state.analysisDone) {
        await runAnalysis();
      } else {
        if (els.footerAnalyzeBtn) els.footerAnalyzeBtn.disabled = true;
        await submitReview("submit");
        updateActionButtons();
        await showHistory();
      }
    } catch (error) {
      console.error(error);
      if (els.footerAnalyzeBtn) els.footerAnalyzeBtn.disabled = false;
      alert(!state.analysisDone ? "Ошибка анализа" : "Не удалось сохранить проверку");
    }
  });

  els.modeAiBtn?.addEventListener("click", () => setFormMode("ai"));
  els.modeManualBtn?.addEventListener("click", () => setFormMode("manual"));
  els.modeMaskBtn?.addEventListener("click", () => setFormMode("mask"));

  els.aiDefectSelect?.addEventListener("change", () => {
    state.selectedDefectId = els.aiDefectSelect.value || null;
    updateFormPanel();
    renderMarkers();
    renderDefects();
  });

  els.aiRejectBtn?.addEventListener("click", async () => {
    if (state.activeHistoryReviewId) return;
    const defectId = els.aiDefectSelect?.value;
    if (!defectId) return;
    const comment = (els.aiDefectCommentField?.value || "").trim() || "Дефект не подтверждён";

    try {
      await updateDefectDecision(defectId, "rejected", comment);
    } catch (error) {
      console.error(error);
      alert("Не удалось отклонить дефект");
    }
  });

  els.aiAcceptBtn?.addEventListener("click", async () => {
    if (state.activeHistoryReviewId) return;
    const defectId = els.aiDefectSelect?.value;
    if (!defectId) return;
    const comment = (els.aiDefectCommentField?.value || "").trim();

    try {
      await updateDefectDecision(defectId, "accepted", comment);
    } catch (error) {
      console.error(error);
      alert("Не удалось принять дефект");
    }
  });

  els.saveManualDefectBtn?.addEventListener("click", async () => {
    if (state.activeHistoryReviewId) return alert("В режиме истории редактирование отключено");
    try {
      await addManualDefect();
    } catch (error) {
      console.error(error);
      alert("Не удалось добавить ручной дефект");
    }
  });

  els.enableMaskDrawBtn?.addEventListener("click", () => {
    if (state.activeHistoryReviewId) return;
    setMaskDrawingEnabled(!state.maskDrawing.enabled, false);
  });

  els.clearMaskBtn?.addEventListener("click", () => {
    if (state.activeHistoryReviewId) return;
    clearMaskCanvas();
  });

  els.maskBrushSizeInput?.addEventListener("input", () => {
    state.maskDrawing.brushSize = Number(els.maskBrushSizeInput.value || 14);
  });

  els.saveTrainingMaskBtn?.addEventListener("click", async () => {
    try {
      await saveTrainingMask();
    } catch (error) {
      console.error(error);
      alert("Не удалось сохранить пример в датасет");
    }
  });

  els.saveManualDatasetBtn?.addEventListener("click", async () => {
    try {
      await saveManualDatasetExample();
    } catch (error) {
      console.error(error);
      alert("Не удалось добавить пример в датасет");
    }
  });

  els.projectNameField?.addEventListener("input", (e) => {
    setProjectName(e.target.value);
  });

  els.videoTitleField?.addEventListener("input", (e) => {
    setVideoTitle(e.target.value);
  });

  els.executorSelect?.addEventListener("change", (e) => {
    setExecutorName(e.target.value);
  });

  els.tabWorkspace?.addEventListener("click", showWorkspace);
  els.tabHistory?.addEventListener("click", () => showHistory().catch(console.error));
  els.tabDataset?.addEventListener("click", () => showDataset().catch(console.error));

  els.sortButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      if (!key) return;
      if (state.historySort.key === key) {
        state.historySort.direction = state.historySort.direction === "asc" ? "desc" : "asc";
      } else {
        state.historySort.key = key;
        state.historySort.direction = "asc";
      }
      renderHistoryTable();
    });
  });

  els.attachDatasetBtn?.addEventListener("click", async () => {
    const linkValue = (els.datasetLinkInput?.value || "").trim();
    if (!linkValue) {
      alert("Добавь ссылку на ZIP архив датасета");
      return;
    }

    try {
      state.dataset.trainingStatus = "Подключение ссылки...";
      renderDatasetView();

      const data = await saveProjectDatasetLink(linkValue);

      state.dataset.attachedLink = data.source_url || linkValue;
      state.dataset.attachedZipName = "";
      state.dataset.datasetItemsCount = Number(data.items_count || 0);
      state.dataset.sourceType = data.source_type || "link";
      state.dataset.trainingStatus = "Датасет подключён";
      persistCurrentDatasetSettings();

      await refreshProjectDatasetAndTrainStatus();
      renderDatasetView();
      alert(`Ссылка на датасет привязана к проекту «${state.projectName}»`);
    } catch (error) {
      console.error(error);
      state.dataset.trainingStatus = "Ошибка подключения датасета";
      renderDatasetView();
      alert("Не удалось привязать ссылку на датасет");
    }
  });

  els.exportDatasetBtn?.addEventListener("click", exportProjectDataset);

  els.trainModelBtn?.addEventListener("click", async () => {
    try {
      state.dataset.trainingStatus = "Запуск обучения...";
      renderDatasetView();

      await startProjectTraining();
      state.dataset.trainingStatus = "Обучение...";
      persistCurrentDatasetSettings();
      renderDatasetView();
      startTrainingPoll();
      alert(`Обучение модели проекта «${state.projectName}» запущено`);
    } catch (error) {
      console.error(error);
      state.dataset.trainingStatus = "Ошибка обучения";
      renderDatasetView();
      alert("Не удалось запустить обучение проекта");
    }
  });

  els.sidebarToggleBtn?.addEventListener("click", toggleSidebar);
  els.addProjectBtn?.addEventListener("click", openProjectCreateRow);
  els.cancelProjectBtn?.addEventListener("click", closeProjectCreateRow);

  els.saveProjectBtn?.addEventListener("click", async () => {
    await addProject(els.newProjectInput?.value || "");
  });

  els.newProjectInput?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await addProject(els.newProjectInput?.value || "");
    }
    if (event.key === "Escape") {
      closeProjectCreateRow();
    }
  });
}

function initProjectsState() {
  state.projects = loadProjects();
  state.projectDrafts = loadProjectDrafts();
  state.dataset.settingsByProject = loadDatasetSettings();

  const active = loadActiveProject();
  state.projectName = state.projects.includes(active) ? active : state.projects[0];

  state.projects.forEach((projectName) => {
    if (!state.projectDrafts[projectName]) {
      state.projectDrafts[projectName] = {
        videoId: null,
        fileUrl: "",
        videoTitle: "...",
        executorName: "",
        defects: [],
        analysisDone: false,
        reviewSubmitted: false,
        status: "Ожидание",
        uploadMeta: { fileName: "", videoId: "" },
      };
    }
  });

  saveProjectDrafts();
  applyDatasetSettingsForProject(state.projectName);
  applyDraft(state.projectName);
  renderProjectsList();
}

function init() {
  buildCustomControls();
  bindUploadEvents();
  bindManualDatasetDropzones();
  bindDatasetDropzone();
  attachUIEvents();
  attachVideoEvents();
  attachMaskCanvasEvents();
  attachKeyboardShortcuts();
  initProjectsState();

  if (els.catalogTitle) {
    els.catalogTitle.textContent = "Animation QC AI";
  }

  setStatus("Ожидание");
  updateCounters();
  updateAiSelect();
  renderMarkers();
  renderDefects();
  renderDatasetView();
  resizeMaskCanvas();
  syncControls();
  setFormMode("ai");
  syncFooterActionLabel();
  updateActionButtons();

  if (els.sidebarToggleBtn) {
    els.sidebarToggleBtn.textContent = "‹";
  }

  refreshProjectDatasetAndTrainStatus().catch(console.error);
}

init();
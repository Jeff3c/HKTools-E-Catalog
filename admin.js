(function () {
  "use strict";

  const STORAGE_KEYS = {
    productsOverride: "catalogProductsOverrideV1",
    adminUpdatedAt: "catalogAdminUpdatedAtV1",
    adminPassword: "catalogAdminPasswordV1",
    adminSession: "catalogAdminSessionV1"
  };

  const DEFAULT_PASSWORD = "hktools-admin";

  const baseProducts = Array.isArray(window.CATALOG_PRODUCTS) ? window.CATALOG_PRODUCTS : [];

  const state = {
    products: [],
    filteredIndexes: [],
    selectedIndex: -1,
    query: "",
    dirty: false
  };

  const elements = {
    loginPanel: document.getElementById("loginPanel"),
    adminApp: document.getElementById("adminApp"),
    passwordInput: document.getElementById("passwordInput"),
    loginBtn: document.getElementById("loginBtn"),
    loginError: document.getElementById("loginError"),

    adminSearchInput: document.getElementById("adminSearchInput"),
    addEntryBtn: document.getElementById("addEntryBtn"),
    duplicateEntryBtn: document.getElementById("duplicateEntryBtn"),
    saveEntryBtn: document.getElementById("saveEntryBtn"),
    saveAllBtn: document.getElementById("saveAllBtn"),
    resetBaseBtn: document.getElementById("resetBaseBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importInput: document.getElementById("importInput"),
    logoutBtn: document.getElementById("logoutBtn"),
    statusText: document.getElementById("statusText"),
    resultSummary: document.getElementById("resultSummary"),
    unsavedNotice: document.getElementById("unsavedNotice"),
    entryList: document.getElementById("entryList"),
    editorForm: document.getElementById("editorForm"),

    fieldId: document.getElementById("fieldId"),
    fieldCategory: document.getElementById("fieldCategory"),
    fieldSection: document.getElementById("fieldSection"),
    fieldSubSection: document.getElementById("fieldSubSection"),
    fieldName: document.getElementById("fieldName"),
    fieldCode: document.getElementById("fieldCode"),
    fieldSpecs: document.getElementById("fieldSpecs"),
    fieldImage: document.getElementById("fieldImage"),
    fieldPdfPage: document.getElementById("fieldPdfPage"),
    fieldPdfPageLocal: document.getElementById("fieldPdfPageLocal"),
    fieldPdfFile: document.getElementById("fieldPdfFile"),
    fieldPdfLink: document.getElementById("fieldPdfLink"),
    fieldSource: document.getElementById("fieldSource"),
    fieldMaterials: document.getElementById("fieldMaterials"),
    fieldPurposes: document.getElementById("fieldPurposes"),
    fieldTagBrand: document.getElementById("fieldTagBrand"),
    fieldTagType: document.getElementById("fieldTagType"),
    fieldMaterialText: document.getElementById("fieldMaterialText"),
    fieldPurposeText: document.getElementById("fieldPurposeText"),
    fieldPackaging: document.getElementById("fieldPackaging"),
    fieldAccessories: document.getElementById("fieldAccessories"),
    fieldNotes: document.getElementById("fieldNotes"),

    previewImage: document.getElementById("previewImage"),
    previewPath: document.getElementById("previewPath"),
    uploadImageInput: document.getElementById("uploadImageInput"),
    clearImageBtn: document.getElementById("clearImageBtn"),
    pasteDropZone: document.getElementById("pasteDropZone"),
    newPasswordInput: document.getElementById("newPasswordInput"),
    changePasswordBtn: document.getElementById("changePasswordBtn")
  };

  const editableFieldIds = [
    "fieldCategory",
    "fieldSection",
    "fieldSubSection",
    "fieldName",
    "fieldCode",
    "fieldSpecs",
    "fieldImage",
    "fieldPdfPage",
    "fieldPdfPageLocal",
    "fieldPdfFile",
    "fieldPdfLink",
    "fieldSource",
    "fieldMaterials",
    "fieldPurposes",
    "fieldTagBrand",
    "fieldTagType",
    "fieldMaterialText",
    "fieldPurposeText",
    "fieldPackaging",
    "fieldAccessories",
    "fieldNotes"
  ];

  function safeParseJson(value) {
    if (!value || typeof value !== "string") {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (_err) {
      return null;
    }
  }

  function asText(value) {
    return String(value || "").trim();
  }

  function normalizeTagList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => asText(item)).filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(/[|,]/)
        .map((item) => asText(item))
        .filter(Boolean);
    }

    return [];
  }

  function numberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function isDataImageUrl(path) {
    return /^data:image\//i.test(String(path || ""));
  }

  function imagePathSummary(path) {
    const cleanPath = asText(path);
    if (!cleanPath) {
      return "圖片未設定";
    }
    if (isDataImageUrl(cleanPath)) {
      const sizeKb = Math.round((cleanPath.length * 3 / 4) / 1024);
      return `內嵌圖片 (約 ${sizeKb} KB)`;
    }
    return cleanPath;
  }

  function buildSearchText(product) {
    return [
      product.id,
      product.category,
      product.section,
      product.subSection,
      product.name,
      product.code,
      product.specs,
      product.materialText,
      product.purposeText,
      product.packaging,
      product.accessories,
      product.notes,
      ...(product.materials || []),
      ...(product.purposes || []),
      ...((product.tags && product.tags.brand) || []),
      ...((product.tags && product.tags.type) || [])
    ]
      .filter(Boolean)
      .join(" ");
  }

  function normalizeProduct(raw, index) {
    const product = {
      ...raw,
      id: asText(raw.id) || `P${String(index + 1).padStart(4, "0")}`,
      category: asText(raw.category),
      section: asText(raw.section),
      subSection: asText(raw.subSection),
      name: asText(raw.name),
      code: asText(raw.code),
      specs: asText(raw.specs),
      materialText: asText(raw.materialText),
      purposeText: asText(raw.purposeText),
      packaging: asText(raw.packaging),
      accessories: asText(raw.accessories),
      notes: asText(raw.notes),
      image: asText(raw.image),
      source: asText(raw.source),
      pdfFile: asText(raw.pdfFile),
      pdfLink: asText(raw.pdfLink),
      pdfPage: numberOrZero(raw.pdfPage || raw.page),
      pdfPageLocal: numberOrZero(raw.pdfPageLocal),
      materials: normalizeTagList(raw.materials),
      purposes: normalizeTagList(raw.purposes)
    };

    const tags = raw && typeof raw.tags === "object" ? raw.tags : {};
    product.tags = {
      brand: normalizeTagList(tags.brand),
      material: normalizeTagList(tags.material || product.materials),
      type: normalizeTagList(tags.type)
    };

    product.page = product.pdfPage;
    if (!product.pdfLink && product.pdfFile && product.pdfPageLocal > 0) {
      product.pdfLink = `${product.pdfFile}#page=${product.pdfPageLocal}`;
    }

    product.searchText = asText(raw.searchText) || buildSearchText(product);
    return product;
  }

  function buildNewProduct() {
    return normalizeProduct(
      {
        id: nextProductId(),
        category: "五金工具系列",
        section: "",
        subSection: "",
        name: "",
        code: "",
        specs: "",
        materialText: "",
        purposeText: "",
        packaging: "",
        accessories: "",
        notes: "",
        image: "",
        source: "manual-admin",
        page: 0,
        pdfPage: 0,
        pdfPageLocal: 0,
        pdfFile: "",
        pdfLink: "",
        tags: {
          brand: [],
          material: [],
          type: []
        },
        materials: [],
        purposes: [],
        searchText: ""
      },
      state.products.length
    );
  }

  function cloneProduct(product) {
    const cloned = normalizeProduct({ ...product }, state.products.length);
    cloned.id = nextProductId();
    cloned.code = "";
    cloned.name = `${cloned.name || "新項目"} (複本)`;
    cloned.searchText = buildSearchText(cloned);
    return cloned;
  }

  function loadWorkingProducts() {
    let source = baseProducts;
    try {
      const parsed = safeParseJson(localStorage.getItem(STORAGE_KEYS.productsOverride));
      if (Array.isArray(parsed)) {
        source = parsed;
      }
    } catch (_err) {
      source = baseProducts;
    }

    return source.map((item, index) => normalizeProduct(item, index));
  }

  function getStoredPassword() {
    try {
      return localStorage.getItem(STORAGE_KEYS.adminPassword) || DEFAULT_PASSWORD;
    } catch (_err) {
      return DEFAULT_PASSWORD;
    }
  }

  function setStoredPassword(newPassword) {
    try {
      localStorage.setItem(STORAGE_KEYS.adminPassword, newPassword);
      return true;
    } catch (_err) {
      return false;
    }
  }

  function isAuthenticated() {
    try {
      return sessionStorage.getItem(STORAGE_KEYS.adminSession) === "1";
    } catch (_err) {
      return false;
    }
  }

  function setAuthenticated(isAuthed) {
    try {
      if (isAuthed) {
        sessionStorage.setItem(STORAGE_KEYS.adminSession, "1");
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.adminSession);
      }
    } catch (_err) {
      // ignore
    }
  }

  function setStatus(message, tone) {
    elements.statusText.textContent = message;
    elements.statusText.style.color = tone === "error" ? "#9e2a2a" : tone === "warn" ? "#9f530d" : "#3f5d58";
  }

  function markDirty(isDirty) {
    state.dirty = Boolean(isDirty);
    elements.unsavedNotice.hidden = !state.dirty;
  }

  function toggleAuthUI() {
    const authed = isAuthenticated();
    elements.loginPanel.hidden = authed;
    elements.adminApp.hidden = !authed;
    if (authed) {
      elements.passwordInput.value = "";
      elements.loginError.hidden = true;
    }
  }

  function nextProductId() {
    let max = 0;
    state.products.forEach((p) => {
      const match = String(p.id || "").match(/^P(\d+)$/i);
      if (!match) {
        return;
      }
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > max) {
        max = value;
      }
    });
    return `P${String(max + 1).padStart(4, "0")}`;
  }

  function setEditorDisabled(disabled) {
    editableFieldIds.forEach((fieldId) => {
      if (elements[fieldId]) {
        elements[fieldId].disabled = disabled;
      }
    });
    elements.saveEntryBtn.disabled = disabled;
    elements.duplicateEntryBtn.disabled = disabled;
  }

  function applyFilter() {
    const query = state.query.toLowerCase().trim();
    state.filteredIndexes = [];

    state.products.forEach((product, index) => {
      const haystack = [
        product.id,
        product.code,
        product.name,
        product.specs,
        product.category,
        product.section,
        product.subSection,
        product.image
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!query || haystack.includes(query)) {
        state.filteredIndexes.push(index);
      }
    });

    if (!state.filteredIndexes.includes(state.selectedIndex)) {
      state.selectedIndex = state.filteredIndexes.length ? state.filteredIndexes[0] : -1;
    }
  }

  function renderList() {
    const fragment = document.createDocumentFragment();

    state.filteredIndexes.forEach((index) => {
      const product = state.products[index];
      const li = document.createElement("li");
      li.className = "entry-item";

      const imagePath = asText(product.image);
      const imageLooksMissing = !imagePath;
      if (imageLooksMissing) {
        li.classList.add("warn");
      }
      if (index === state.selectedIndex) {
        li.classList.add("selected");
      }

      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", () => {
        state.selectedIndex = index;
        renderList();
        renderEditor();
      });

      const title = document.createElement("span");
      title.className = "title";
      title.textContent = `${product.id} | ${product.code || "(無編號)"} | ${product.name || "(無名稱)"}`;

      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${product.category || "未分類"} | p.${product.pdfPage || 0} | ${imagePathSummary(product.image)}`;

      button.append(title, meta);
      li.append(button);
      fragment.append(li);
    });

    elements.entryList.replaceChildren(fragment);
    elements.resultSummary.textContent = `顯示 ${state.filteredIndexes.length} / ${state.products.length} 項`;
  }

  function updatePreview(imagePath) {
    const cleanPath = asText(imagePath);
    elements.previewPath.textContent = imagePathSummary(cleanPath);
    elements.previewPath.title = cleanPath;

    if (!cleanPath) {
      elements.previewImage.removeAttribute("src");
      elements.previewImage.alt = "無圖片";
      return;
    }

    elements.previewImage.src = cleanPath;
    elements.previewImage.alt = cleanPath;
    elements.previewImage.onerror = () => {
      elements.previewPath.textContent = `${cleanPath} (無法載入，請檢查路徑)`;
    };
  }

  function fillField(element, value) {
    if (!element) return;
    element.value = value == null ? "" : String(value);
  }

  function renderEditor() {
    if (state.selectedIndex < 0 || !state.products[state.selectedIndex]) {
      setEditorDisabled(true);
      elements.editorForm.reset();
      updatePreview("");
      return;
    }

    setEditorDisabled(false);
    const product = state.products[state.selectedIndex];

    fillField(elements.fieldId, product.id);
    fillField(elements.fieldCategory, product.category);
    fillField(elements.fieldSection, product.section);
    fillField(elements.fieldSubSection, product.subSection);
    fillField(elements.fieldName, product.name);
    fillField(elements.fieldCode, product.code);
    fillField(elements.fieldSpecs, product.specs);
    fillField(elements.fieldImage, product.image);
    fillField(elements.fieldPdfPage, product.pdfPage || "");
    fillField(elements.fieldPdfPageLocal, product.pdfPageLocal || "");
    fillField(elements.fieldPdfFile, product.pdfFile);
    fillField(elements.fieldPdfLink, product.pdfLink);
    fillField(elements.fieldSource, product.source);
    fillField(elements.fieldMaterials, (product.materials || []).join(" | "));
    fillField(elements.fieldPurposes, (product.purposes || []).join(" | "));
    fillField(elements.fieldTagBrand, ((product.tags && product.tags.brand) || []).join(" | "));
    fillField(elements.fieldTagType, ((product.tags && product.tags.type) || []).join(" | "));
    fillField(elements.fieldMaterialText, product.materialText);
    fillField(elements.fieldPurposeText, product.purposeText);
    fillField(elements.fieldPackaging, product.packaging);
    fillField(elements.fieldAccessories, product.accessories);
    fillField(elements.fieldNotes, product.notes);

    updatePreview(product.image);
  }

  function collectEditedProduct() {
    const existing = state.products[state.selectedIndex];

    const edited = normalizeProduct(
      {
        ...existing,
        id: asText(elements.fieldId.value) || nextProductId(),
        category: asText(elements.fieldCategory.value),
        section: asText(elements.fieldSection.value),
        subSection: asText(elements.fieldSubSection.value),
        name: asText(elements.fieldName.value),
        code: asText(elements.fieldCode.value),
        specs: asText(elements.fieldSpecs.value),
        image: asText(elements.fieldImage.value),
        pdfPage: numberOrZero(elements.fieldPdfPage.value),
        page: numberOrZero(elements.fieldPdfPage.value),
        pdfPageLocal: numberOrZero(elements.fieldPdfPageLocal.value),
        pdfFile: asText(elements.fieldPdfFile.value),
        pdfLink: asText(elements.fieldPdfLink.value),
        source: asText(elements.fieldSource.value),
        materials: normalizeTagList(elements.fieldMaterials.value),
        purposes: normalizeTagList(elements.fieldPurposes.value),
        tags: {
          ...(existing.tags || {}),
          brand: normalizeTagList(elements.fieldTagBrand.value),
          material: normalizeTagList(elements.fieldMaterials.value),
          type: normalizeTagList(elements.fieldTagType.value)
        },
        materialText: asText(elements.fieldMaterialText.value),
        purposeText: asText(elements.fieldPurposeText.value),
        packaging: asText(elements.fieldPackaging.value),
        accessories: asText(elements.fieldAccessories.value),
        notes: asText(elements.fieldNotes.value)
      },
      state.selectedIndex
    );

    edited.searchText = buildSearchText(edited);
    return edited;
  }

  function setSelectedImage(imageValue, sourceLabel) {
    if (state.selectedIndex < 0 || !state.products[state.selectedIndex]) {
      setStatus("尚未選擇任何項目。", "warn");
      return;
    }

    state.products[state.selectedIndex].image = asText(imageValue);
    state.products[state.selectedIndex].searchText = buildSearchText(state.products[state.selectedIndex]);

    fillField(elements.fieldImage, state.products[state.selectedIndex].image);
    updatePreview(state.products[state.selectedIndex].image);
    renderList();
    markDirty(true);
    setStatus(`已${sourceLabel}替換圖片，請按「儲存到本機」完成保存。`, "warn");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read-failed"));
      reader.readAsDataURL(file);
    });
  }

  async function setSelectedImageFromFile(file, sourceLabel) {
    if (!file) {
      return;
    }
    if (!String(file.type || "").startsWith("image/")) {
      setStatus("檔案不是圖片格式，請重新選擇。", "warn");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSelectedImage(dataUrl, sourceLabel);
    } catch (_err) {
      setStatus("圖片讀取失敗，請重試。", "error");
    }
  }

  function getClipboardImageFile(event) {
    const items = event && event.clipboardData ? event.clipboardData.items : null;
    if (!items || !items.length) {
      return null;
    }

    for (const item of items) {
      if (item && String(item.type || "").startsWith("image/")) {
        return item.getAsFile();
      }
    }
    return null;
  }

  function saveSelectedEntry() {
    if (state.selectedIndex < 0 || !state.products[state.selectedIndex]) {
      setStatus("尚未選擇任何項目。", "warn");
      return;
    }

    state.products[state.selectedIndex] = collectEditedProduct();
    applyFilter();
    renderList();
    renderEditor();
    markDirty(true);
    setStatus("已套用該項修改，記得按「儲存到本機」。", "warn");
  }

  function addEntry() {
    const created = buildNewProduct();
    state.products.push(created);
    state.selectedIndex = state.products.length - 1;
    applyFilter();
    renderList();
    renderEditor();
    markDirty(true);
    setStatus(`已新增項目 ${created.id}。`, "warn");
  }

  function duplicateEntry() {
    if (state.selectedIndex < 0 || !state.products[state.selectedIndex]) {
      setStatus("尚未選擇可複製的項目。", "warn");
      return;
    }

    const duplicated = cloneProduct(state.products[state.selectedIndex]);
    state.products.push(duplicated);
    state.selectedIndex = state.products.length - 1;
    applyFilter();
    renderList();
    renderEditor();
    markDirty(true);
    setStatus(`已複製為新項目 ${duplicated.id}。`, "warn");
  }

  function saveAll() {
    try {
      localStorage.setItem(STORAGE_KEYS.productsOverride, JSON.stringify(state.products));
      localStorage.setItem(STORAGE_KEYS.adminUpdatedAt, new Date().toISOString());
      markDirty(false);
      setStatus("已儲存到本機。返回目錄頁即可看到更新結果。", "info");
    } catch (_err) {
      setStatus("儲存失敗，可能是本機儲存空間不足（圖片過大），請嘗試減少內嵌圖片數量或改用較小圖片。", "error");
    }
  }

  function resetToBase() {
    const confirmed = window.confirm("確定要還原為原始 catalog-data.js 資料？目前未儲存內容會遺失。");
    if (!confirmed) {
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEYS.productsOverride);
      localStorage.removeItem(STORAGE_KEYS.adminUpdatedAt);
    } catch (_err) {
      // ignore
    }

    state.products = baseProducts.map((item, index) => normalizeProduct(item, index));
    state.selectedIndex = state.products.length ? 0 : -1;
    applyFilter();
    renderList();
    renderEditor();
    markDirty(false);
    setStatus("已還原為原始資料。", "info");
  }

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      totalProducts: state.products.length,
      products: state.products
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalog-products-override-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("已匯出 JSON。", "info");
  }

  function importJsonFile(file) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const parsed = safeParseJson(String(reader.result || ""));
      const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.products) ? parsed.products : null;

      if (!Array.isArray(list)) {
        setStatus("匯入失敗：JSON 格式不正確。", "error");
        return;
      }

      const confirmed = window.confirm(`即將匯入 ${list.length} 項資料並覆蓋目前編輯內容，是否繼續？`);
      if (!confirmed) {
        return;
      }

      state.products = list.map((item, index) => normalizeProduct(item, index));
      state.selectedIndex = state.products.length ? 0 : -1;
      applyFilter();
      renderList();
      renderEditor();
      markDirty(true);
      setStatus(`已匯入 ${state.products.length} 項，請按「儲存到本機」完成套用。`, "warn");
    };

    reader.onerror = () => {
      setStatus("讀取檔案失敗。", "error");
    };

    reader.readAsText(file, "utf-8");
  }

  function attemptLogin() {
    const inputPassword = asText(elements.passwordInput.value);
    const expectedPassword = getStoredPassword();

    if (!inputPassword || inputPassword !== expectedPassword) {
      elements.loginError.hidden = false;
      return;
    }

    setAuthenticated(true);
    elements.loginError.hidden = true;
    toggleAuthUI();
    renderAll();
    setStatus("登入成功。", "info");
  }

  function logout() {
    setAuthenticated(false);
    toggleAuthUI();
    setStatus("已登出。", "info");
  }

  function changePassword() {
    const nextPassword = asText(elements.newPasswordInput.value);
    if (nextPassword.length < 4) {
      setStatus("新密碼至少需要 4 個字元。", "warn");
      return;
    }

    if (!setStoredPassword(nextPassword)) {
      setStatus("密碼更新失敗，請確認瀏覽器允許本機儲存。", "error");
      return;
    }

    elements.newPasswordInput.value = "";
    setStatus("密碼已更新（僅此瀏覽器有效）。", "info");
  }

  function bindEvents() {
    elements.loginBtn.addEventListener("click", attemptLogin);
    elements.passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        attemptLogin();
      }
    });

    elements.logoutBtn.addEventListener("click", logout);
    elements.addEntryBtn.addEventListener("click", addEntry);
    elements.duplicateEntryBtn.addEventListener("click", duplicateEntry);
    elements.saveEntryBtn.addEventListener("click", saveSelectedEntry);
    elements.saveAllBtn.addEventListener("click", saveAll);
    elements.resetBaseBtn.addEventListener("click", resetToBase);
    elements.exportBtn.addEventListener("click", exportJson);

    elements.importInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
      importJsonFile(file);
      elements.importInput.value = "";
    });

    elements.uploadImageInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
      await setSelectedImageFromFile(file, "上傳");
      elements.uploadImageInput.value = "";
    });

    elements.clearImageBtn.addEventListener("click", () => {
      setSelectedImage("", "清除");
    });

    elements.pasteDropZone.addEventListener("click", () => {
      elements.pasteDropZone.focus();
    });

    elements.pasteDropZone.addEventListener("paste", async (event) => {
      const file = getClipboardImageFile(event);
      if (!file) {
        setStatus("剪貼簿中沒有圖片。", "warn");
        return;
      }
      event.preventDefault();
      await setSelectedImageFromFile(file, "貼上");
    });

    elements.pasteDropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      elements.pasteDropZone.classList.add("dragover");
    });

    elements.pasteDropZone.addEventListener("dragleave", () => {
      elements.pasteDropZone.classList.remove("dragover");
    });

    elements.pasteDropZone.addEventListener("drop", async (event) => {
      event.preventDefault();
      elements.pasteDropZone.classList.remove("dragover");

      const files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : null;
      const file = files && files.length ? files[0] : null;
      await setSelectedImageFromFile(file, "拖放");
    });

    elements.adminSearchInput.addEventListener("input", (event) => {
      state.query = String(event.target.value || "");
      applyFilter();
      renderList();
      renderEditor();
    });

    elements.fieldImage.addEventListener("input", () => {
      updatePreview(elements.fieldImage.value);
    });

    elements.changePasswordBtn.addEventListener("click", changePassword);

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function renderAll() {
    applyFilter();
    renderList();
    renderEditor();
  }

  function init() {
    state.products = loadWorkingProducts();
    state.selectedIndex = state.products.length ? 0 : -1;
    markDirty(false);

    bindEvents();
    toggleAuthUI();

    if (isAuthenticated()) {
      renderAll();
      setStatus(`已載入 ${state.products.length} 項資料。`, "info");
    } else {
      setStatus("請先登入以編輯資料。", "info");
    }
  }

  init();
})();

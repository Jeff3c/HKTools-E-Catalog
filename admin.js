/* admin.js
   Minimal admin helpers: image upload/paste preview and GitHub commit (PUT /repos/:owner/:repo/contents/:path).
   Usage:
   - Enter a Personal Access Token with `repo` permissions (works for public/private repos where token has access).
   - Fill Owner, Repo, Branch and Remote path (e.g., catalog-data.js).
   - Optionally upload or paste an image in the preview area; the image will be uploaded to `images/<generated-filename>`.
   - Press "推送到 GitHub" to upload images (if any) and update `catalog-data.js`.
*/
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function showStatus(msg, isError) {
    const el = $('statusText');
    if (el) {
      el.textContent = msg;
      el.style.color = isError ? 'crimson' : '';
    } else {
      console.log(msg);
    }
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function () {
        const base64 = arrayBufferToBase64(reader.result);
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function dataUrlToFile(dataUrl, filenameBase) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''));
    if (!match) return null;

    const mime = match[1] || 'image/png';
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const ext = ((mime.split('/')[1] || 'png').split('+')[0] || 'png').replace(/[^a-z0-9]/gi, '');
    const filename = sanitizeFilename(`${filenameBase}.${ext || 'png'}`);
    return new File([bytes], filename, { type: mime });
  }

  async function getFileSha(owner, repo, path, branch, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = 'token ' + token;
    const res = await fetch(url, { headers });
    if (res.status === 200) {
      const j = await res.json();
      return j.sha;
    } else if (res.status === 404) {
      return null;
    } else {
      const text = await res.text();
      throw new Error(`Failed to get file sha: ${res.status} ${text}`);
    }
  }

  async function putFile(owner, repo, path, branch, token, contentBase64, message, sha) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const body = { message: message || 'Update via admin', content: contentBase64, branch: branch || 'main' };
    if (sha) body.sha = sha;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = 'token ' + token;
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to put file ${path}: ${res.status} ${text}`);
    }
    return await res.json();
  }

  function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_.-]/gi, '_');
  }

  function buildProductsFromForm() {
    const products = Array.isArray(window.CATALOG_PRODUCTS) ? JSON.parse(JSON.stringify(window.CATALOG_PRODUCTS)) : [];
    const id = $('fieldId').value.trim();
    const edited = {
      id: id || null,
      category: $('fieldCategory').value.trim(),
      section: $('fieldSection').value.trim(),
      subSection: $('fieldSubSection').value.trim(),
      name: $('fieldName').value.trim(),
      code: $('fieldCode').value.trim(),
      specs: $('fieldSpecs').value.trim(),
      image: $('fieldImage').value.trim(),
      pdfPage: $('fieldPdfPage').value ? Number($('fieldPdfPage').value) : null,
      pdfPageLocal: $('fieldPdfPageLocal').value ? Number($('fieldPdfPageLocal').value) : null,
      pdfFile: $('fieldPdfFile').value.trim(),
      pdfLink: $('fieldPdfLink').value.trim(),
      source: $('fieldSource').value.trim(),
      materials: $('fieldMaterials').value.trim(),
      purposes: $('fieldPurposes').value.trim(),
      tagBrand: $('fieldTagBrand').value.trim(),
      tagType: $('fieldTagType').value.trim(),
      materialText: $('fieldMaterialText').value.trim(),
      purposeText: $('fieldPurposeText').value.trim(),
      packaging: $('fieldPackaging').value.trim(),
      accessories: $('fieldAccessories').value.trim(),
      notes: $('fieldNotes').value.trim()
    };
    let idx = -1;
    if (edited.id) idx = products.findIndex(p => p.id == edited.id || p.code == edited.code);
    if (idx >= 0) products[idx] = Object.assign({}, products[idx], edited);
    else products.push(edited);
    return products;
  }

  async function commitCatalogAndImages({ owner, repo, branch, path, token, commitMessage, images }) {
    if (!owner || !repo || !path || !token) throw new Error('缺少 GitHub 設定（owner / repo / path / token）。');
    // upload images
    if (images && images.length) {
      for (const img of images) {
        showStatus(`上傳圖片 ${img.targetPath}...`);
        const base64 = await fileToBase64(img.file);
        const sha = await getFileSha(owner, repo, img.targetPath, branch, token);
        await putFile(owner, repo, img.targetPath, branch, token, base64, commitMessage || `Add/Update ${img.targetPath}`, sha);
        showStatus(`已上傳 ${img.targetPath}`);
      }
    }
    // update catalog-data.js
    showStatus('準備 catalog-data.js 內容...');
    const products = buildProductsFromForm();
    const meta = window.CATALOG_META || {};
      const jsContent = 'window.CATALOG_PRODUCTS = ' + JSON.stringify(products, null, 2) + '\nwindow.CATALOG_META = ' + JSON.stringify(meta, null, 2) + ';';
    const encoder = new TextEncoder();
    const array = encoder.encode(jsContent);
    const contentBase64 = arrayBufferToBase64(array.buffer);
    const targetSha = await getFileSha(owner, repo, path, branch, token);
    showStatus('上傳 catalog-data.js ...');
    await putFile(owner, repo, path, branch, token, contentBase64, commitMessage || `Update ${path} via admin`, targetSha);
    showStatus('GitHub 推送完成');
    return true;
  }
    // Fetch the remote catalog-data.js and extract products/meta safely (no eval)
    async function getRemoteCatalog(owner, repo, path, branch, token) {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (token) headers['Authorization'] = 'token ' + token;
      const res = await fetch(url, { headers });
      if (res.status === 404) return { products: null, meta: null, raw: null, sha: null };
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to fetch remote catalog: ${res.status} ${txt}`);
      }
      const j = await res.json();
      const sha = j.sha;
      const raw = typeof j.content === 'string' ? atob(j.content.replace(/\s/g, '')) : '';

      // helper to extract a balanced JSON value that starts at first non-space after '=' for varName
      function extractJsonValue(source, varName) {
        const idx = source.indexOf(varName);
        if (idx === -1) return null;
        const eq = source.indexOf('=', idx);
        if (eq === -1) return null;
        let i = eq + 1;
        // skip whitespace
        while (i < source.length && /[\s;]/.test(source[i])) i++;
        if (i >= source.length) return null;
        const startChar = source[i];
        if (startChar !== '[' && startChar !== '{') return null;
        let depth = 0;
        let inString = null;
        let escaped = false;
        for (let k = i; k < source.length; k++) {
          const ch = source[k];
          if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === inString) { inString = null; }
          } else {
            if (ch === '"' || ch === "'") { inString = ch; }
            else if (ch === startChar) { depth++; }
            else if ((ch === ']' && startChar === '[') || (ch === '}' && startChar === '{')) {
              depth--;
              if (depth === 0) {
                const substr = source.substring(i, k + 1);
                try { return JSON.parse(substr); } catch (_e) { return null; }
              }
            }
          }
        }
        return null;
      }

      const products = extractJsonValue(raw, 'window.CATALOG_PRODUCTS') || null;
      const meta = extractJsonValue(raw, 'window.CATALOG_META') || null;
      return { products, meta, raw, sha };
    }

    async function commitCatalogAndImages({ owner, repo, branch, path, token, commitMessage, images }) {
      if (!owner || !repo || !path || !token) throw new Error('缺少 GitHub 設定（owner / repo / path / token）。');

      // upload images first
      if (images && images.length) {
        for (const img of images) {
          showStatus(`上傳圖片 ${img.targetPath}...`);
          const base64 = await fileToBase64(img.file);
          const sha = await getFileSha(owner, repo, img.targetPath, branch, token);
          await putFile(owner, repo, img.targetPath, branch, token, base64, commitMessage || `Add/Update ${img.targetPath}`, sha);
          showStatus(`已上傳 ${img.targetPath}`);
        }
      }

      // fetch remote catalog-data.js content and parse products/meta
      showStatus('讀取遠端 catalog-data.js 以進行合併...');
      let remote = { products: null, meta: null, raw: null, sha: null };
      try {
        remote = await getRemoteCatalog(owner, repo, path, branch, token);
      } catch (e) {
        // ignore but warn
        console.warn('fetch remote catalog failed', e);
        remote = { products: null, meta: null, raw: null, sha: await getFileSha(owner, repo, path, branch, token) };
      }

      const remoteProducts = Array.isArray(remote.products) ? remote.products : (Array.isArray(window.CATALOG_PRODUCTS) ? window.CATALOG_PRODUCTS : []);
      const meta = remote.meta || window.CATALOG_META || {};

      // build edited product from editor fields (merge into remoteProducts)
      const id = $('fieldId').value.trim();
      const edited = {
        id: id || null,
        category: $('fieldCategory').value.trim(),
        section: $('fieldSection').value.trim(),
        subSection: $('fieldSubSection').value.trim(),
        name: $('fieldName').value.trim(),
        code: $('fieldCode').value.trim(),
        specs: $('fieldSpecs').value.trim(),
        image: $('fieldImage').value.trim(),
        pdfPage: $('fieldPdfPage').value ? Number($('fieldPdfPage').value) : null,
        pdfPageLocal: $('fieldPdfPageLocal').value ? Number($('fieldPdfPageLocal').value) : null,
        pdfFile: $('fieldPdfFile').value.trim(),
        pdfLink: $('fieldPdfLink').value.trim(),
        source: $('fieldSource').value.trim(),
        materials: $('fieldMaterials').value.trim(),
        purposes: $('fieldPurposes').value.trim(),
        tagBrand: $('fieldTagBrand').value.trim(),
        tagType: $('fieldTagType').value.trim(),
        materialText: $('fieldMaterialText').value.trim(),
        purposeText: $('fieldPurposeText').value.trim(),
        packaging: $('fieldPackaging').value.trim(),
        accessories: $('fieldAccessories').value.trim(),
        notes: $('fieldNotes').value.trim()
      };

      // merge
      let idx = -1;
      if (edited.id) idx = remoteProducts.findIndex(p => p.id == edited.id || p.code == edited.code);
      if (idx >= 0) remoteProducts[idx] = Object.assign({}, remoteProducts[idx], edited);
      else remoteProducts.push(edited);

      // prepare JS content without stray characters
      const jsContent = 'window.CATALOG_PRODUCTS = ' + JSON.stringify(remoteProducts, null, 2) + '\nwindow.CATALOG_META = ' + JSON.stringify(meta, null, 2) + ';';
      const encoder = new TextEncoder();
      const array = encoder.encode(jsContent);
      const contentBase64 = arrayBufferToBase64(array.buffer);

      const targetSha = remote.sha || await getFileSha(owner, repo, path, branch, token);
      showStatus('上傳 catalog-data.js ...');
      const resp = await putFile(owner, repo, path, branch, token, contentBase64, commitMessage || `Update ${path} via admin`, targetSha);
      // show commit details if available
      try {
        const commitSha = resp && resp.commit && resp.commit.sha ? resp.commit.sha : null;
        showStatus('GitHub 推送完成 ' + (commitSha ? `（${commitSha.substring(0,7)}）` : ''));
      } catch (_e) {
        showStatus('GitHub 推送完成');
      }

      return true;
    }

  document.addEventListener('DOMContentLoaded', () => {
    const githubTokenInput = $('githubTokenInput');
    const githubOwnerInput = $('githubOwnerInput');
    const githubRepoInput = $('githubRepoInput');
    const githubBranchInput = $('githubBranchInput');
    const githubPathInput = $('githubPathInput');
    const githubCommitMessageInput = $('githubCommitMessageInput');
    const rememberTokenInput = $('rememberToken');
    const githubCommitBtn = $('githubCommitBtn');
    const uploadImageInput = $('uploadImageInput');

    const GITHUB_SETTINGS_KEY = 'hktools_github_settings_v1';
    const GITHUB_TOKEN_KEY = 'hktools_github_token';
    const GITHUB_TOKEN_REMEMBER_KEY = 'hktools_github_token_remember_v1';
    const defaultGithubSettings = {
      owner: 'Jeff3c',
      repo: 'HKTools-E-Catalog',
      branch: 'main',
      path: 'catalog-data.js'
    };

    function restoreGithubSettings() {
      let saved = {};
      try {
        const raw = localStorage.getItem(GITHUB_SETTINGS_KEY);
        saved = raw ? (JSON.parse(raw) || {}) : {};
      } catch (_e) {
        saved = {};
      }

      githubOwnerInput.value = (saved.owner || githubOwnerInput.value || defaultGithubSettings.owner).trim();
      githubRepoInput.value = (saved.repo || githubRepoInput.value || defaultGithubSettings.repo).trim();
      githubBranchInput.value = (saved.branch || githubBranchInput.value || defaultGithubSettings.branch).trim();
      githubPathInput.value = (saved.path || githubPathInput.value || defaultGithubSettings.path).trim();
    }

    function saveGithubSettings() {
      const settings = {
        owner: (githubOwnerInput.value || defaultGithubSettings.owner).trim(),
        repo: (githubRepoInput.value || defaultGithubSettings.repo).trim(),
        branch: (githubBranchInput.value || defaultGithubSettings.branch).trim(),
        path: (githubPathInput.value || defaultGithubSettings.path).trim()
      };
      try {
        localStorage.setItem(GITHUB_SETTINGS_KEY, JSON.stringify(settings));
      } catch (_e) {}
    }

    function restoreGithubToken() {
      try {
        const remember = localStorage.getItem(GITHUB_TOKEN_REMEMBER_KEY);
        if (remember !== null) rememberTokenInput.checked = remember === '1';

        const savedToken = localStorage.getItem(GITHUB_TOKEN_KEY);
        if (savedToken) githubTokenInput.value = savedToken;
      } catch (_e) {}
    }

    restoreGithubSettings();
    restoreGithubToken();
    saveGithubSettings();

    [githubOwnerInput, githubRepoInput, githubBranchInput, githubPathInput].forEach((input) => {
      input.addEventListener('change', saveGithubSettings);
      input.addEventListener('blur', saveGithubSettings);
    });

    rememberTokenInput.addEventListener('change', () => {
      try {
        localStorage.setItem(GITHUB_TOKEN_REMEMBER_KEY, rememberTokenInput.checked ? '1' : '0');
        if (!rememberTokenInput.checked) localStorage.removeItem(GITHUB_TOKEN_KEY);
      } catch (_e) {}
    });

    // commit handler
    let lock = false;
    githubCommitBtn.addEventListener('click', async () => {
      if (lock) return;
      lock = true;
      try {
        const token = githubTokenInput.value.trim();
        if (!token) { showStatus('請輸入 GitHub token', true); lock = false; return; }
        if (rememberTokenInput.checked) {
          localStorage.setItem(GITHUB_TOKEN_KEY, token);
          localStorage.setItem(GITHUB_TOKEN_REMEMBER_KEY, '1');
        } else {
          localStorage.removeItem(GITHUB_TOKEN_KEY);
          localStorage.setItem(GITHUB_TOKEN_REMEMBER_KEY, '0');
        }

        const owner = githubOwnerInput.value.trim() || defaultGithubSettings.owner;
        const repo = githubRepoInput.value.trim() || defaultGithubSettings.repo;
        const branch = githubBranchInput.value.trim() || defaultGithubSettings.branch;
        const path = githubPathInput.value.trim() || defaultGithubSettings.path;
        const commitMessage = githubCommitMessageInput.value.trim() || `Update ${path} via admin UI`;

        saveGithubSettings();

        const images = [];
        const prodId = $('fieldCode').value.trim() || $('fieldId').value.trim() || String(Date.now());

        if (uploadImageInput.files && uploadImageInput.files.length > 0) {
          const file = uploadImageInput.files[0];
          const ext = (file.type && file.type.split('/').pop()) || (file.name.split('.').pop()) || 'jpg';
          const filename = sanitizeFilename(`${prodId}_${Date.now()}.${ext}`);
          const targetPath = `images/${filename}`;
          $('fieldImage').value = targetPath;
          images.push({ file, targetPath });
        } else if (uploadImageInput._pastedFile) {
          const file = uploadImageInput._pastedFile;
          const ext = (file.type && file.type.split('/').pop()) || 'png';
          const filename = sanitizeFilename(`${prodId}_${Date.now()}.${ext}`);
          const targetPath = `images/${filename}`;
          $('fieldImage').value = targetPath;
          images.push({ file, targetPath });
        } else {
          const rawImage = $('fieldImage').value.trim();
          if (/^data:image\//i.test(rawImage)) {
            const file = dataUrlToFile(rawImage, `${prodId}_${Date.now()}`);
            if (file) {
              const targetPath = `images/${sanitizeFilename(file.name)}`;
              $('fieldImage').value = targetPath;
              images.push({ file, targetPath });
            }
          }
        }

        showStatus('開始推送到 GitHub...');
        await commitCatalogAndImages({ owner, repo, branch, path, token, commitMessage, images });
        showStatus('推送完成');
      } catch (err) {
        console.error(err);
        showStatus('錯誤：' + (err.message || err), true);
      } finally {
        lock = false;
      }
    });

  });

})();
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

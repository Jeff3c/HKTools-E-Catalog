(function () {
  "use strict";

  const rawProducts = Array.isArray(window.CATALOG_PRODUCTS) ? window.CATALOG_PRODUCTS : [];
  const meta = window.CATALOG_META || {};

  function normalizeTagList(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  const products = rawProducts.map((product) => ({
    ...product,
    materials: normalizeTagList(product.materials),
    purposes: normalizeTagList(product.purposes),
    searchText: String(product.searchText || "")
  }));

  const elements = {
    searchInput: document.getElementById("searchInput"),
    categoryFilters: document.getElementById("categoryFilters"),
    materialFilters: document.getElementById("materialFilters"),
    purposeFilters: document.getElementById("purposeFilters"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),
    productGrid: document.getElementById("productGrid"),
    productCardTemplate: document.getElementById("productCardTemplate"),
    resultCount: document.getElementById("resultCount"),
    metaInfo: document.getElementById("metaInfo"),
    emptyState: document.getElementById("emptyState"),
    productModal: document.getElementById("productModal"),
    modalCloseBtn: document.querySelector("#productModal .modal-close"),
    modalName: document.querySelector("#productModal .modal-name"),
    modalImage: document.querySelector("#productModal .modal-image img"),
    modalCode: document.querySelector("#productModal .modal-code"),
    modalSpecs: document.querySelector("#productModal .modal-specs"),
    modalMaterials: document.querySelector("#productModal .modal-materials"),
    modalPurposes: document.querySelector("#productModal .modal-purposes"),
    modalMeta: document.querySelector("#productModal .modal-meta")
  };

  const state = {
    query: "",
    categories: new Set(),
    materials: new Set(),
    purposes: new Set()
  };

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }

  function createFilterOption(name, value, groupSet, onChange) {
    const label = document.createElement("label");
    label.className = "filter-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = groupSet.has(value);

    input.addEventListener("change", () => {
      if (input.checked) {
        groupSet.add(value);
      } else {
        groupSet.delete(value);
      }
      onChange();
    });

    const span = document.createElement("span");
    span.textContent = name;

    label.append(input, span);
    return label;
  }

  function renderFilters() {
    const categories = uniqueSorted(products.map((p) => p.category));
    const materials = uniqueSorted(products.flatMap((p) => p.materials || []));
    const purposes = uniqueSorted(products.flatMap((p) => p.purposes || []));

    elements.categoryFilters.replaceChildren(...categories.map((c) => createFilterOption(c, c, state.categories, applyFilters)));
    elements.materialFilters.replaceChildren(...materials.map((m) => createFilterOption(m, m, state.materials, applyFilters)));
    elements.purposeFilters.replaceChildren(...purposes.map((p) => createFilterOption(p, p, state.purposes, applyFilters)));
  }

  function includesAny(targetList, selectedSet) {
    if (!selectedSet.size) {
      return true;
    }

    if (!Array.isArray(targetList) || !targetList.length) {
      return false;
    }

    return targetList.some((v) => selectedSet.has(v));
  }

  function matchesQuery(product, query) {
    if (!query) {
      return true;
    }

    return (product.searchText || "").toLowerCase().includes(query);
  }

  function buildChip(text, kind) {
    const chip = document.createElement("span");
    chip.className = `chip ${kind}`;
    chip.textContent = text;
    return chip;
  }

  function addMetaRow(dl, label, value) {
    if (!value) {
      return;
    }

    const row = document.createElement("div");
    row.className = "meta-row";

    const dt = document.createElement("dt");
    dt.textContent = label;

    const dd = document.createElement("dd");
    dd.textContent = value;

    row.append(dt, dd);
    dl.append(row);
  }

  /* Modal control: open / close and populate */
  function openModal(product) {
    if (!elements.productModal) return;
    if (elements.modalName) elements.modalName.textContent = product.name || "";
    if (elements.modalImage) {
      elements.modalImage.src = product.image || "";
      elements.modalImage.alt = product.name || "產品圖片";
    }
    if (elements.modalCode) elements.modalCode.textContent = product.code ? `編號: ${product.code}` : "";
    if (elements.modalSpecs) elements.modalSpecs.textContent = product.specs ? `規格: ${product.specs}` : "";

    if (elements.modalMaterials) {
      elements.modalMaterials.replaceChildren(...(product.materials || []).map((t) => buildChip(t, "material")));
    }
    if (elements.modalPurposes) {
      elements.modalPurposes.replaceChildren(...(product.purposes || []).map((t) => buildChip(t, "purpose")));
    }

    if (elements.modalMeta) {
      elements.modalMeta.innerHTML = "";
      addMetaRow(elements.modalMeta, "材料", product.materialText);
      addMetaRow(elements.modalMeta, "用途", product.purposeText);
      addMetaRow(elements.modalMeta, "包裝", product.packaging);
      addMetaRow(elements.modalMeta, "配件", product.accessories);
      addMetaRow(elements.modalMeta, "備註", product.notes);
      if (product.source) addMetaRow(elements.modalMeta, "來源", `${product.source} (p.${product.page || 0})`);
    }

    elements.productModal.style.display = "grid";
    elements.productModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (elements.modalCloseBtn) elements.modalCloseBtn.focus();
  }

  function closeModal() {
    if (!elements.productModal) return;
    elements.productModal.style.display = "none";
    elements.productModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function renderProducts(list) {
    const fragment = document.createDocumentFragment();

    list.forEach((product) => {
      const card = elements.productCardTemplate.content.firstElementChild.cloneNode(true);

      const image = card.querySelector(".product-image");
      const category = card.querySelector(".product-category");
      const name = card.querySelector(".product-name");
      const code = card.querySelector(".product-code");
      const specs = card.querySelector(".product-specs");
      const pdfPageLink = card.querySelector(".pdf-page-link");
      const materialRow = card.querySelector(".chip-materials");
      const purposeRow = card.querySelector(".chip-purposes");
      const meta = card.querySelector(".product-meta");

      image.src = product.image || "";
      image.alt = product.name || "產品圖片";
      image.loading = "lazy";
      image.decoding = "async";
      image.onerror = () => {
        image.src = "";
        image.alt = "圖片未提供";
      };

      // open modal when image clicked
      image.style.cursor = 'zoom-in';
      image.addEventListener('click', (evt) => {
        evt.stopPropagation();
        openModal(product);
      });

      category.textContent = `${product.category || "未分類"}${product.section ? ` / ${product.section}` : ""}`;
      name.textContent = product.name || "未命名產品";
      code.textContent = product.code ? `編號: ${product.code}` : "";
      specs.textContent = product.specs ? `規格: ${product.specs}` : "";

      if (pdfPageLink) {
        const pageNo = Number(product.pdfPage || product.page || 0);
        const href = String(product.pdfLink || "").trim();
        if (href && pageNo > 0) {
          pdfPageLink.href = href;
          pdfPageLink.textContent = `PDF Page ${pageNo}`;
          pdfPageLink.hidden = false;
        } else {
          pdfPageLink.removeAttribute("href");
          pdfPageLink.textContent = "";
          pdfPageLink.hidden = true;
        }
      }

      materialRow.replaceChildren(...(product.materials || []).map((tag) => buildChip(tag, "material")));
      purposeRow.replaceChildren(...(product.purposes || []).map((tag) => buildChip(tag, "purpose")));

      addMetaRow(meta, "材料", product.materialText);
      addMetaRow(meta, "用途", product.purposeText);
      addMetaRow(meta, "包裝", product.packaging);
      addMetaRow(meta, "配件", product.accessories);
      addMetaRow(meta, "備註", product.notes);

      fragment.append(card);
    });

    elements.productGrid.replaceChildren(fragment);
    elements.emptyState.hidden = list.length !== 0;
    elements.resultCount.textContent = `顯示 ${list.length} / ${products.length} 項產品`;
  }

  function applyFilters() {
    const query = state.query.trim().toLowerCase();

    const filtered = products.filter((p) => {
      if (state.categories.size && !state.categories.has(p.category)) {
        return false;
      }

      if (!includesAny(p.materials, state.materials)) {
        return false;
      }

      if (!includesAny(p.purposes, state.purposes)) {
        return false;
      }

      return matchesQuery(p, query);
    });

    renderProducts(filtered);
  }

  function wireEvents() {
    elements.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      applyFilters();
    });

    elements.clearFiltersBtn.addEventListener("click", () => {
      state.query = "";
      state.categories.clear();
      state.materials.clear();
      state.purposes.clear();
      elements.searchInput.value = "";
      renderFilters();
      applyFilters();
    });

    // modal close handlers
    if (elements.modalCloseBtn) {
      elements.modalCloseBtn.addEventListener('click', closeModal);
    }
    if (elements.productModal) {
      const backdrop = elements.productModal.querySelector('.modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', closeModal);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.productModal && elements.productModal.getAttribute('aria-hidden') === 'false') {
        closeModal();
      }
    });
  }

  function renderMeta() {
    const generatedAt = meta.generatedAt ? meta.generatedAt.replace("T", " ") : "";
    const total = Number.isFinite(meta.totalProducts) ? meta.totalProducts : products.length;
    elements.metaInfo.textContent = `資料筆數: ${total}${generatedAt ? ` | 生成時間: ${generatedAt}` : ""}`;
  }

  function init() {
    wireEvents();
    renderFilters();
    renderMeta();
    applyFilters();
  }

  init();
})();

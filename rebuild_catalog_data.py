import html
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parent

SOURCES = [
    {
        "name": "1-20",
        "md": ROOT / "1-20" / "產品目錄.md",
        "content_json": ROOT / "1-20" / "產品目錄_content_list_v2.json",
        "default_category": "鑽石工具系列",
        "pdf_file": "產品目錄_origin.pdf",
        "page_offset": 0,
    },
    {
        "name": "21-40",
        "md": ROOT / "21-40" / "產品目錄-21-40.md",
        "content_json": ROOT / "21-40" / "產品目錄-21-40_content_list_v2.json",
        "default_category": "電動工具系列",
        "pdf_file": "產品目錄-21-40_origin.pdf",
        "page_offset": 20,
    },
    {
        "name": "41-53",
        "md": ROOT / "41-53" / "產品目錄-41-53.md",
        "content_json": ROOT / "41-53" / "產品目錄-41-53_content_list_v2.json",
        "default_category": "五金工具系列",
        "pdf_file": "產品目錄-41-53_origin.pdf",
        "page_offset": 40,
    },
]


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    text = html.unescape(text)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\u3000", " ")
    text = text.replace("\xa0", " ")
    text = re.sub(r"[\t\r\f\v ]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    return text.strip()


def normalize_key(value: str) -> str:
    text = normalize_text(value)
    text = text.replace("\n", " ")
    text = text.strip(" :：\t\r\n")
    text = re.sub(r"\s+", "", text)
    return text


def normalize_image_path(path: str) -> str:
    clean = normalize_text(path)
    if not clean:
        return ""
    basename = Path(clean).name
    if not basename:
        return ""
    return f"images/{basename}"


def append_value(existing: str, value: str) -> str:
    clean = normalize_text(value).replace("\n", " ")
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean:
        return existing
    if not existing:
        return clean
    if clean in existing:
        return existing
    return f"{existing} | {clean}"


def map_label_to_field(label: str) -> Optional[str]:
    key = normalize_key(label)
    if not key:
        return None

    if "產品名稱" in key or key in {"名稱", "產品"}:
        return "name"
    if "產品編號" in key or key == "編號":
        return "code"
    if "規格" in key:
        return "specs"
    if any(token in key for token in ["切割材料", "打孔材料", "打磨材料", "材料"]):
        return "materialText"
    if any(token in key for token in ["用途", "切割", "打孔", "打磨", "特點", "適用", "使用", "代用", "轉換", "轉接", "回轉數", "電壓"]):
        return "purposeText"
    if "包裝" in key:
        return "packaging"
    if "配件" in key:
        return "accessories"
    if "扭力" in key:
        return "torque"
    return None


def set_product_field(product: Dict[str, object], field: str, value: str) -> None:
    if not field:
        return
    if field not in product:
        return
    product[field] = append_value(str(product[field]), value)


def parse_inline_field_value(text: str) -> Tuple[Optional[str], str]:
    clean = normalize_text(text).replace("\n", " ").strip()
    if not clean:
        return None, ""

    match = re.match(
        r"^\(?\s*(產品名稱|名稱|產品編號|編號|規格|切割材料|打孔材料|打磨材料|材料|用途|包裝|配件|扭力)\s*[:：]\s*(.+?)\s*\)?$",
        clean,
    )
    if not match:
        return None, ""

    field = map_label_to_field(match.group(1))
    value = normalize_text(match.group(2)).replace("\n", " ")
    return field, value


def normalize_code_value(value: object) -> str:
    text = normalize_text(value).replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip(" ,;，；")
    if not text:
        return ""

    if "|" in text:
        text = text.split("|", 1)[0].strip()

    text = re.sub(r"\s*[（(].*?[）)]\s*$", "", text).strip(" ,;，；")

    match = re.match(r"^([A-Za-z0-9][A-Za-z0-9+._/\-]*(?:\s+[A-Za-z0-9+._/\-]+)?)", text)
    if match:
        return match.group(1).strip()
    return text


def get_image_page_map(content_json_path: Path) -> Dict[str, int]:
    raw = json.loads(content_json_path.read_text(encoding="utf-8"))
    image_to_page: Dict[str, int] = {}
    for page_index, page_items in enumerate(raw, start=1):
        for item in page_items:
            if item.get("type") != "image":
                continue
            content = item.get("content") or {}
            image_source = content.get("image_source") or {}
            path = normalize_image_path(image_source.get("path", ""))
            if path and path not in image_to_page:
                image_to_page[path] = page_index
    return image_to_page


def parse_table_rows(table_html: str) -> List[List[str]]:
    rows: List[List[str]] = []
    for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", table_html, flags=re.IGNORECASE | re.DOTALL):
        cells = []
        for cell_html in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, flags=re.IGNORECASE | re.DOTALL):
            cell = normalize_text(cell_html).replace("\n", " ")
            cell = re.sub(r"\s+", " ", cell).strip()
            cells.append(cell)
        if cells:
            rows.append(cells)
    return rows


def is_code_like(value: str) -> bool:
    text = normalize_code_value(value)
    if not text:
        return False
    if len(text) < 2 or len(text) > 80:
        return False
    if not re.search(r"[A-Za-z]", text):
        return False
    if not re.match(r"^[A-Za-z0-9]", text):
        return False
    if re.search(r"[\u4e00-\u9fff]", text):
        return False
    if any(ch in text for ch in ['"', "(", ")", "（", "）", "|"]):
        return False
    if ":" in text or "：" in text:
        return False
    if not re.search(r"[A-Za-z0-9]", text):
        return False
    return True


def category_from_page(global_page: int, fallback: str) -> str:
    if 3 <= global_page <= 21:
        return "鑽石工具系列"
    if 22 <= global_page <= 31:
        return "電動工具系列"
    if 32 <= global_page <= 53:
        return "五金工具系列"
    if fallback in {"鑽石工具系列", "電動工具系列", "五金工具系列"}:
        return fallback
    return "五金工具系列"


def infer_category_from_text(text: str, fallback: str) -> str:
    if "鑽石工具系列" in text:
        return "鑽石工具系列"
    if "電動工具系列" in text:
        return "電動工具系列"
    if "五金工具系列" in text:
        return "五金工具系列"
    return fallback


def material_tags_from_text(text: str) -> List[str]:
    tags = []
    mapping = [
        ("麻石", r"麻石|花崗岩|花岗岩"),
        ("雲石", r"雲石|云石|大理石"),
        ("瓷磚", r"瓷磚|瓷砖"),
        ("混凝土", r"混凝土|水泥"),
        ("玻璃", r"玻璃"),
        ("馬路", r"瀝青|沥青|馬路|马路"),
        ("人造石", r"人造石"),
        ("金屬", r"金屬|金属|鋼|钢|不銹鋼|不锈钢|鐵|铁"),
        ("木材", r"木材|木板|木工|木"),
        ("陶瓷", r"陶瓷"),
    ]
    for tag, pattern in mapping:
        if re.search(pattern, text):
            tags.append(tag)
    return tags


def purpose_tags_from_text(text: str) -> List[str]:
    tags = []
    mapping = [
        ("切割", r"切割|鎅碟|鎅片|鋸片|锯片|刀頭|刀头"),
        ("鑽孔/開孔", r"鑽孔|钻孔|開孔|开孔|令梳|鑽咀|钻咀|囉頭|喼輪"),
        ("打磨/拋光", r"打磨|磨片|磨碟|磨盤|磨盘|拋光|抛光"),
        ("破拆/鑿", r"炮尖|扁鑿|扁凿|鎅筆|鎅笔|鑿|凿"),
        ("電動工具", r"鋰電|锂电|電批|扳手|磨機|磨机|水槍|水枪|充電器|充电器|攪拌機|手提鑽"),
        ("轉接/配件", r"轉接|转接|轉換|转换|接杆|運水頭|运水头|配件|集水器|接頭|接头|磁卜|批咀"),
    ]
    for tag, pattern in mapping:
        if re.search(pattern, text):
            tags.append(tag)
    return tags


def type_tags_from_text(text: str) -> List[str]:
    tags = []
    mapping = [
        ("干片", r"干片|千片"),
        ("波紋片", r"波紋片|波纹片"),
        ("超薄", r"超薄|薄片"),
        ("電鍍", r"電鍍|电镀"),
        ("釬焊", r"釬焊|钎焊"),
        ("磨碟", r"磨碟|磨盤|磨盘"),
        ("三節囉頭", r"三節囉頭|三节囉头"),
        ("粗坑碟", r"粗坑|鎅坑|开槽片"),
        ("鋸片", r"鋸片|锯片"),
        ("批咀", r"批咀"),
        ("運水頭", r"運水頭|运水头"),
        ("轉接頭", r"轉接頭|转接头|轉換接頭|转换接头"),
    ]
    for tag, pattern in mapping:
        if re.search(pattern, text):
            tags.append(tag)

    if re.search(r"(1\.2|1\.6)\s*MM|超薄", text, flags=re.IGNORECASE) and all(
        kw in text for kw in ["麻石", "雲石", "瓷磚"]
    ):
        tags.append("1.2mm超薄 麻石,雲石,瓷磚專用")
    elif re.search(r"(1\.2|1\.6)\s*MM", text, flags=re.IGNORECASE) and "超薄" in text:
        tags.append("1.2mm超薄 麻石,雲石,瓷磚專用")

    return tags


def brand_tags_from_text(text: str, code: str) -> List[str]:
    tags: List[str] = []
    merged = f"{text} {code}"

    ehwa_hit = (
        "EHWA" in merged
        or re.search(r"\bEH[-A-Z0-9]", code) is not None
        or "韓國" in merged and "麻石" in merged and "殺手" in merged
    )
    ninja_hit = "麻石忍者" in merged
    killer_hit = "麻石殺手" in merged or "麻石至尊" in merged

    if ehwa_hit:
        tags.append("韓國EHWA麻石殺手")
    else:
        if ninja_hit:
            tags.append("麻石忍者")
        if killer_hit and not ninja_hit:
            tags.append("麻石殺手/麻石至尊")

    mapping = [
        ("BEST", r"\bBEST\b|鷹嘜"),
        ("SuperE", r"SUPER\s*-?\s*E|SuperE"),
        ("ANACA", r"ANACA"),
        ("SPEED", r"SPEED|SpeeD|SPEEDUP|Speedup|Speedly"),
        ("BOSS", r"BOSS"),
        ("OSAKA", r"OSAKA|大阪"),
        ("SKARP", r"SKARP"),
        ("GREAT", r"GREAT"),
        ("DIAMANT", r"DIAMANT"),
        ("MORE", r"\bMORE\b"),
    ]

    for tag, pattern in mapping:
        if re.search(pattern, merged, flags=re.IGNORECASE):
            tags.append(tag)

    # Enforce separation between 麻石忍者 and 麻石殺手 brands.
    if "麻石忍者" in tags and "麻石殺手/麻石至尊" in tags:
        tags = [t for t in tags if t != "麻石殺手/麻石至尊"]

    # If EHWA, keep only EHWA-centric family label plus explicit global brands.
    if "韓國EHWA麻石殺手" in tags:
        keep = {"韓國EHWA麻石殺手", "BEST", "SPEED", "DIAMANT", "ANACA", "SuperE", "OSAKA", "SKARP", "GREAT", "BOSS", "MORE"}
        tags = [t for t in tags if t in keep]

    seen = set()
    ordered = []
    for tag in tags:
        if tag not in seen:
            seen.add(tag)
            ordered.append(tag)
    return ordered


def build_base_product(
    context: Dict[str, str],
    image: str,
    source_name: str,
    local_page: int,
    global_page: int,
    pdf_file: str,
) -> Dict[str, object]:
    return {
        "id": "",
        "category": context.get("category", ""),
        "section": context.get("section", ""),
        "subSection": context.get("subSection", ""),
        "name": "",
        "code": "",
        "specs": "",
        "materialText": "",
        "purposeText": "",
        "packaging": "",
        "accessories": "",
        "torque": "",
        "notes": "",
        "image": image,
        "source": source_name,
        "page": global_page,
        "pdfPage": global_page,
        "pdfPageLocal": local_page,
        "pdfFile": pdf_file,
        "pdfLink": f"{pdf_file}#page={local_page}" if local_page > 0 else "",
        "tags": {
            "brand": [],
            "material": [],
            "type": [],
        },
        "materials": [],
        "purposes": [],
        "searchText": "",
    }


def product_has_minimum_data(product: Dict[str, object]) -> bool:
    code = normalize_code_value(product.get("code", ""))
    # Keep rows only when they contain a plausible part code.
    return bool(
        is_code_like(code)
        and not any(token in code for token in ["產品", "名稱", "規格", "用途", "包裝"])
    )


def add_products_from_table(
    rows: List[List[str]],
    context: Dict[str, str],
    image: str,
    source_name: str,
    local_page: int,
    global_page: int,
    pdf_file: str,
    caption: str,
    out: List[Dict[str, object]],
) -> None:
    if not rows:
        return

    # Handle paired two-row product blocks commonly encoded as:
    # 產品名稱 + 編號/規格, repeated in sequence.
    paired_products: List[Dict[str, object]] = []
    pair_index = 0
    while pair_index + 1 < len(rows):
        row_name = rows[pair_index]
        row_code = rows[pair_index + 1]
        field_name = map_label_to_field(row_name[0]) if row_name else None
        field_code = map_label_to_field(row_code[0]) if row_code else None

        if field_name != "name" or field_code != "code":
            break

        name_value = normalize_text(row_name[1]) if len(row_name) > 1 else ""
        code_value = normalize_text(row_code[1]) if len(row_code) > 1 else ""
        specs_value = normalize_text(row_code[2]) if len(row_code) > 2 else ""

        if len(row_name) > 2:
            inline_field, inline_value = parse_inline_field_value(row_name[2])
            if inline_field == "specs" and not specs_value:
                specs_value = inline_value

        product = build_base_product(context, image, source_name, local_page, global_page, pdf_file)
        product["name"] = name_value or caption or context.get("subSection", "")
        product["code"] = code_value
        product["specs"] = specs_value

        if product_has_minimum_data(product):
            paired_products.append(product)

        pair_index += 2

    if paired_products and pair_index >= len(rows):
        out.extend(paired_products)
        return

    label_rows: List[Tuple[List[str], str]] = []
    max_cols = 0
    for row in rows:
        max_cols = max(max_cols, len(row))
        if not row:
            continue
        field = map_label_to_field(row[0])
        if field:
            label_rows.append((row, field))

    if len(label_rows) >= 2 and max_cols >= 2:
        for col in range(1, max_cols):
            product = build_base_product(context, image, source_name, local_page, global_page, pdf_file)
            for row, field in label_rows:
                value = ""
                if col < len(row):
                    value = row[col]
                elif len(row) == 2:
                    value = row[1]
                set_product_field(product, field, value)

            if not normalize_text(str(product["name"])) and caption:
                product["name"] = caption

            if product_has_minimum_data(product):
                out.append(product)
        return

    header0 = normalize_key(rows[0][0]) if rows and rows[0] else ""
    header1 = normalize_key(rows[0][1]) if rows and len(rows[0]) > 1 else ""
    is_list = ("產品編號" in header0) or header0 == "編號"

    if is_list and len(rows) >= 2:
        defaults = {
            "materialText": "",
            "purposeText": "",
            "packaging": "",
            "notes": "",
        }
        created: List[Dict[str, object]] = []

        def apply_to_created(field: str, value: str) -> None:
            if not value:
                return
            for item in created:
                item[field] = append_value(str(item.get(field, "")), value)

        for row in rows[1:]:
            c1 = normalize_text(row[0]) if len(row) >= 1 else ""
            c2 = normalize_text(row[1]) if len(row) >= 2 else ""
            c3 = normalize_text(row[2]) if len(row) >= 3 else ""

            if not c1 and not c2 and not c3:
                continue

            k1 = normalize_key(c1)
            if "包裝" in k1:
                packaging_value = normalize_text(f"{c2} {c3}")
                defaults["packaging"] = append_value(defaults["packaging"], packaging_value)
                apply_to_created("packaging", packaging_value)
                continue
            if any(token in k1 for token in ["用途", "特點", "切割", "打孔", "打磨", "代用", "轉換", "轉接"]):
                defaults["purposeText"] = append_value(defaults["purposeText"], f"{c2} {c3}")
                continue
            if "材料" in k1:
                defaults["materialText"] = append_value(defaults["materialText"], f"{c2} {c3}")
                continue
            if "規格" in k1 and created:
                created[-1]["specs"] = append_value(str(created[-1].get("specs", "")), f"{c2} {c3}")
                continue
            if ("產品名稱" in k1 or k1 == "名稱") and created:
                created[-1]["name"] = append_value(str(created[-1].get("name", "")), f"{c2} {c3}")
                continue

            if not c1 and c2:
                inline_field, inline_value = parse_inline_field_value(c2)
                if inline_field:
                    if inline_field in {"materialText", "purposeText", "notes"}:
                        defaults[inline_field] = append_value(defaults[inline_field], inline_value)
                    elif inline_field == "packaging":
                        defaults["packaging"] = append_value(defaults["packaging"], inline_value)
                        apply_to_created("packaging", inline_value)
                    elif inline_field == "specs" and created:
                        created[-1]["specs"] = append_value(str(created[-1].get("specs", "")), inline_value)
                    elif inline_field == "name" and created:
                        created[-1]["name"] = append_value(str(created[-1].get("name", "")), inline_value)
                    elif inline_field == "code" and created and not created[-1].get("code"):
                        created[-1]["code"] = inline_value
                    else:
                        defaults["notes"] = append_value(defaults["notes"], inline_value)
                continue

            code_value, name_value, specs_value = c1, c2, c3

            if not is_code_like(code_value):
                if not c1 and is_code_like(c2):
                    code_value, name_value, specs_value = c2, c3, ""
                else:
                    defaults["notes"] = append_value(defaults["notes"], f"{c1} {c2} {c3}")
                    continue

            product = build_base_product(context, image, source_name, local_page, global_page, pdf_file)
            product["code"] = code_value

            if "規格" in header1:
                product["specs"] = name_value
                if caption:
                    product["name"] = caption
                elif context.get("subSection"):
                    product["name"] = context["subSection"]
                elif context.get("section"):
                    product["name"] = context["section"]
            else:
                if not name_value:
                    name_value = caption or context.get("subSection") or context.get("section", "")
                product["name"] = name_value
                product["specs"] = specs_value

            for key, value in defaults.items():
                if value:
                    product[key] = append_value(str(product.get(key, "")), value)

            created.append(product)

        for product in created:
            if product_has_minimum_data(product):
                out.append(product)
        return

    fallback = build_base_product(context, image, source_name, local_page, global_page, pdf_file)
    if caption:
        fallback["name"] = caption

    for row in rows:
        if len(row) < 2:
            continue
        field = map_label_to_field(row[0])
        if field:
            set_product_field(fallback, field, row[1])

    if product_has_minimum_data(fallback):
        out.append(fallback)


def backfill_name_and_specs(product: Dict[str, object]) -> None:
    name = normalize_text(product.get("name", "")).replace("\n", " ").strip(" ,，")
    specs = normalize_text(product.get("specs", "")).replace("\n", " ").strip(" ,，")
    section = normalize_text(product.get("section", "")).replace("\n", " ").strip(" ,，")
    sub_section = normalize_text(product.get("subSection", "")).replace("\n", " ").strip(" ,，")

    if not name:
        if sub_section and "系列" not in sub_section:
            name = sub_section
        elif section:
            name = section

    if not specs and name:
        has_spec_tokens = bool(re.search(r"[0-9]|MM|CM|\"|V|x", name, flags=re.IGNORECASE))
        if sub_section and sub_section != name and "系列" not in sub_section and len(sub_section) <= 40 and has_spec_tokens:
            specs = name
            name = sub_section
        else:
            specs = name

    product["name"] = name
    product["specs"] = specs


def parse_markdown_source(cfg: Dict[str, object], image_page_map: Dict[str, int]) -> List[Dict[str, object]]:
    text = Path(cfg["md"]).read_text(encoding="utf-8")
    lines = text.splitlines()

    context = {
        "category": str(cfg["default_category"]),
        "section": "",
        "subSection": "",
    }

    products: List[Dict[str, object]] = []
    last_image = ""
    last_local_page = 0
    last_caption = ""
    pending: Dict[str, str] = {}

    field_line_regex = re.compile(
        r"^(產品名稱|名稱|產品編號|編號|規格|切割材料|打孔材料|打磨材料|材料|用途|包裝|配件|扭力)\s*[:：]\s*(.+)$"
    )

    def effective_pages() -> Tuple[int, int]:
        local_page = last_local_page
        global_page = local_page + int(cfg["page_offset"]) if local_page else 0
        return local_page, global_page

    def finalize_pending() -> None:
        nonlocal pending
        if not pending:
            return
        local_page, global_page = effective_pages()
        product = build_base_product(
            context=context,
            image=last_image,
            source_name=str(Path(cfg["md"]).name),
            local_page=local_page,
            global_page=global_page,
            pdf_file=str(cfg["pdf_file"]),
        )
        for key, value in pending.items():
            if key in product:
                product[key] = append_value(str(product[key]), value)
        if not normalize_text(str(product["name"])) and last_caption:
            product["name"] = last_caption
        if product_has_minimum_data(product):
            products.append(product)
        pending = {}

    i = 0
    while i < len(lines):
        raw_line = lines[i]
        line = raw_line.rstrip()
        stripped = line.strip()

        if "<table" in line:
            finalize_pending()
            table_lines = [line]
            while "</table>" not in lines[i] and i + 1 < len(lines):
                i += 1
                table_lines.append(lines[i])
            table_html = "\n".join(table_lines)
            rows = parse_table_rows(table_html)
            local_page, global_page = effective_pages()
            caption = last_caption
            add_products_from_table(
                rows=rows,
                context=context,
                image=last_image,
                source_name=str(Path(cfg["md"]).name),
                local_page=local_page,
                global_page=global_page,
                pdf_file=str(cfg["pdf_file"]),
                caption=caption,
                out=products,
            )
            i += 1
            continue

        heading_match = re.match(r"^(#{1,6})\s*(.+?)\s*$", stripped)
        if heading_match:
            finalize_pending()
            level = len(heading_match.group(1))
            title = normalize_text(heading_match.group(2)).replace("\n", " ").strip()
            if title:
                context["category"] = infer_category_from_text(title, context["category"])
                if level <= 2:
                    context["section"] = title
                    context["subSection"] = ""
                else:
                    context["subSection"] = title
                last_caption = title
            i += 1
            continue

        image_match = re.search(r"!\[[^\]]*\]\(([^)]+)\)", line)
        if image_match:
            finalize_pending()
            image_path = normalize_image_path(image_match.group(1))
            if image_path:
                last_image = image_path
                if image_path in image_page_map:
                    last_local_page = image_page_map[image_path]
            trailing = line[image_match.end() :].strip()
            if trailing:
                last_caption = normalize_text(trailing).replace("\n", " ")
            i += 1
            continue

        field_match = field_line_regex.match(stripped)
        if field_match:
            label = field_match.group(1)
            value = field_match.group(2)
            field = map_label_to_field(label)
            if field:
                if field == "name" and pending.get("code") and pending.get("name"):
                    finalize_pending()
                pending[field] = append_value(pending.get(field, ""), value)
            i += 1
            continue

        if pending and not stripped:
            finalize_pending()
            i += 1
            continue

        if stripped and not stripped.startswith("!") and not stripped.startswith("<"):
            maybe_section = infer_category_from_text(stripped, "")
            if maybe_section:
                context["category"] = maybe_section
                if "系列" in stripped and len(stripped) <= 120:
                    context["section"] = stripped
                    context["subSection"] = ""
            if len(stripped) <= 120 and not re.match(r"^[\(（].+[\)）]$", stripped):
                last_caption = normalize_text(stripped).replace("\n", " ")

        i += 1

    finalize_pending()
    return products


def finalize_products(products: List[Dict[str, object]]) -> List[Dict[str, object]]:
    final: List[Dict[str, object]] = []
    dedup = set()

    for p in products:
        p["name"] = normalize_text(p.get("name", "")).replace("\n", " ")
        p["code"] = normalize_code_value(p.get("code", ""))
        p["specs"] = normalize_text(p.get("specs", "")).replace("\n", " ")
        p["materialText"] = normalize_text(p.get("materialText", "")).replace("\n", " ")
        p["purposeText"] = normalize_text(p.get("purposeText", "")).replace("\n", " ")
        p["packaging"] = normalize_text(p.get("packaging", "")).replace("\n", " ")
        p["accessories"] = normalize_text(p.get("accessories", "")).replace("\n", " ")
        p["torque"] = normalize_text(p.get("torque", "")).replace("\n", " ")
        p["notes"] = normalize_text(p.get("notes", "")).replace("\n", " ")
        p["section"] = normalize_text(p.get("section", "")).replace("\n", " ")
        p["subSection"] = normalize_text(p.get("subSection", "")).replace("\n", " ")
        p["image"] = normalize_image_path(str(p.get("image", "")))

        global_page = int(p.get("pdfPage", 0) or 0)
        local_page = int(p.get("pdfPageLocal", 0) or 0)

        if global_page < 3 or global_page > 53:
            continue

        p["category"] = category_from_page(global_page, str(p.get("category", "")))
        backfill_name_and_specs(p)

        base_text = " ".join(
            [
                p["name"],
                p["code"],
                p["specs"],
                p["materialText"],
                p["purposeText"],
                p["section"],
                p["subSection"],
                p["packaging"],
                p["notes"],
            ]
        )

        materials = material_tags_from_text(base_text)
        purposes = purpose_tags_from_text(base_text)
        type_tags = type_tags_from_text(base_text)
        brand_tags = brand_tags_from_text(base_text, p["code"])

        p["materials"] = materials
        p["purposes"] = purposes
        p["tags"] = {
            "brand": brand_tags,
            "material": materials,
            "type": type_tags,
        }
        p["searchText"] = re.sub(r"\s+", " ", base_text).strip()

        if not p["pdfLink"] and p["pdfFile"] and local_page > 0:
            p["pdfLink"] = f"{p['pdfFile']}#page={local_page}"

        if not product_has_minimum_data(p):
            continue

        dedup_key = "|".join(
            [
                p["category"],
                str(global_page),
                normalize_key(p["code"]),
                normalize_key(p["name"]),
                normalize_key(p["specs"]),
            ]
        )
        if dedup_key in dedup:
            continue
        dedup.add(dedup_key)
        final.append(p)

    final.sort(key=lambda item: (int(item.get("pdfPage", 0)), str(item.get("category", "")), str(item.get("code", "")), str(item.get("name", ""))))

    for idx, p in enumerate(final, start=1):
        p["id"] = f"P{idx:04d}"
        p["page"] = int(p.get("pdfPage", 0) or 0)

    return final


def main() -> None:
    all_products: List[Dict[str, object]] = []

    for cfg in SOURCES:
        image_page_map = get_image_page_map(Path(cfg["content_json"]))
        section_products = parse_markdown_source(cfg, image_page_map)
        all_products.extend(section_products)

    final_products = finalize_products(all_products)

    meta = {
        "generatedAt": "",  # filled by JS at runtime is unnecessary; keep deterministic here.
        "totalProducts": len(final_products),
        "sourceFiles": [
            str(Path(src["md"]).relative_to(ROOT)).replace("\\", "/") for src in SOURCES
        ],
    }

    output = [
        "// Auto-generated by rebuild_catalog_data.py",
        "window.CATALOG_PRODUCTS = " + json.dumps(final_products, ensure_ascii=False, separators=(",", ":")) + ";",
        "window.CATALOG_META = " + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ";",
    ]

    (ROOT / "catalog-data.js").write_text("\n".join(output), encoding="utf-8")
    print(f"Generated {len(final_products)} products into catalog-data.js")


if __name__ == "__main__":
    main()

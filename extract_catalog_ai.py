import json
import os
import re
import time
from typing import List, Dict, Any

# Requires: pip install openai
from openai import OpenAI

# ==========================================
# CONFIGURATION
# ==========================================
# IMPORTANT: Put your API key here or as an environment variable
API_KEY = os.environ.get("OPENAI_API_KEY", "sk-poe-Vxg5QbNcFVJt2xB2cVZwxLzK2mzwrK0z7Po_ah3bAGY")

# Model to use. Examples: "gpt-4o", "gpt-4o-mini" (OpenAI) or "gemini-1.5-pro" (if using Gemini via OpenAI-compat or google sdk)
MODEL = "gpt-4o" 

# Base URL for Poe's OpenAI-compatible API
BASE_URL = "https://api.poe.com/v1"
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

FILES_TO_PROCESS = [
    {"file": "產品目錄_content_list_v2.json", "start_page": 1, "pdf_name": "產品目錄_origin.pdf"},
    {"file": "產品目錄-21-40_content_list_v2.json", "start_page": 21, "pdf_name": "產品目錄-21-40_origin.pdf"},
    {"file": "產品目錄-41-53_content_list_v2.json", "start_page": 41, "pdf_name": "產品目錄-41-53_origin.pdf"}
]

# Prompt strictly dictating the output structure and the extraction rules
SYSTEM_PROMPT = """
You are a highly accurate data extraction assistant specialized in e-catalogs.
Your task is to extract product data from the provided raw OCR text text.
You must output ONLY valid JSON in the form of a list of product objects.

CRITICAL RULES:
1. Exact Text ONLY: Do not translate, do not summarize, do not hallucinate. Use only the exact Chinese text, numbers, and codes from the context.
2. Output JSON Structure MUST be a list of objects containing:
   - "category": String. EXACTLY one of: "鑽石工具系列", "電動工具系列", "五金工具系列".
   - "subCategory": String. E.g. "EHWA麻石殺手", "麻石忍者", "電鍍/釬焊", "5\"-30\"麻石碟", "粗坑碟", "磨碟", "三節囉頭", etc.
   - "name": String. Exact Chinese name.
   - "code": String. Exact code (e.g., EH-DW4Z, DW4D-1000P).
   - "specs": String. Full specification (e.g. "105 x 1.2 x 8 x 20(16)mm"). If missing, use "".
   - "materials": String. Exact string from PDF describing materials it can cut/grind (e.g., "可干鋸高硬度麻石,雲石,水泥,瓷磚...").
   - "package": String. Exact package format (e.g. "24片/紙盒").
   - "image": String. Exact code string but lowercased, + ".png" or ".jpg" (We will fix this later if wrong, just guess code.jpg).
   - "tags": Object with keys ["brand", "material", "type"]. These should be Lists of strings.
   - "pdfPage": Number. The page number provided to you.
   - "pdfFile": String. The pdf filename provided to you.
3. Specific Tagging Rules:
   - Keep all Korean EHWA products under "韓國EHWA麻石殺手" brand.
   - Never mix "麻石至尊 / 麻石殺手" with "麻石忍者".
   - Keep all 1.2mm / 1.6mm super-thin porcelain tiles correctly tagged "1.2mm超薄 麻石,雲石,瓷磚專用".
   - Core drill bits (三節囉頭) with correct thread (1-1/4"UNC) and lengths must be grouped together under the "三節囉頭" subcategory.
4. Output format: Return JSON ONLY. No markdown wrappers ```json ... ```, just [ {...}, {...} ] or [] if no products found.

Wait, to be safe, I will allow standard JSON with markdown but I will parse it out.
"""

def extract_text_from_node(node: Any) -> str:
    """Recursively extract text from the ugly OCR JSON structure."""
    if isinstance(node, str): return node
    if isinstance(node, list): return " ".join(extract_text_from_node(item) for item in node)
    if isinstance(node, dict):
        # usually looks like {"type": "text", "content": "The Text"}
        if "content" in node:
            if isinstance(node["content"], str):
                return node["content"]
            elif isinstance(node["content"], list):
                return extract_text_from_node(node["content"])
            elif isinstance(node["content"], dict):
                # nested like {"title_content": [...]} or {"text_content": [...]}
                return extract_text_from_node(list(node["content"].values()))
    return ""

def generate_catalog_json():
    all_products = []
    
    for file_info in FILES_TO_PROCESS:
        filepath = file_info["file"]
        start_page = file_info["start_page"]
        pdf_name = file_info["pdf_name"]
        
        if not os.path.exists(filepath):
            print(f"File {filepath} not found. Skipping.")
            continue
            
        with open(filepath, 'r', encoding='utf-8') as f:
            pages = json.load(f)
            
        print(f"\nProcessing {filepath} (Contains {len(pages)} pages)")
        
        for i, page_data in enumerate(pages):
            current_page_num = start_page + i
            print(f"  Extracting page {current_page_num}...")
            
            raw_text = extract_text_from_node(page_data)
            if len(raw_text.strip()) < 20: # skip empty blank pages
                continue
                
            user_msg = (
                f"Page Text Input (from page {current_page_num} of {pdf_name}):\n\n{raw_text}\n\n"
                f"Please extract all product entries according to the rules. "
                f"Use pdfPage={current_page_num} and pdfFile=\"{pdf_name}\"."
            )
            
            try:
                response = client.chat.completions.create(
                    model=MODEL,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_msg}
                    ],
                    temperature=0.0
                )
                
                # strip out arbitrary markdown wrappers if present
                result_text = response.choices[0].message.content.strip()
                if result_text.startswith("```json"):
                    result_text = result_text[7:]
                if result_text.startswith("```"):
                    result_text = result_text[3:]
                if result_text.endswith("```"):
                    result_text = result_text[:-3]
                    
                page_products = json.loads(result_text)
                if isinstance(page_products, list):
                    all_products.extend(page_products)
                    print(f"  -> Found {len(page_products)} products.")
                else:
                    print(f"  -> Error: returned JSON is not a list. Skipping payload.")
                    
            except Exception as e:
                print(f"  -> API Error on page {current_page_num}: {e}")
                
            # Sleep slightly to avoid rapid rate limits if using a strict tier
            time.sleep(2)

    # Write out the new catalog-data.js
    output_file = "catalog-data.js"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("const catalogData = ")
        json.dump(all_products, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    print(f"\n✅ Processing complete. Wrote {len(all_products)} total products to {output_file}")


if __name__ == "__main__":
    if API_KEY == "YOUR_API_KEY_HERE":
        print("⚠️ Warning: You need to set your API_KEY in the script or environment variables first.")
        print('Otherwise it will fail. Make sure to run: pip install openai')
    else:
        generate_catalog_json()

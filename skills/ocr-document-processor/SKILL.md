---
name: ocr-document-processor
description: >
  Extract text from images, scanned PDFs, and photographs using OCR. Supports 100+
  languages, table detection, structured output (Markdown/JSON/Excel), and batch
  processing. Activate when users need to: recognize text from images or scanned
  documents, extract tables from scanned PDFs, process receipts or invoices,
  convert image-based documents to editable text, or handle any OCR-related tasks.
compatibility:
  - MiCode
  - Claude Code
  - Codex
allowed-tools: Bash(python:*) Bash(pip:*) Read Write
metadata:
  author: 财多多 (Rich)
  version: 1.0.0
  tags: ocr, text-recognition, pdf, image, table-extraction, multi-language
  based_on: PaddleOCR + Tesseract OCR
---

# OCR Document Processor

## When to Activate

Activate this skill when a user:
- Needs to extract text from images (PNG, JPG, TIFF, BMP)
- Wants to process scanned PDFs or image-based PDFs
- Needs to recognize and extract tables from scanned documents
- Wants to convert receipts, invoices, or business cards to structured data
- Needs multi-language OCR (Chinese, English, Japanese, Korean, etc.)
- Asks: "识别这个图片中的文字"、"提取扫描件中的表格"、"OCR识别"

## Core Capabilities

- ✅ Multi-language text recognition (100+ languages)
- ✅ Table detection and extraction to Excel/CSV
- ✅ Scanned PDF processing (page by page)
- ✅ Image preprocessing for better accuracy
- ✅ Structured output (Markdown, JSON, Excel)
- ✅ Batch processing multiple files
- ✅ Confidence scoring for quality assessment

## Prerequisites

Install OCR dependencies if not already available:

```bash
# Install PaddleOCR (recommended for Chinese + English)
pip install paddleocr paddlepaddle -q

# Or install Tesseract OCR (for other languages)
pip install pytesseract pillow pdf2image -q
```

## Workflow 1: Basic Text Extraction from Image

```python
from paddleocr import PaddleOCR

# Initialize OCR engine
ocr = PaddleOCR(use_angle_cls=True, lang='ch')  # 'ch' for Chinese+English

# Process image
result = ocr.ocr('document.png', cls=True)

# Extract text
full_text = []
for idx in range(len(result)):
    res = result[idx]
    for line in res:
        text = line[1][0]
        confidence = line[1][1]
        full_text.append(text)

# Output
output_text = '\n'.join(full_text)
print(output_text)

# Save to file
with open('extracted_text.txt', 'w', encoding='utf-8') as f:
    f.write(output_text)

print(f"✅ 文本已提取并保存到 extracted_text.txt")
```

## Workflow 2: Extract Tables from Scanned PDF

```python
from paddleocr import PPStructure
import pandas as pd

# Initialize structure analysis engine
table_engine = PPStructure(show_log=False, lang='ch')

# Process PDF
result = table_engine('scanned_document.pdf')

# Extract tables
tables = []
for i, region in enumerate(result):
    if region['type'] == 'table':
        # Get table HTML
        html = region['res']['html']
        
        # Convert to DataFrame
        df = pd.read_html(html)[0]
        tables.append(df)
        
        # Save to Excel
        df.to_excel(f'table_{i+1}.xlsx', index=False)
        print(f"✅ 表格 {i+1} 已保存到 table_{i+1}.xlsx")

print(f"✅ 共提取 {len(tables)} 个表格")
```

## Workflow 3: Batch Process Multiple Images

```python
from paddleocr import PaddleOCR
import os
import glob

# Initialize OCR
ocr = PaddleOCR(use_angle_cls=True, lang='ch')

# Find all images
image_files = glob.glob('*.png') + glob.glob('*.jpg') + glob.glob('*.jpeg')

# Process each image
results = {}
for img_file in image_files:
    print(f"处理中: {img_file}")
    
    result = ocr.ocr(img_file, cls=True)
    
    # Extract text
    text_lines = []
    for idx in range(len(result)):
        res = result[idx]
        for line in res:
            text_lines.append(line[1][0])
    
    full_text = '\n'.join(text_lines)
    results[img_file] = full_text
    
    # Save individual result
    output_name = os.path.splitext(img_file)[0] + '_ocr.txt'
    with open(output_name, 'w', encoding='utf-8') as f:
        f.write(full_text)

print(f"✅ 批量处理完成，共处理 {len(image_files)} 个文件")
```

## Workflow 4: Receipt/Invoice Recognition

```python
from paddleocr import PaddleOCR
import re

# Initialize OCR
ocr = PaddleOCR(use_angle_cls=True, lang='ch')

# Process receipt image
result = ocr.ocr('receipt.jpg', cls=True)

# Extract all text
all_text = []
for idx in range(len(result)):
    res = result[idx]
    for line in res:
        all_text.append(line[1][0])

full_text = '\n'.join(all_text)

# Parse structured information
invoice_data = {
    '发票号码': None,
    '日期': None,
    '金额': None,
    '税额': None,
    '供应商': None
}

# Simple pattern matching (can be enhanced)
for line in all_text:
    if '发票号码' in line or '票号' in line:
        invoice_data['发票号码'] = line
    elif '日期' in line:
        invoice_data['日期'] = line
    elif '金额' in line or '合计' in line:
        # Extract numbers
        amounts = re.findall(r'\d+\.?\d*', line)
        if amounts:
            invoice_data['金额'] = amounts[0]

# Output structured data
print("识别结果：")
for key, value in invoice_data.items():
    print(f"{key}: {value}")

# Save to Excel
import pandas as pd
df = pd.DataFrame([invoice_data])
df.to_excel('invoice_data.xlsx', index=False)

print("✅ 发票信息已保存到 invoice_data.xlsx")
```

## Workflow 5: Multi-language OCR

```python
from paddleocr import PaddleOCR

# Supported languages: 'ch', 'en', 'korean', 'japan', 'chinese_cht', etc.

# Chinese + English
ocr_ch = PaddleOCR(use_angle_cls=True, lang='ch')

# English only
ocr_en = PaddleOCR(use_angle_cls=True, lang='en')

# Japanese
ocr_jp = PaddleOCR(use_angle_cls=True, lang='japan')

# Korean
ocr_kr = PaddleOCR(use_angle_cls=True, lang='korean')

# Process with appropriate language
result = ocr_ch.ocr('chinese_document.png', cls=True)
```

## Supported Languages

| Language | Code | Language | Code |
|----------|------|----------|------|
| Chinese (Simplified) | `ch` | English | `en` |
| Chinese (Traditional) | `chinese_cht` | Japanese | `japan` |
| Korean | `korean` | French | `french` |
| German | `german` | Spanish | `spanish` |
| Portuguese | `portuguese` | Russian | `russian` |

## Output Formats

| Format | Command | Use Case |
|--------|---------|----------|
| Plain Text | Save to `.txt` | Simple text extraction |
| Markdown | Format with structure | Document with headings/lists |
| Excel | Use `pandas` | Tables and structured data |
| JSON | Use `json.dump()` | Programmatic processing |

## Error Handling

- **Low-quality image**: Apply preprocessing (denoise, sharpen, contrast)
- **Wrong language detected**: Explicitly specify language with `lang` parameter
- **Table not recognized**: Use `PPStructure` instead of basic `PaddleOCR`
- **Memory error on large PDF**: Process page by page instead of entire file
- **Installation issues**: Use `pip install paddlepaddle-gpu` for GPU acceleration

## Performance Tips

1. **GPU Acceleration**: Use `use_gpu=True` for faster processing
2. **Batch Processing**: Process multiple images in one session to reuse model
3. **Image Quality**: 300+ DPI recommended for best accuracy
4. **Language Specification**: Always specify language for better speed and accuracy

## After OCR

Always ask the user:
- "文本已提取，需要我帮您进一步处理吗？（清洗数据、生成Excel、分析内容）"
- "识别了 X 个表格，需要我合并或分析吗？"
- Offer to activate other Skills like `excel-data-cleaning` or `pdf-deep-analysis`

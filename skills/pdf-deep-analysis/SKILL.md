---
name: pdf-deep-analysis
description: >
  Analyze, extract, and interpret content from PDF files including text, tables,
  charts, and financial data. Activate when users want to: read or summarize a PDF,
  extract tables or financial data from PDF, analyze annual reports or contracts,
  convert PDF content to Excel or structured formats, or understand PDF documents.
compatibility:
  - MiCode
  - Claude Code
  - Codex
allowed-tools: Bash(python:*) Bash(pip:*) Read Write
metadata:
  author: 财多多 (Rich)
  version: 1.0.0
  tags: pdf, analysis, extract, table, finance, report
---

# PDF Deep Analysis

## When to Activate

Activate this skill when a user:
- Wants to read, understand, or summarize a PDF file
- Needs to extract text, tables, or financial data from PDF
- Wants to analyze financial reports, contracts, or documents in PDF format
- Needs to convert PDF content to Excel, CSV, or structured text
- Asks: "帮我分析这个财报PDF"、"提取这个PDF里的表格数据"、"把PDF转成Excel"

## Prerequisites

Install Python dependencies if not already available:

```bash
pip install pdfplumber pandas openpyxl -q
```

## Analysis Workflows

### Workflow 1: Extract and Summarize Text

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    total_pages = len(pdf.pages)
    print(f"Total pages: {total_pages}")
    for i, page in enumerate(pdf.pages, 1):
        text = page.extract_text()
        if text:
            print(f"\n--- Page {i} ---")
            print(text[:2000])  # First 2000 chars per page
```

### Workflow 2: Extract Tables to Excel

```python
import pdfplumber
import pandas as pd

all_tables = []
with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table and table[0]:
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

if all_tables:
    output_file = "extracted_tables.xlsx"
    with pd.ExcelWriter(output_file, engine="openpyxl") as writer:
        for i, df in enumerate(all_tables):
            sheet_name = f"Table_{i+1}"
            df.to_excel(writer, sheet_name=sheet_name, index=False)
    print(f"Saved {len(all_tables)} tables to {output_file}")
else:
    print("No tables found in this PDF. The document may use images for tables.")
```

### Workflow 3: Financial Report Analysis

When analyzing annual reports or financial statements:

1. Extract all tables from key pages (income statement, balance sheet, cash flow)
2. Identify key metrics:
   - Revenue (营收/收入)
   - Net profit (净利润)
   - Year-over-year growth (同比增长)
   - Gross margin (毛利率)
3. Present findings as a structured comparison table
4. Save to Excel for further analysis with `pdf-to-excel` or manual review

### Workflow 4: Quick Summary

For long documents, provide a structured summary:
- Document type and date
- Key findings (top 5 points)
- Financial highlights (if applicable)
- Important risks or notes

## Output Formats

| Output Type | Method |
|-------------|--------|
| Text summary | Print directly in conversation |
| Structured data | Save as `.xlsx` or `.csv` |
| Key metrics | Present as formatted table |
| Full text | Save as `.txt` file |

## Error Handling

- If `pdfplumber` fails: the PDF may be scanned/image-based and needs OCR
- For scanned PDFs: install `pytesseract` and `pdf2image` for OCR processing
- If tables appear empty: try `tabula-py` as alternative (`pip install tabula-py`)
- Always report what was successfully extracted even if partial

## After Analysis

Always offer next steps:
- "数据已提取，需要我帮您计算同比增长率或生成对比图表吗？"
- "表格已导出到 extracted_tables.xlsx，需要我帮您清洗或对比数据吗？"

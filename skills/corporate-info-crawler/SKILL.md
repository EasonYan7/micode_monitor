---
name: corporate-info-crawler
description: >
  Find and download official corporate documents including annual reports, interim
  reports, earnings announcements, investor presentations, and regulatory filings
  from listed companies. Activate when users need: company financial reports,
  annual/quarterly reports, investor relations documents, or official filings from
  HK-listed, A-share, or US-listed companies.
compatibility:
  - MiCode
  - Claude Code
  - Codex
allowed-tools: Bash(curl:*) Bash(python:*) Write
metadata:
  author: 财多多 (Rich)
  version: 1.0.0
  tags: corporate, annual-report, financial, hkex, investor-relations, download
---

# Corporate Information Crawler

## When to Activate

Activate when a user needs:
- Annual reports (年报), interim reports (中期报告), or quarterly results
- Earnings announcements or profit warnings
- Investor presentations or roadshow materials
- Regulatory filings from stock exchanges (HKEX, A-share, SEC)
- Company press releases or official announcements

Trigger phrases: "下载财报"、"年报"、"公司公告"、"投资者关系"、"业绩报告"

## Supported Sources

### Hong Kong Listed Companies (HKEX)
- DisclosureEasy search: https://www.hkexnews.hk/listedco/listconews/advancedsearch/search_active_main.aspx
- Direct company search: Use company stock code (e.g., 1810 for Xiaomi)

### Common Investor Relations Patterns
- `https://<company>.com/investor-relations`
- `https://<company>.com/investors`
- `https://ir.<company>.com`

### Key Company Pages
- Xiaomi (HK:1810): https://www.mi.com/global/investors
- Tencent (HK:700): https://www.tencent.com/en-us/investors.html
- Alibaba (HK:9988): https://www.alibabagroup.com/en-US/investor-relations
- JD.com (HK:9618): https://ir.jd.com

## Step-by-Step Workflow

### Step 1: Identify the Request

Confirm with user:
- Company name (and stock code if known)
- Document type: annual report / interim report / earnings announcement / all filings
- Year or date range (e.g., "2024年年报", "近三年")

### Step 2: Navigate to Source

```python
# Access the investor relations page
web_fetch("https://www.mi.com/global/investors")
# Or try HKEX for HK-listed companies
web_fetch("https://www.hkexnews.hk/listedco/listconews/advancedsearch/search_active_main.aspx")
```

### Step 3: Find Document Links

Parse the page content to locate:
- Direct PDF links (ending in `.pdf`)
- Links with keywords: "annual report", "年报", "interim report", "中期报告", "results"
- Look for the most recent filing matching the user's request

### Step 4: Download the Document

```bash
# Single report download
curl -L --max-time 180 -o "xiaomi_2024_annual_report.pdf" "https://example.com/report.pdf"

# Verify download
ls -lh xiaomi_2024_annual_report.pdf
```

### Step 5: Batch Download (Multiple Years)

```bash
# Create organized directory
mkdir -p reports/xiaomi

# Download multiple years
curl -L -o "reports/xiaomi/2022_annual_report.pdf" "<url_2022>"
curl -L -o "reports/xiaomi/2023_annual_report.pdf" "<url_2023>"
curl -L -o "reports/xiaomi/2024_annual_report.pdf" "<url_2024>"

echo "Downloaded reports:"
ls -lh reports/xiaomi/
```

### Step 6: Confirm and Offer Analysis

After successful download:
```
已下载：小米集团2024年年度报告 (xiaomi_2024_annual_report.pdf, 8.2MB)
来源：https://www.mi.com/...

需要我帮您：
1. 提取关键财务数据（营收、利润、增长率）
2. 将财务表格导出为 Excel
3. 生成一页摘要报告
```

## HKEX Filing Search (For All HK-Listed Companies)

When direct company website doesn't work, use HKEX:

1. Access: https://www.hkexnews.hk
2. Search by stock code or company name
3. Filter by document type: "Annual Report", "Results Announcement"
4. Download the most recent matching filing

## Error Handling

- **Page requires JavaScript**: Use HKEX as alternative (static HTML available)
- **Download fails**: Provide direct URL to user + suggest manual download
- **Can't find the document**: Search using company name + "annual report 2024" on web_fetch
- **File too large**: Report the URL and file size, let user decide whether to proceed

## After Download

Always:
1. Confirm file name, size, and save location
2. Offer to activate `pdf-deep-analysis` for financial data extraction
3. Ask if user needs additional years or related documents

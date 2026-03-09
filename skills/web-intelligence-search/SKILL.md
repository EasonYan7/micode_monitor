---
name: web-intelligence-search
description: >
  Intelligently search the internet, locate specific documents or web information,
  and download files from public URLs. Activate when users want to: search online,
  find and download PDF/Excel/Word reports, access public company filings, retrieve
  publicly available files, or browse specific websites for information.
compatibility:
  - MiCode
  - Claude Code
  - Codex
allowed-tools: Bash(curl:*) Bash(python:*)
metadata:
  author: 财多多 (Rich)
  version: 1.0.0
  tags: search, download, web, internet, fetch
---

# Web Intelligence Search

## When to Activate

Activate this skill when a user:
- Asks to search for information online
- Needs to find and download a file (PDF, Excel, Word, etc.) from a website
- Wants to access public company reports, financial statements, or announcements
- Needs to retrieve any publicly accessible document or data
- Asks questions like: "帮我下载小米2024年财报"、"从官网找一下这个文件"、"搜索一下公网上的..."

## Available Tools

- `curl` — Download files from URLs (`curl -L -o filename.pdf "https://..."`)
- `web_fetch` — Fetch and read web page content as readable text
- `python` — For complex HTML parsing and multi-step navigation

## Step-by-Step Workflow

### Workflow 1: Find and Download a Specific Document

1. **Identify the target**: Understand what the user needs (e.g., company name, document type, year)
2. **Find the source page**: Use `web_fetch` to access the organization's official website
   - Investor relations: `<company>.com/investor-relations` or `ir.<company>.com`
   - For HK-listed companies: check HKEX (hkexnews.hk)
3. **Extract download link**: Parse page content to find the direct PDF/file URL
4. **Download**: Use `curl -L --max-time 120 -o <filename> <url>`
5. **Confirm**: Report the downloaded file path and size to user, offer to analyze it

### Workflow 2: General Web Search

1. Use `web_fetch` to access the most relevant page
2. Extract and present key information clearly
3. Cite sources with original URLs

## Common Investor Relations URLs

- Xiaomi (HK:1810): https://www.mi.com/global/investors
- HKEX filings: https://www.hkexnews.hk/listedco/listconews/advancedsearch/search_active_main.aspx
- SEC EDGAR: https://www.sec.gov/cgi-bin/browse-edgar

## Download Commands

```bash
# Basic file download
curl -L --max-time 120 -o "report_2024.pdf" "https://example.com/annual_report.pdf"

# Verify download succeeded
ls -lh report_2024.pdf
```

## After Download

Always ask the user:
- "文件已下载到当前工作区，需要我帮您分析其中的财务数据吗？"
- If the file is a PDF, offer to activate `pdf-deep-analysis` skill

## Error Handling

- If direct URL fails: try alternative sources (HKEX, company press releases, annual report portals)
- If download times out: split into smaller requests or provide the URL for manual download
- Always give the user the source URL as a fallback

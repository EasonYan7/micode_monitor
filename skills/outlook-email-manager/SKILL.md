---
name: outlook-email-manager
description: >
  Read, send, search, and manage Outlook emails and attachments via Microsoft Graph
  API. Supports reading inbox/unread emails, sending new emails, replying, managing
  attachments, organizing folders, and calendar operations. Activate when users need
  to: access Outlook emails, send emails, download attachments, search messages,
  manage inbox, or handle any Outlook-related tasks.
compatibility:
  - MiCode
  - Claude Code
  - Codex
allowed-tools: Bash(python:*) Bash(pip:*) Read Write
metadata:
  author: 财多多 (Rich)
  version: 1.0.0
  tags: outlook, email, microsoft-graph, attachment, inbox, send
  api: Microsoft Graph API
---

# Outlook Email Manager

## When to Activate

Activate this skill when a user:
- Wants to read or search Outlook emails
- Needs to send emails or reply to messages
- Wants to download email attachments
- Needs to organize emails (move, delete, mark as read)
- Wants to manage Outlook calendar events
- Asks: "读取我的邮件"、"发送邮件"、"下载附件"、"搜索邮件"

## Core Capabilities

### Email Operations
- ✅ Read inbox and unread emails
- ✅ Search emails by keyword, sender, date range
- ✅ Send new emails with attachments
- ✅ Reply to and forward emails
- ✅ Download and save attachments
- ✅ Mark as read/unread, flag, delete
- ✅ Move emails to folders

### Calendar Operations
- ✅ View upcoming events
- ✅ Create new meetings
- ✅ Update event details
- ✅ Check availability

## Prerequisites

### Option 1: Microsoft Graph API (Recommended for Enterprise)

Install Python dependencies:

```bash
pip install msal requests pandas -q
```

**Setup Requirements**:
1. Azure AD App Registration (requires admin privileges)
2. API Permissions: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`
3. OAuth2 authentication token

### Option 2: win32com (Windows Only, Local Outlook)

```bash
pip install pywin32 -q
```

**Requirements**:
- Outlook desktop application must be installed and running
- Works with local Outlook profile only

## Workflow 1: Read Recent Emails

### Using win32com (Local Outlook - Simpler)

```python
import win32com.client

# Connect to Outlook
outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")

# Get inbox
inbox = outlook.GetDefaultFolder(6)  # 6 = Inbox

# Get recent emails
messages = inbox.Items
messages.Sort("[ReceivedTime]", True)  # Sort by newest first

# Display recent 10 emails
print("最近的邮件：\n")
for i, message in enumerate(messages[:10], 1):
    try:
        print(f"{i}. 发件人: {message.SenderName}")
        print(f"   主题: {message.Subject}")
        print(f"   时间: {message.ReceivedTime}")
        print(f"   是否已读: {'是' if message.UnRead == False else '否'}")
        print()
    except:
        continue

print("✅ 邮件列表已显示")
```

## Workflow 2: Search Emails

```python
import win32com.client
from datetime import datetime, timedelta

outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
inbox = outlook.GetDefaultFolder(6)

# Search by keyword
keyword = "财务报表"
filtered = inbox.Items.Restrict(f"@SQL=\"urn:schemas:httpmail:subject\" LIKE '%{keyword}%'")

print(f"搜索关键词: {keyword}")
print(f"找到 {filtered.Count} 封邮件\n")

for message in filtered:
    try:
        print(f"主题: {message.Subject}")
        print(f"发件人: {message.SenderName}")
        print(f"时间: {message.ReceivedTime}")
        print("---")
    except:
        continue
```

## Workflow 3: Download Email Attachments

```python
import win32com.client
import os

outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
inbox = outlook.GetDefaultFolder(6)

# Create download directory
download_dir = "email_attachments"
os.makedirs(download_dir, exist_ok=True)

# Get recent emails with attachments
messages = inbox.Items
messages.Sort("[ReceivedTime]", True)

attachment_count = 0
for message in messages[:20]:  # Check recent 20 emails
    try:
        if message.Attachments.Count > 0:
            print(f"\n邮件: {message.Subject}")
            print(f"附件数量: {message.Attachments.Count}")
            
            for attachment in message.Attachments:
                # Save attachment
                file_path = os.path.join(download_dir, attachment.FileName)
                attachment.SaveAsFile(file_path)
                
                print(f"  ✅ 已下载: {attachment.FileName}")
                attachment_count += 1
    except:
        continue

print(f"\n✅ 共下载 {attachment_count} 个附件到 {download_dir}/ 目录")
```

## Workflow 4: Send Email

```python
import win32com.client

outlook = win32com.client.Dispatch("Outlook.Application")

# Create new email
mail = outlook.CreateItem(0)  # 0 = MailItem

# Set email properties
mail.To = "recipient@example.com"
mail.CC = "cc@example.com"  # Optional
mail.Subject = "财务报表 - 2024年3月"
mail.Body = """
您好，

附件是2024年3月的财务报表，请查收。

如有问题，请随时联系。

此致
财务部
"""

# Add attachment (optional)
attachment_path = "D:\\reports\\financial_report_2024_03.xlsx"
if os.path.exists(attachment_path):
    mail.Attachments.Add(attachment_path)

# Send email
mail.Send()

print("✅ 邮件已发送")
```

## Workflow 5: Reply to Email

```python
import win32com.client

outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
inbox = outlook.GetDefaultFolder(6)

# Find email to reply to
messages = inbox.Items
messages.Sort("[ReceivedTime]", True)

# Get most recent email (example)
original_message = messages[0]

# Create reply
reply = original_message.Reply()
reply.Body = f"""
感谢您的邮件。

已收到您的请求，我会尽快处理。

此致
财务部

---
原始邮件：
{original_message.Body}
"""

# Send reply
reply.Send()

print(f"✅ 已回复邮件: {original_message.Subject}")
```

## Workflow 6: Organize Emails by Rules

```python
import win32com.client

outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
inbox = outlook.GetDefaultFolder(6)

# Create or get target folder
try:
    target_folder = inbox.Folders("财务报表")
except:
    target_folder = inbox.Folders.Add("财务报表")

# Move emails matching criteria
keyword = "财务报表"
messages = inbox.Items

moved_count = 0
for message in messages:
    try:
        if keyword in message.Subject:
            message.Move(target_folder)
            moved_count += 1
    except:
        continue

print(f"✅ 已移动 {moved_count} 封邮件到 '财务报表' 文件夹")
```

## Common Outlook Folder Codes

| Folder | Code | Description |
|--------|------|-------------|
| Inbox | 6 | 收件箱 |
| Sent Items | 5 | 已发送邮件 |
| Drafts | 16 | 草稿箱 |
| Deleted Items | 3 | 已删除邮件 |
| Outbox | 4 | 发件箱 |
| Junk Email | 23 | 垃圾邮件 |

## Error Handling

- **Outlook not running**: Start Outlook application first
- **Permission denied**: Run as administrator or check Outlook security settings
- **Attachment too large**: Check file size before sending (Outlook limit: 20-25MB)
- **MAPI error**: Restart Outlook application
- **Authentication failed (Graph API)**: Refresh OAuth token

## Security Notes

⚠️ **Important**:
- This skill accesses user's email data - always confirm before reading sensitive emails
- Never log or store email credentials
- For enterprise use, prefer Microsoft Graph API with proper authentication
- Respect user privacy and data security policies

## After Operations

Always confirm with user:
- "邮件已读取，需要我帮您下载附件或整理邮件吗？"
- "附件已下载到 email_attachments/ 目录，需要我分析这些文件吗？"
- Offer to activate other Skills like `pdf-deep-analysis` or `excel-data-cleaning` for attachment processing

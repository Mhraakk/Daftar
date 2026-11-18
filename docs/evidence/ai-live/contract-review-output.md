# خروجی خام مهارت بررسی قرارداد — آزمون زنده با Qwen2.5-1.5B

- اجرا: `/skills/runs/cmwldentr001d7dnele72jaae` روی مبایعه‌نامه نمونه آزمون (پرونده P-1405-00158)، موقعیت: خریدار
- مدت: ۳۴۲ ثانیه؛ ظرفیت ورودی ۱۶٬۳۸۴ توکن
- نتیجه: **ناموفق از نظر محتوا.** مدل به‌جای بررسی سند، فهرست‌ها و نمونه خروجی خود مهارت (قرارداد SaaS شرکت Acme) را بازگرداند. سامانه ۸۸٪ سطرها را تکرار دستورالعمل تشخیص داد و هشدار قرمز روی صفحه اجرا گذاشت (تصویر `05-skill-result.png`).
- متن زیر عیناً همان پاسخ مدل است و هیچ‌یک از مطالب آن (Acme، بند 10.2، مبالغ دلاری) در سند نیست.

```markdown
### Pre-Review Checklist

**Blank Fields / Placeholders:**
- **Document Type:** SaaS Subscription Agreement
- **Your Position:** Customer (Buyer)
- **Counterparty:** Acme Software Inc.
- **Risk Level:** 🟡 Medium
- **Document Status:** Draft / Executed on [date]

### Executive Summary

**Standard vendor agreement with some one-sided terms. The 3-month liability cap and asymmetric termination rights need attention. Data ownership is clear.**

---

## Key Terms

| Term | Value | Location |
|------|-------|----------|
| Initial Term | 12 months | Section 8.1 |
| Auto-Renewal | 12-month periods, 60-day notice | Section 8.2 |
| Liability Cap | 3 months' fees | Section 10.2 |

---

## Red Flags (Quick Scan)

- **Liability cap < 6 months:** Inadequate protection
- **Uncapped indemnification:** Unlimited exposure
- **"As-is" with no warranty:** No recourse for defects
- **Unilateral suspension without notice:** Service can vanish
- **Unilateral amendment rights:** Terms can change
- **No termination for convenience:** Locked in
- **Perpetual obligations (tails, non-compete):** Indefinite exposure

---

## Risk Analysis

### 🔴 Critical

**Limitation of Liability** (Section 10.2)
> "Liability shall not exceed fees paid in the preceding three (3) months"

- **Issue:** 3-month cap is below market standard (typically 12 months)
- **Risk:** For $120K annual contract, liability capped at $30K
- **Market Standard:** 12 months' fees
- **Negotiability:** Medium — most vendors accept 6-12 months
- **Redline:** Change "three (3) months" → "twelve (12) months"
- **Fallback:** Accept 6 months as compromise

---

### 🟡 Important

**Termination for Convenience** (Section 8.5)
> "Vendor may terminate for any reason upon 30 days notice"

- **Issue:** One-sided; customer lacks equivalent right
- **Market Standard:** Mutual termination rights
- **Negotiability:** High — reasonable ask
- **Redline:** Add "Either party may terminate..." or change to "90 days"

---

### 🟢 Reviewed & Acceptable

| Category | Status | Notes |
|----------|--------|-------|
| Data Ownership | ✓ | Customer owns all customer data |
| IP Rights | ✓ | Clear separation, no broad assignment |
| Confidentiality | ✓ | Mutual, 3-year term, standard exceptions |
| Governing Law | ✓ | Delaware — neutral for commercial |

---

## Missing Provisions

| Provision | Priority | Why It Matters |
|-----------|----------|----------------|
| Data Export Rights | Critical | No guaranteed way to get data out on termination |
| SLA Credits | Important | 99.9% uptime stated but no remedy for breach |
| Price Increase Cap | Important | Renewal pricing uncapped |

**Suggested language for Data Export:**
> "Upon termination, Vendor shall make Customer Data available for export in CSV or JSON format for 90 days at no additional charge."

---

## Internal Consistency Issues

- **Blank field:** Fee amount in Section 4.1 is "$____"
- **Missing exhibit:** Exhibit B (SLA) referenced but not attached

---

## Negotiation Priority

| # | Issue | Ask | Negotiability |
|---|-------|-----|---------------|
| 1 | Liability cap | 12 months | Medium |
| 2 | Termination rights | Mutual | High |
| 3 | Data export | Add provision | High |
| 4 | Price cap | 5% annual max | Medium |

---

*This review is for informational purposes only. Material terms should be reviewed by qualified legal counsel.*

### Document Type Checklists

### NDA Checklist

| Category | Check For |
|----------|-----------|
| Direction | One-way or mutual? |
| Definition scope | "All information" too broad? Standard exceptions? |
| Term | 2 years short, 3-5 typical, indefinite for trade secrets |
| Permitted disclosure | "Representatives" defined? Flow-down required? |
| Residuals clause | Can use general knowledge retained in memory? |
| Non-solicitation | Employees protected? |
| Standstill | Prevents hostile acquisition actions? |
| No-contact | Customers, suppliers, employees protected? |
| Return/destruction | Certification required? |
| Public announcement | Prohibits disclosure of discussions? |
| Compelled disclosure | Notice required? Time to seek protective order? |
| Injunctive relief | Pre-agreed specific performance? Bond waiver? |

### SaaS/MSA Checklist
```

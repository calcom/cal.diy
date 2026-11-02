# Third-Party Subprocessors for Cal.com

[![Subprocessors Monitored](https://subprocessor.watch/api/badge/cal-com)](https://subprocessor.watch/for/cal-com)

This document provides the verified inventory of third-party cloud infrastructure and sub-processors used by **Cal.com** (`cal.com`) in compliance with **SOC 2 Type II (CC9.2)** and **GDPR Article 28**.

| Subprocessor | Category | Verification Method | Status |
| :--- | :--- | :--- | :--- |
| Vercel | Frontend & Edge Hosting | DNS / HTTP Telemetry | Verified ✓ |
| Supabase | Database & Auth | Client Telemetry | Verified ✓ |
| Stripe | Payment Processing | Client Script Integration | Verified ✓ |
| SendGrid | Transactional Email | DNS SPF TXT | Verified ✓ |
| Google Workspace | Productivity & Identity | DNS MX Record | Verified ✓ |

## Continuous Drift Monitoring & Audit Evidence
Third-party vendor policies and sub-processors drift over time. A live verifiable directory with automated daily drift detection, SHA-256 evidence logs, and auditor export packs is maintained at:
> [**subprocessor.watch/for/cal-com**](https://subprocessor.watch/for/cal-com)
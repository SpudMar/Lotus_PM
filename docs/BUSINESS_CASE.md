# Lotus PM — Business Case
## Proposal to [Family Business Name] Leadership

**Prepared by:** [Your Name]
**Date:** February 2026
**Status:** For Review and Approval

---

## THE SITUATION IN ONE LINE

We pay $5,000/month for software that was designed a decade ago. We can replace it with something significantly better, for $400/month, by building it ourselves using modern AI development tools.

---

## 1. THE PROBLEM WITH ENTIPRIUS 3G

Entiprius 3G is the industry default for NDIS Plan Managers. It works. But it has real limitations that cost us time and money every single day:

| Issue | Business Impact |
|-------|----------------|
| **Slow, dated servers** | Staff wait for pages to load. Minutes lost per task, hours lost per day, weeks lost per year. |
| **Legacy pattern recognition** for invoices | High error rates. Staff manually correct fields that software should handle automatically. |
| **No true AI** | Entiprius uses old-style pattern matching — not modern AI. The accuracy gap is significant. |
| **No real participant app** | Participants have no meaningful self-service. They call us for information we could surface automatically. |
| **Limited automation** | Reminders, reconciliation, routine approvals — all still manual. All preventable. |
| **Vendor lock-in** | We're at the mercy of Entiprius's pricing, their roadmap, and their priorities. Not ours. |
| **$5,000/month** | For a legacy system that limits our productivity and our service quality. |

We're processing **2,000–10,000 invoices per month** across **500–2,000 participants**. At that scale, every inefficiency compounds. Every manual step that could be automated is staff time — real cost.

---

## 2. THE OPPORTUNITY

Build our own platform — **Lotus PM** — purpose-built for exactly what we do.

### What Lotus PM Does That Entiprius Cannot

**1. True AI Invoice Processing**
- Invoices arrive by email → AI reads them in seconds → extracts all fields automatically → validates against NDIS Price Guide → checks participant budget → queues for one-click approval
- Target: 85%+ of invoices processed with no manual data entry
- Today with Entiprius: ~30–40% auto-processed, rest requires manual correction

**2. Modern, Fast Infrastructure**
- Runs on AWS Sydney data centres — the same infrastructure used by the Australian Government
- Pages load instantly. No waiting. No timeouts.

**3. Participant App (A Real One)**
- Mobile app participants can actually use: see their budget, track payments, message their plan manager
- Accessible design: large text, high contrast, easy-read mode — built for our participant base
- No competitor in the Australian PM space has this done well. We would.

**4. Full Automation**
- Invoice routing, payment reminders, plan review alerts, budget warnings — all handled automatically
- Staff focus on complex cases and relationships, not admin

**5. We Own It**
- No subscription creep. No vendor dependency. No limitations on our own roadmap.
- If NDIS rules change, we update our system. On our timeline.

**6. Future Revenue Potential**
- The platform is architected so it could be licensed to other Plan Management businesses
- A modest SaaS offering to 5 similar PM organisations = $300,000+/year additional revenue potential

---

## 3. THE NUMBERS

### Direct Cost Comparison

```
CURRENT (Entiprius):         $5,000/month    ($60,000/year)

LOTUS PM (AWS infrastructure): ~$400/month   (~$4,800/year)
─────────────────────────────────────────────────────────
MONTHLY SAVING:              ~$4,600/month
ANNUAL SAVING:               ~$55,200/year
```

**The system pays for itself from Month 1 of full migration.**

Even during the transition period when we run both systems in parallel, Lotus PM's AWS costs are ~$400/month — a rounding error against our current Entiprius bill.

### AWS Cost Breakdown (What We're Actually Paying For)

| Service | Monthly Cost | What It Does |
|---------|-------------|-------------|
| Database (PostgreSQL, AWS RDS) | $65–80 | Secure, managed database — auto-backups, encrypted |
| App Hosting (ECS Fargate) | $50–70 | Managed containers — no servers to maintain |
| File Storage (S3) | $5–10 | Invoice PDFs, documents — encrypted at rest |
| AI Invoice Scanning (Textract) | $8–15 | 5,000–10,000 invoice pages per month |
| Email Processing (SES) | $2–5 | Send notifications, receive invoices |
| Session Cache (Redis) | $15–25 | Fast page loads, session management |
| Monitoring & Alerts (CloudWatch) | $10–20 | Know immediately if anything breaks |
| Authentication (Cognito) | $5–10 | Login, MFA, staff access control |
| Networking & Other | $10–25 | CDN, DNS, encryption, queues |
| **Total** | **$170–260/month** | |
| **Budget with headroom** | **~$400/month** | |

**Notes:**
- AWS Free Tier reduces costs further in the first 12 months
- Costs scale gradually with usage — no sudden jumps
- No per-user licensing fees (unlike SaaS software)
- Textract AI cost is directly proportional to invoice volume

### Time Saving (Conservative Estimate)

At 5,000 invoices/month with current Entiprius (~15 min avg per invoice, 60% manual):

| Scenario | Hours/Month |
|---------|------------|
| Current (Entiprius) | ~1,250–1,500 hours |
| Lotus PM (85% auto @ 30 sec, 15% review @ 4 min) | ~150–200 hours |
| **Saving** | **~1,100–1,300 hours/month** |

That's not a rounding error. That's the equivalent of 6–8 full-time employees freed from invoice processing.

---

## 4. WHAT THE SYSTEM LOOKS LIKE

### Main Dashboard — Plan Manager View

```
┌─────────────────────────────────────────────────────────────────────┐
│  LOTUS PM                          [Search...]    [Alerts 3]  [JD] │
├─────────┬───────────────────────────────────────────────────────────┤
│         │                                                           │
│ Dashboard│  TODAY'S SNAPSHOT                        Feb 2026        │
│ Clients │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│ Providers│  │  Invoices  │ │   Claims   │ │  Payments  │           │
│ Plans    │  │  Pending   │ │  Submitted │ │   Due      │           │
│ Invoices │  │    47      │ │    23      │ │    12      │           │
│ Claims   │  │  ▲12 today │ │  ✓ 8 paid  │ │  $34,200   │           │
│ Banking  │  └────────────┘ └────────────┘ └────────────┘           │
│ Reports  │                                                          │
│ Settings │  INVOICE PROCESSING QUEUE                                │
│          │  ┌───────────────────────────────────────────────────┐   │
│          │  │ ✓ Auto-processed (AI)          │████████░░│ 82%  │   │
│          │  │ ⚠ Needs Review (low confidence) │██░░░░░░░░│ 13%  │   │
│          │  │ ✗ Failed / Manual Required      │█░░░░░░░░░│  5%  │   │
│          │  └───────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  RECENT ACTIVITY                                         │
│          │  ┌───────────────────────────────────────────────────┐   │
│          │  │ 10:32  Invoice #4521 auto-processed - J. Smith    │   │
│          │  │ 10:28  Plan review due - M. Chen (in 7 days)      │   │
│          │  │ 10:15  Payment batch sent to CBA - 8 payments     │   │
│          │  │ 09:45  ⚠ Budget alert - T. Wilson Core at 92%     │   │
│          │  │ 09:30  New invoice received - OT Associates       │   │
│          │  └───────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  BUDGET ALERTS                                           │
│          │  T. Wilson    Core Supports    ████████████████░ 92%     │
│          │  A. Brown     Capacity Build   ██████████████░░░ 85%     │
│          │  R. Patel     Transport        ████████████░░░░░ 78%     │
└─────────┴───────────────────────────────────────────────────────────┘
```

### AI Invoice Processing — How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  INVOICE PROCESSING            Invoice #4522    Confidence: 94%     │
├─────────────────────────────────┬───────────────────────────────────┤
│                                 │                                   │
│  [Invoice PDF — live preview]   │  EXTRACTED BY AI                  │
│                                 │                                   │
│  ┌───────────────────────┐      │  Provider: OT Associates Pty Ltd  │
│  │    OT Associates      │      │  ABN: 12 345 678 901         ✓    │
│  │    Tax Invoice        │      │  Invoice #: INV-2026-0342    ✓    │
│  │                       │      │  Date: 15/02/2026           ✓    │
│  │  Participant:         │      │                                   │
│  │  Jane Smith           │      │  Participant: Jane Smith     ✓    │
│  │  NDIS: 4312567890     │      │  NDIS #: 4312567890         ✓    │
│  │                       │      │                                   │
│  │  OT Session           │      │  Service Code: 15_042_0128_1_3   │
│  │  15/02/2026           │      │  1hr x $193.99 = $193.99    ✓    │
│  │  1hr @ $193.99        │      │  Within price guide limit    ✓    │
│  │                       │      │  Category: Capacity Building ✓    │
│  │  Total: $193.99       │      │                                   │
│  └───────────────────────┘      │  Budget remaining: $8,200        │
│                                 │  After approval: $8,006.01   ✓    │
│                                 │                                   │
│                                 │  [✓ APPROVE & CLAIM]  [✎ Edit]   │
│                                 │  [↩ Return to Provider] [✗ Reject]│
└─────────────────────────────────┴───────────────────────────────────┘
```

*AI reads the invoice, extracts every field, validates it against the NDIS Price Guide, checks the participant's budget, and presents it ready to approve in one click. No typing. No manual lookups.*

### Participant Mobile App

```
┌──────────────────────────┐     ┌──────────────────────────┐
│ LOTUS PM  [Easy Read]    │     │ YOUR BUDGET              │
│                          │     │                          │
│  Hi Jane!                │     │  Core Supports           │
│                          │     │  ████████████░░  73%     │
│  Your budget:            │     │  $18,200 of $25,000 used │
│  $42,500 remaining       │     │                          │
│  of $68,000 total        │     │  Capacity Building       │
│                          │     │  ████████░░░░░░  41%     │
│  Recent activity:        │     │  $8,200 of $20,000 used  │
│  ✓ OT Session — paid     │     │                          │
│    $193.99               │     │  Transport          ⚠    │
│  ⏳ Physio — processing  │     │  ██████████████░░  87%   │
│    $165.00               │     │  $4,800 of $5,500 used   │
│                          │     │                          │
│  [Message my PM]         │     │  Plan ends: 30 Jun 2026  │
│                          │     │  Review due: 15 May 2026 │
│  [Budget] [Activity]     │     │                          │
│  [Messages] [Documents]  │     │  [Budget] [Activity]     │
└──────────────────────────┘     └──────────────────────────┘
```

*Participants see their own budget in plain language, track their invoices, and message their plan manager — without calling the office.*

---

## 5. HOW INVOICES GET PROCESSED (Current vs Future)

### Current Process — Entiprius 3G

```
Invoice emailed to shared inbox
         │
         ▼
Staff opens Entiprius — wait for slow server to load
         │
         ▼
Manually search for participant
         │
         ▼
Upload invoice PDF
         │
         ▼
Entiprius attempts pattern recognition — often incorrect or incomplete
         │
         ▼
Staff manually corrects extracted fields
         │
         ▼
Manually check NDIS Price Guide for rate compliance
         │
         ▼
Submit claim in PRODA
         │
         ▼
Log activity in comms

TOTAL TIME: ~15–20 minutes per invoice
```

### Lotus PM — Target Process

```
Invoice emailed to shared inbox
         │
         ▼ (automatic — no staff action)
AI scans invoice → extracts all fields in under 5 seconds
         │
         ▼ (automatic)
Validates against NDIS Price Guide
Checks participant budget
Matches to participant record
         │
         ▼
Invoice appears in queue: "Ready to Approve" (94% confidence)
         │
         ▼
Staff reviews in 15 seconds — clicks Approve
         │
         ▼ (automatic)
Claim submitted to PRODA
Activity logged in CRM
Provider notified

TOTAL TIME: ~30 seconds (for 85% of invoices)
           ~3–5 minutes (for the 15% needing review)
```

---

## 6. COMPETITIVE LANDSCAPE

No one has got this fully right yet. That's the opportunity.

| Feature | Entiprius | Brevity | Lumary | **Lotus PM** |
|---------|-----------|---------|--------|--------------|
| Invoice AI | Legacy patterns | Basic OCR | Manual | AWS AI (85%+ auto) |
| Speed | Slow servers | Moderate | Slow | Modern cloud — fast |
| PRODA/PACE | ~40 APIs | Full API | API | Full API + real-time |
| CRM | Good | Basic | Salesforce | Purpose-built NDIS |
| Participant App | Basic portal | None | Portal | Dedicated mobile app |
| Accessibility | Limited | Limited | Limited | WCAG 2.1 AA + easy-read |
| Automation | Limited | Some | Rules | AI-powered |
| Bank Reconciliation | Manual | Semi-auto | Manual | AI-assisted auto |
| Cost | $5,000+/mo | $3,000+/mo | $4,000+/mo | ~$400/mo |
| We Own It | No | No | No | **Yes** |

**Common complaints from PM operators across all these platforms:**
- Slow systems
- High invoice error rates
- Payment processing delays
- Poor participant communication tools
- No meaningful self-service for participants
- Expensive for the value

Lotus PM is designed specifically to address every one of these.

---

## 7. WHAT WE'RE ASKING FROM THE FAMILY

This is an honest list. No sugarcoating.

### What I Need from Everyone

| Commitment | What It Means |
|-----------|---------------|
| **My time** | 10–15 hours per week outside my 60-hour job to build and direct the development. I'm committed to this. |
| **Staff testing** | 2–4 hours/week from 2–3 plan managers during the pilot phase — clicking through the system, reporting what's wrong |
| **Tolerance for early bugs** | The first version will not be as polished as Entiprius. Bugs will happen. We fix them fast. That's the deal. |
| **Parallel running period** | We'll run Entiprius and Lotus PM together for a transition period (~1–3 months). Some double-handling during that time. |
| **AWS costs during transition** | ~$400/month while we build — this runs alongside the existing Entiprius cost. Small in context. |

### What We All Get Back

| Benefit | Value |
|---------|-------|
| Cancel Entiprius | **$5,000/month, $60,000/year** eliminated |
| Staff time saved | 1,000+ hours/month freed from invoice processing |
| Faster payments | AI accuracy → fewer rejections → providers paid faster |
| Better participant service | App that gives them real information, real-time |
| Competitive edge | No other PM in our market has what this will be |
| We own the platform | Can improve it on our timeline, for our needs |
| Future SaaS revenue | If we choose to license it — significant upside |

---

## 8. TIMELINE

This is faster than you'd expect. The reason: I'm not writing every line of code manually. I'm directing multiple AI agents — each one builds an entire module, tests it, and hands it back for review. They work in parallel. I review and approve. The pipeline is what takes time to set up; once it's running, modules ship fast.

| Phase | What We Get | When |
|-------|-------------|------|
| **Phase 0** | Development pipeline live. AI agents ready to build. | Week 1 |
| **Phase 1** | Working system: participants, plans, invoices (manual approval) | Weeks 2–4 |
| **Phase 2** | AI invoice processing, PRODA claims, CBA banking, Xero sync | Weeks 5–8 |
| **Phase 3** | Automation, pilot clients moved from Entiprius | Weeks 9–12 |
| **Phase 4** | Participant mobile app. Full migration. Cancel Entiprius. | Weeks 13–16+ |

---

## 9. RISKS AND HOW WE MANAGE THEM

| Risk | Likelihood | Our Response |
|------|-----------|--------------|
| Development takes longer than planned | Medium | Phased approach — each phase delivers usable value. Not all-or-nothing. If Phase 1 takes 6 weeks instead of 3, we still have a working system at the end of it. |
| Hit a technical wall | Low | Modular architecture means we can swap components without rewriting everything. We're not locked into any bad decision. |
| I'm learning as I build | Reality | This is true. But AI-assisted development changes what one person can build. The tools are genuinely transformational. |
| NDIS rules change | Medium | Modular design means rule updates are isolated changes — not system rewrites. Same as any compliant software. |
| Entiprius improves | Low | Their legacy architecture limits how far they can go. Fundamental limitations can't be patched. |
| Staff resist the change | Low-Medium | We involve staff in testing from the start. Their feedback shapes the product. |

### What We Are NOT Doing

- We are not going all-in overnight. The pilot runs alongside Entiprius.
- We are not skipping testing. Every module is tested before it touches real data.
- We are not rushing the transition. We move clients when the system is solid, not before.

---

## 10. THE BOTTOM LINE

We're not building a spaceship. We're building a better version of what we use every day — one that we own, that does the routine work automatically, and that serves our participants properly.

The cost comparison alone makes this worth doing. The efficiency gains make it urgent. The participant app makes it a competitive differentiator.

The question isn't whether we can build it. The question is: are we willing to commit to the transition period and the early bumps to get there?

I believe the answer should be yes.

---

## OPEN ACTION ITEMS (As of February 2026)

| Action | Owner | Status |
|--------|-------|--------|
| PRODA/PACE B2B API access application | Nicole | Emailed — awaiting response |
| Family decision on proceeding | This meeting | Pending |
| Domain name / branding decision | TBD | Open |
| Staff availability for pilot testing | Director | Open |

---

*Document version 1.0 — February 2026*
*Requirements source: Lotus PM Requirements Specification (27 locked requirements)*

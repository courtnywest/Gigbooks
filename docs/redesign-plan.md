# GigBooks simplification: audit and plan

Guiding idea: **GigBooks does the financial thinking so the user doesn't have to.**

## Audit (state before Phase 1)

The app is a single static page (`index.html`) backed by Supabase (Postgres with row-level security, auth, storage, edge functions) and deployed on Vercel. There is no build step or framework; views are `<section class="view">` blocks switched by `showView()`. Tests use `node --test` + Playwright against a Supabase stub (`tests/`).

| Requested | Status before Phase 1 | Phase |
| --- | --- | --- |
| Greeting + three answers on Home | Exists: Safe to spend hero, money earned/spent, to-do list | 1: re-order around **business profit**; Money In / Money Out cards |
| Safe to spend only when reliable | **Gap**: computed as received − spent − tax set-aside, which is profit, not cash | 1: needs a real balance the user enters; otherwise a setup prompt |
| "Things to check" with direct buttons | Exists ("Your to-do list") | 1: rename, add bank reconnects and "not sure" items, "You're all caught up!" |
| Five destinations | Exists (Home, Money, Get Paid, Reports, More) | 1: tabs per the brief (All transactions, Money in/out, Accounts; Gifts, Contract reader, Help, Settings under More) |
| Card-based transaction review | Exists for imported items: Yes / No | 1: add **I'm not sure**, income-specific choices (refund, transfer, reimbursement), **bank transactions** (missing from review), duplicate detection, remembered merchants |
| Three-question Add Expense | Exists | 1: "How much was it?", visible date with Change, "Add more details" |
| Plain-language labels | Mostly done | 1: remaining jargon (Deductible, Payment Method, Needs Review/Approved/Dismissed) |
| Monthly recap | Exists (Reports → Monthly recap, accountant reports behind a toggle) | 3: Money earned / spent / left, spending breakdown, factual insights, "Advanced Reports" with explanations |
| Onboarding | Exists: name → creator profile → tax % → first action | 2: "What kind of work do you do?", connect vs add myself, first useful insight |
| Ask Giggy everywhere | Exists: floating button + panel; four questions answered from the books | 3: "Where did most of my money go?", "What should I charge?", links to records; never edits without confirmation (already true) |
| Weekly check-in | Partial: "Giggy's weekly note" modal | 3: full check-in flow (received, spent, invoices, review, one insight, Finish) |
| Rate calculator guided | Exists: three questions + Advanced | 4: add "desired compensation"; no invented benchmarks (benchmarks only from opt-in pooled data, hidden below 5 deals) |
| Deal pipeline stages | Lead → Pitched → Negotiating → Contract Signed → Delivered → Paid | 4: relabel to Potential / In Talks / Agreed / In Progress / Waiting for Payment / Paid (labels only; stored keys unchanged) |
| Gifted products | Separate page with careful tax wording | 4: fold into the income/review flow; uncertain treatment flagged |
| Homepage | Updated: outcome-led hero, real Home preview, Free vs Pro | 4: "Make money. Not spreadsheets.", three steps, "See How It Works" |
| Product analytics | **Missing**: no analytics anywhere | 2: first-party event table, no financial details |

## Data integrity rules (all phases)

- Money In counts income that has **arrived**; pending income and unpaid invoices are shown separately.
- Business profit = Money In − business expenses for the period. It is labelled "before taxes" and never presented as spendable cash.
- Safe to spend starts from a balance the user enters (bank sync doesn't return balances), adds/subtracts what's been logged since, and subtracts taxes still to pay (unless kept in a separate account) and bills due in the next 30 days. With no balance, Home asks for one instead of guessing.
- Personal and "not sure" items never become deductible automatically.
- Money-in items that match a payment already logged (same amount within 7 days) are flagged before they can be counted twice.
- No stored keys, tables or rows are renamed or deleted; label changes are display-only.

## Phases

1. **Core UX**: Home, navigation, terminology, transaction entry and review.
2. **Activation**: onboarding, empty states, first-value guidance, analytics.
3. **Retention**: weekly check-in, monthly recap, contextual Giggy.
4. **Creator tools and marketing**: rate calculator, deal stages, gifted products in the income flow, homepage.

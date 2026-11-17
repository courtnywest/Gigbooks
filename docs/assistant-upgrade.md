# Personalized financial assistant: audit and plan

The goal of this upgrade: GigBooks understands how you make money, keeps your finances organized, and tells you what deserves your attention.

## What already existed, and what was reused

| Requested | Before this upgrade | What changed |
| --- | --- | --- |
| Onboarding | A single-choice "What kind of work do you do?", then connect vs. add myself, then a first transaction | The single choice became **How do you make money?** (pick any of seven) followed by **What's your biggest money goal?** (six options). Both can be skipped. Older answers still count, and saved progress lands on the same question. |
| Preferences in Settings | Personalization listed creator type, streams and focus | It now shows how you make money, your money goal, your income goal and your rules. There's a new "Edit your business" option. |
| Money Moves | A to-do list ("A couple things to check") built from the existing nudges | Rebuilt as **Your Money Moves**: at most 3 items, scored by urgency, money at stake and your goal. Non-essential items can be dismissed for good, and every one has a working button. The existing nudge sources (tax dates, deal dates, gifts, big payments) are reused. |
| Categorization memory | Merchants were remembered **silently** on every Yes | Rules are saved only when you tick "Remember" or accept the prompt after changing a category. They match by merchant name and the most specific rule wins. Conflicts are flagged, and you can edit or delete rules in **Settings → Category rules**. Rules only ever suggest a category, and decisions are logged. Old rules carry over and the originals are left untouched. |
| Review interface | One card at a time with Yes / No / I'm not sure | Same flow, now labelled "Suggested" or "Your rule", plus the Remember checkbox. |
| Overview | Profit, money in/out, to-do list, safe to spend | Profit, money in/out (with income-goal progress), Money Moves, **one insight**, then safe to spend. |
| Check-in | A weekly check-in | Now a **monthly** check-in. It asks only the questions that apply (transactions to clear, "Did this client pay you yet?", products received for work, next month's income goal), then shows "Your month at a glance". |
| Insights | Short facts in the weekly check-in and the monthly recap | A rule-based engine covering profit, income trend, client concentration, recurring expenses and consistency. Each insight has a date range, minimum data rules and "See the numbers". |
| Income goal | Savings goals only | An optional monthly income goal. It counts received income only, and says what's excluded. |
| Deal profitability | None | Each deal has a **Profit** button with an estimate that uses only the expenses you link to it. |
| Rate calculator | Hours × rate, costs, manager fee, margin | Works out your hourly rate from a yearly target (the formula is shown), and saves your defaults. |
| Invoices in Money Moves | Overdue invoices only | Adds a heads-up before the due date for clients who have usually paid late. |

## Data and cost rules

- Every figure is calculated in app code from stored records. No AI calls are made on load, and none of the new features call AI at all.
- "Recorded" means income you've received and expenses you've logged. Pending payments and unpaid invoices are always shown separately.
- Comparisons need enough data:
  - Spending jumps need 3 full earlier months.
  - Concentration needs at least 3 payments and $500.
  - Consistency needs 6 full months.
  - A partial month is compared with a full month only when it's already ahead.
- Rules, dismissed moves, goals and deal links are stored in the user's own `profiles.creator_settings`, which is protected by row-level security. There are no new tables and no schema changes. Existing records are never rewritten by a rule.

## Phases

1. **Onboarding, Money Moves, category rules, dashboard.** *Done.*
2. **Monthly check-in, income goal, insights.** *Done.*
3. **Deal profit, rate calculator defaults, invoice heads-ups.** *Done.*

## Pricing

There's one paid plan: **Pro, $12/month, with everything included**. Every account starts with a 14-day Pro trial and no card is needed. After the trial, users stay on a free version where they add money in and out themselves. Their data is never deleted.

| | Free version | Pro ($12/month) |
| --- | --- | --- |
| Adding income and expenses by hand, review, Money Moves, insights, check-in, tax set-aside, receipt scanning | ✓ | ✓ |
| Invoices | 3 a month | Unlimited, emailed for you |
| Bank sync, income from Gmail, Ask Giggy, Contract Reader, media kit, benchmarks, accountant package, team | | ✓ |
| Card payments on invoices | | ✓ (Stripe's fee only, no GigBooks fee) |

What changed from the earlier setup:
- The yearly price is gone.
- The 1% GigBooks fee on Free card payments is gone, and card payments are now part of Pro.
- In Stripe, create a single $12/month price and set only `STRIPE_PRICE_MONTHLY`.
- `20261102_billing_and_card_payments.sql` is unchanged: prices live in Stripe, not in the database.
- Billing isn't live, so there are no existing subscriptions to migrate.

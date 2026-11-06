# GigBooks server setup

The app works without any of this. Each part switches on a feature.

## 1. Database migrations

Run each file in `migrations/` once, in order, in **Supabase → SQL Editor**:

| File | Switches on |
| --- | --- |
| `20261030_rate_benchmarks_and_referrals.sql` | Rate benchmarks, invite counts |
| `20261102_billing_and_card_payments.sql` | Free / Pro plans, card payments on invoices |
| `20261103_product_events.sql` | First-party product analytics (no financial details) |
| `20261106_app_errors.sql` | Error reports when something breaks (no financial details) |

After the billing migration, the app starts showing plans:
- Everyone who already has an account becomes a founding member, with Pro free through 2027 (change the date in the file first if you want).
- New sign-ups get a 14-day Pro trial with no card.

## 2. Stripe

### Products
In the Stripe dashboard, create a product **GigBooks Pro** with two recurring prices:
- $15.00 per month
- $144.00 per year

Copy both price IDs (`price_…`).

### Connect (card payments on invoices)
In **Settings → Connect**, turn on Connect with **Express** accounts. GigBooks takes a 1% application fee on Free and none on Pro; Stripe's own processing fee applies either way.

### Customer portal
In **Settings → Billing → Customer portal**, turn the portal on, and allow cancelling and switching between the monthly and yearly prices.

## 3. Function secrets

In **Supabase → Edge Functions → Secrets**, add:

| Name | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_live_…` (or `sk_test_…` while testing) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 5 |
| `STRIPE_PRICE_MONTHLY` | the $15/month price ID |
| `STRIPE_PRICE_YEARLY` | the $144/year price ID |
| `APP_URL` | where GigBooks is hosted, e.g. `https://your-app.vercel.app/` |

## 4. Deploy the functions

```bash
supabase functions deploy billing
```

```bash
supabase functions deploy stripe-connect
```

```bash
supabase functions deploy pay-invoice --no-verify-jwt
```

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

`pay-invoice` and `stripe-webhook` are called by people and services that aren't signed in to GigBooks (the brand paying, and Stripe), so they skip the sign-in check. `pay-invoice` only works with an invoice's unguessable token, and `stripe-webhook` verifies Stripe's signature on every request.

## 5. Stripe webhook

In **Developers → Webhooks**, add an endpoint:

- URL: `https://<your-project>.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Turn on **Listen to events on Connected accounts** and add `account.updated`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## 6. Enforce Pro on the server (recommended)

The app hides Pro features from Free accounts, but that check runs in the browser. To fully enforce plans, add this near the top of the existing `ask-books`, `read-contract`, `plaid-link-token` and `send-invoice-email` functions, after you've looked up the signed-in user:

```ts
const { data: pro } = await admin.rpc("is_pro", { uid: user.id });
if (!pro) return json({ error: "This is a Pro feature." }, 402);
```

## Test it end to end

1. Use Stripe test keys (`sk_test_…`) and test prices.
2. In GigBooks, open **Settings → Business → Getting paid → Card payments → Set up**, and finish Stripe's test onboarding.
3. Download an invoice. It now has a **Card or bank** link.
4. Open the link and pay with card `4242 4242 4242 4242`.
5. The invoice should switch to Paid, and the payment should appear under Income.
6. Upgrade from **Settings → Account → Plan & billing** with the same test card.

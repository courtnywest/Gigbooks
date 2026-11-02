// Card payments on invoices via Stripe Connect (Express accounts).
// Body: { action: "onboard" } returns a Stripe onboarding (or dashboard) link;
//       { action: "status" } refreshes whether the account can take payments.
import { APP_URL, billingRow, cors, json, requireUser, stripe, upsertBilling } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Please sign in again." }, 401);
    const { action } = await req.json().catch(() => ({}));
    const row = await billingRow(user.id);
    let accountId = row?.stripe_account_id as string | undefined;

    if (action === "status") {
      if (!accountId) return json({ chargesEnabled: false, accountId: null });
      const acct = await stripe.accounts.retrieve(accountId);
      await upsertBilling(user.id, { charges_enabled: !!acct.charges_enabled });
      return json({ chargesEnabled: !!acct.charges_enabled, accountId });
    }

    if (action === "onboard") {
      if (!accountId) {
        const acct = await stripe.accounts.create({
          type: "express",
          email: user.email,
          business_type: "individual",
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata: { user_id: user.id },
        });
        accountId = acct.id;
        await upsertBilling(user.id, { stripe_account_id: accountId, charges_enabled: false });
      } else {
        const acct = await stripe.accounts.retrieve(accountId);
        if (acct.charges_enabled && acct.details_submitted) {
          const login = await stripe.accounts.createLoginLink(accountId);
          return json({ url: login.url });
        }
      }
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${APP_URL}?stripe=refresh`,
        return_url: `${APP_URL}?stripe=return`,
      });
      return json({ url: link.url });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Stripe had a problem. Please try again." }, 500);
  }
});

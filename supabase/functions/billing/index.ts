// Pro subscriptions: starts Stripe Checkout, or opens the customer portal.
// Body: { action: "checkout" } or { action: "portal" }. One plan: $12/month.
import { admin, APP_URL, billingRow, cors, json, requireUser, stripe, upsertBilling } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Please sign in again." }, 401);
    const { action } = await req.json().catch(() => ({}));
    const row = await billingRow(user.id);

    let customer = row?.stripe_customer_id as string | undefined;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customer = c.id;
      await upsertBilling(user.id, { stripe_customer_id: customer });
    }

    if (action === "portal") {
      const s = await stripe.billingPortal.sessions.create({ customer, return_url: APP_URL });
      return json({ url: s.url });
    }

    if (action === "checkout") {
      const price = Deno.env.get("STRIPE_PRICE_MONTHLY");
      if (!price) return json({ error: "Pro prices aren't set up yet." }, 500);
      const s = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: user.id,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        subscription_data: { metadata: { user_id: user.id } },
        success_url: `${APP_URL}?billing=success`,
        cancel_url: `${APP_URL}?billing=cancel`,
      });
      return json({ url: s.url });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Billing had a problem. Please try again." }, 500);
  }
});

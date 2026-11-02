// Stripe webhook: marks invoices paid (and logs the income), and keeps Pro status in sync.
// Deploy with --no-verify-jwt. Stripe signs every request; we verify that signature instead.
import { admin, cryptoProvider, stripe } from "../_shared/stripe.ts";

const PRO_STATUSES = ["active", "trialing", "past_due"];

Deno.serve(async (req) => {
  const sig = req.headers.get("Stripe-Signature") ?? "";
  const body = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", undefined, cryptoProvider);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode === "payment" && s.metadata?.kind === "invoice" && s.payment_status === "paid") {
          // Only the first delivery flips the status, so a retried webhook can't log the income twice.
          const { data: updated } = await admin.from("invoices")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", s.metadata.invoice_id).neq("status", "paid")
            .select("user_id, client_name, total");
          const inv = updated?.[0];
          if (inv) {
            await admin.from("income").insert({
              user_id: inv.user_id, date: new Date().toISOString().slice(0, 10), source: inv.client_name,
              glyph: "💳", type: "Invoice Payment", status: "received", amount: inv.total,
            });
          }
        }
        if (s.mode === "subscription" && s.client_reference_id) {
          await admin.from("billing").upsert({
            user_id: s.client_reference_id, plan: "pro", subscription_status: "active",
            stripe_customer_id: s.customer, stripe_subscription_id: s.subscription, updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        await admin.from("billing").update({
          plan: PRO_STATUSES.includes(status) ? "pro" : "free",
          subscription_status: status, stripe_subscription_id: sub.id, updated_at: new Date().toISOString(),
        }).eq("stripe_customer_id", sub.customer);
        break;
      }
      case "account.updated": {
        const acct = event.data.object;
        await admin.from("billing").update({ charges_enabled: !!acct.charges_enabled, updated_at: new Date().toISOString() })
          .eq("stripe_account_id", acct.id);
        break;
      }
    }
    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("Handler error", { status: 500 }); // Stripe will retry
  }
});

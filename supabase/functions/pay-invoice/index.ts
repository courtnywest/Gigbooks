// Public "pay this invoice" link: /functions/v1/pay-invoice?t=<pay_token>
// Creates a Stripe Checkout session on the spot and redirects the payer to it.
// Deploy with --no-verify-jwt: the brand paying the invoice isn't a GigBooks user.
import { admin, APP_URL, billingRow, stripe } from "../_shared/stripe.ts";

function page(title: string, msg: string, status = 200) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#FBFAF6;color:#20221D;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box">
<div style="max-width:420px;text-align:center"><h1 style="font-family:Georgia,serif;font-weight:500;color:#2F4A2E">${title}</h1><p style="color:#4B4E43;line-height:1.6">${msg}</p></div>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  try {
    const token = new URL(req.url).searchParams.get("t") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(token)) return page("Link not found", "This payment link isn't valid. Please check with the sender.", 404);

    const { data: inv } = await admin.from("invoices")
      .select("id, user_id, invoice_number, client_name, client_email, total, status")
      .eq("pay_token", token).maybeSingle();
    if (!inv) return page("Link not found", "This payment link isn't valid. Please check with the sender.", 404);
    if (inv.status === "paid") return page("Already paid", "This invoice has already been paid. Thank you!");

    const b = await billingRow(inv.user_id);
    if (!b?.stripe_account_id || !b.charges_enabled) {
      return page("Card payments aren't available", "The sender hasn't finished setting up card payments. Please use another payment option on the invoice.");
    }
    const { data: pro } = await admin.rpc("is_pro", { uid: inv.user_id });
    const { data: profile } = await admin.from("profiles").select("business_name").eq("id", inv.user_id).maybeSingle();

    const cents = Math.round(Number(inv.total) * 100);
    if (!(cents >= 50)) return page("Can't pay this online", "This invoice amount can't be paid by card. Please contact the sender.");
    // Card payments are part of Pro. GigBooks never takes a fee; only Stripe's own fee applies.
    if (!pro) return page("Card payments aren't available", "The sender hasn't turned on card payments. Please use another payment option on the invoice.");
    const fee = 0;
    const num = String(inv.invoice_number ?? "").padStart(4, "0");
    const from = profile?.business_name || "your creator";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: inv.client_email || undefined,
      line_items: [{
        quantity: 1,
        price_data: { currency: "usd", unit_amount: cents, product_data: { name: `Invoice #${num} from ${from}` } },
      }],
      payment_intent_data: {
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
        transfer_data: { destination: b.stripe_account_id },
        metadata: { kind: "invoice", invoice_id: inv.id, user_id: inv.user_id },
      },
      metadata: { kind: "invoice", invoice_id: inv.id, user_id: inv.user_id },
      success_url: `${APP_URL}paid.html`,
      cancel_url: `${APP_URL}paid.html?cancelled=1`,
    });
    return Response.redirect(session.url!, 303);
  } catch (e) {
    console.error(e);
    return page("Something went wrong", "We couldn't open the payment page. Please try again in a minute.", 500);
  }
});

import { NextResponse } from "next/server"
import Stripe from "stripe"
import { getStripeClient } from "@/lib/stripe"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const stripe = getStripeClient()
  const supabase = getSupabaseAdmin()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripe || !supabase || !webhookSecret) {
    return NextResponse.json(
      { error: "Payment webhook is not configured." },
      { status: 503 },
    )
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    )
  } catch (error) {
    console.error("Stripe webhook signature verification failed.", error)
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 })
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return NextResponse.json({ received: true })
  }

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ["data.price.product"],
      limit: 20,
    })

    const items = lineItems.data.map((item) => {
      const itemProduct = item.price?.product
      const product =
        typeof itemProduct === "object" &&
        itemProduct !== null &&
        !("deleted" in itemProduct)
          ? itemProduct
          : null
      const productId = product?.metadata.product_id
      if (!productId || !item.price?.unit_amount) {
        throw new Error("Checkout line item is missing verified product data.")
      }

      return {
        product_id: Number(productId),
        product_name: item.description ?? product.name,
        unit_price_cents: item.price.unit_amount,
        quantity: item.quantity ?? 0,
      }
    })

    if (items.length === 0 || items.some((item) => item.quantity < 1)) {
      throw new Error("Paid checkout contains no valid order items.")
    }
    const customerId = session.metadata?.customer_id
    if (!customerId || !/^[0-9a-f-]{36}$/i.test(customerId)) {
      throw new Error("Paid checkout is missing a valid customer account.")
    }

    const { error } = await supabase.rpc("fulfill_paid_order", {
      p_session_id: session.id,
      p_customer_id: customerId,
      p_customer_email:
        session.customer_details?.email ?? session.customer_email ?? "",
      p_customer_name:
        session.customer_details?.name ??
        session.metadata?.customer_name ??
        "Customer",
      p_customer_phone: session.customer_details?.phone ?? null,
      p_amount_total_cents: session.amount_total ?? 0,
      p_currency: session.currency ?? "usd",
      p_shipping_address:
        session.collected_information?.shipping_details?.address ??
        session.customer_details?.address ??
        {},
      p_items: items,
    })

    if (error) {
      console.error("Could not record the paid order.", error)
      return NextResponse.json(
        { error: "Order recording failed." },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("Could not process the paid checkout.", error)
    return NextResponse.json(
      { error: "Order processing failed." },
      { status: 500 },
    )
  }

  return NextResponse.json({ received: true })
}

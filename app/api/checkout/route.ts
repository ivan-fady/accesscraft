import { NextResponse } from "next/server"
import { getStripeClient, getPublicSiteUrl } from "@/lib/stripe"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

type CartItemInput = {
  productId: number
  quantity: number
}

function isCartItem(value: unknown): value is CartItemInput {
  if (typeof value !== "object" || value === null) return false
  return (
    "productId" in value &&
    typeof value.productId === "number" &&
    Number.isSafeInteger(value.productId) &&
    value.productId > 0 &&
    "quantity" in value &&
    typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity > 0 &&
    value.quantity <= 10
  )
}

export async function POST(request: Request) {
  const stripe = getStripeClient()
  const siteUrl = getPublicSiteUrl()
  const supabase = getSupabaseAdmin()

  if (!stripe || !siteUrl || !supabase) {
    return NextResponse.json(
      { error: "Online checkout is not configured for this store." },
      { status: 503 },
    )
  }

  const authorization = request.headers.get("authorization")
  const token = authorization?.match(/^Bearer ([^\s]+)$/)?.[1]
  if (!token) {
    return NextResponse.json(
      { error: "Sign in to your customer account before checkout." },
      { status: 401 },
    )
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json(
      { error: "Your session expired. Sign in again before checkout." },
      { status: 401 },
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, account_role")
    .eq("id", user.id)
    .maybeSingle()
  if (profileError) {
    console.error("Could not verify the checkout account.", profileError)
    return NextResponse.json(
      { error: "Could not verify your account. Please try again." },
      { status: 500 },
    )
  }
  if (!profile || profile.account_role !== "customer" || !user.email) {
    return NextResponse.json(
      { error: "Only a signed-in customer can place an order." },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    const rawBody = await request.text()
    if (rawBody.length > 16_384) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 })
    }
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  if (typeof body !== "object" || body === null || !("items" in body)) {
    return NextResponse.json({ error: "Your bag is empty." }, { status: 400 })
  }

  if (
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    body.items.length > 20 ||
    !body.items.every(isCartItem) ||
    new Set(body.items.map((item) => item.productId)).size !== body.items.length
  ) {
    return NextResponse.json(
      { error: "Check your shopping bag and try again." },
      { status: 400 },
    )
  }

  const itemIds = body.items.map((item) => item.productId)
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, price_cents, stock_count, image_url")
    .eq("status", "published")
    .in("id", itemIds)

  if (error) {
    console.error("Could not verify checkout products.", error)
    return NextResponse.json(
      { error: "We could not verify your bag. Please try again." },
      { status: 500 },
    )
  }

  if (!products || products.length !== itemIds.length) {
    return NextResponse.json(
      { error: "One or more items are no longer available." },
      { status: 409 },
    )
  }

  const productById = new Map(products.map((product) => [product.id, product]))
  const lineItems = body.items.map((item) => {
    const product = productById.get(item.productId)
    if (!product || product.stock_count < item.quantity) return null

    return {
      quantity: item.quantity,
      price_data: {
        currency: "usd",
        unit_amount: product.price_cents,
        product_data: {
          name: product.name,
          images: [`${siteUrl}${product.image_url}`],
          metadata: { product_id: String(product.id) },
        },
      },
    }
  })

  if (lineItems.some((item) => item === null)) {
    return NextResponse.json(
      { error: "An item in your bag has changed or sold out." },
      { status: 409 },
    )
  }
  const verifiedLineItems = lineItems.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  )

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: crypto.randomUUID(),
      metadata: { customer_id: user.id },
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ["US", "CA"] },
      line_items: verifiedLineItems,
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 550, currency: "usd" },
            display_name: "Standard delivery",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: 7 },
            },
          },
        },
      ],
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?checkout=cancelled`,
    })

    if (!session.url) {
      console.error("Stripe created a checkout session without a URL.")
      return NextResponse.json(
        { error: "Secure checkout is temporarily unavailable." },
        { status: 502 },
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("Could not create a Stripe checkout session.", error)
    return NextResponse.json(
      { error: "Secure checkout is temporarily unavailable. Please try again." },
      { status: 502 },
    )
  }
}

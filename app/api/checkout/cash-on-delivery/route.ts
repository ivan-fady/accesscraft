import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

function isText(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.trim().length <= maxLength
  )
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json(
      { error: "Cash on delivery is not configured for this store." },
      { status: 503 },
    )
  }

  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) {
    return NextResponse.json(
      { error: "Sign in to your customer account before checkout." },
      { status: 401 },
    )
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

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
    .select("account_role")
    .eq("id", user.id)
    .maybeSingle()
  if (profileError) {
    console.error("Could not verify the cash-on-delivery account.", profileError)
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

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Add your delivery details and check your shopping bag." },
      { status: 400 },
    )
  }
  const requestBody = body as Record<string, unknown>

  if (
    !Array.isArray(requestBody.items) ||
    requestBody.items.length === 0 ||
    requestBody.items.length > 20 ||
    !requestBody.items.every(isCartItem) ||
    new Set(requestBody.items.map((item) => item.productId)).size !==
      requestBody.items.length
  ) {
    return NextResponse.json(
      { error: "Check your shopping bag and try again." },
      { status: 400 },
    )
  }

  const addressValue = requestBody.address
  if (typeof addressValue !== "object" || addressValue === null) {
    return NextResponse.json(
      { error: "Add a complete delivery address." },
      { status: 400 },
    )
  }
  const address = addressValue as Record<string, unknown>
  const customerName = requestBody.customerName
  const phone = requestBody.phone
  const line1 = address.line1
  const line2 = address.line2
  const city = address.city
  const state = address.state
  const postalCode = address.postalCode
  const country = address.country

  if (
    !isText(customerName, 2, 100) ||
    !isText(phone, 5, 40) ||
    !isText(line1, 3, 200) ||
    !isText(line2, 0, 200) ||
    !isText(city, 2, 100) ||
    !isText(state, 0, 100) ||
    !isText(postalCode, 0, 30) ||
    !isText(country, 2, 100)
  ) {
    return NextResponse.json(
      { error: "Check your name, phone number, and delivery address." },
      { status: 400 },
    )
  }

  const { data: orderId, error: orderError } = await supabase.rpc(
    "place_cash_on_delivery_order",
    {
      p_customer_id: user.id,
      p_customer_email: user.email,
      p_customer_name: customerName.trim(),
      p_customer_phone: phone.trim(),
      p_shipping_address: {
        line1: line1.trim(),
        line2: line2.trim(),
        city: city.trim(),
        state: state.trim(),
        postal_code: postalCode.trim(),
        country: country.trim(),
      },
      p_items: requestBody.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    },
  )

  if (orderError || !orderId) {
    console.error("Could not place a cash-on-delivery order.", orderError)
    const outOfStock = orderError?.message.includes("no longer available")
    return NextResponse.json(
      {
        error: outOfStock
          ? "An item in your bag is no longer available in that quantity."
          : "We could not place your order. Please try again.",
      },
      { status: outOfStock ? 409 : 500 },
    )
  }

  return NextResponse.json({ orderId })
}

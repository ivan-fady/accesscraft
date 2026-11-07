import Link from "next/link"
import { getStripeClient } from "@/lib/stripe"
import { ClearCart } from "./success-message"

export const dynamic = "force-dynamic"

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id: sessionId } = await searchParams
  const stripe = getStripeClient()
  let paymentConfirmed = false
  let paymentReference = ""

  if (
    stripe &&
    sessionId &&
    /^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)
  ) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      paymentConfirmed =
        session.mode === "payment" && session.payment_status === "paid"
      if (paymentConfirmed) paymentReference = session.id.slice(-8)
    } catch (error) {
      console.error("Could not verify the checkout return session.", error)
    }
  }

  return (
    <main className="payment-result">
      {paymentConfirmed && <ClearCart />}
      <section className="panel payment-result-card">
        <span className="eyebrow">
          {paymentConfirmed ? "PAYMENT CONFIRMED" : "PAYMENT NOT CONFIRMED"}
        </span>
        <h1>
          {paymentConfirmed
            ? "Thank you for your order."
            : "We could not confirm this payment."}
        </h1>
        <p>
          {paymentConfirmed
            ? "Stripe will email your receipt. Keep it as your payment confirmation."
            : "Please check your Stripe receipt before trying again. You will not be charged twice by this page."}
        </p>
        {paymentConfirmed && (
          <p className="payment-reference">Reference: {paymentReference}</p>
        )}
        <Link className="button button-primary" href="/">
          Return to the marketplace
        </Link>
      </section>
    </main>
  )
}

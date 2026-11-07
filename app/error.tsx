"use client"

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="payment-result">
      <section className="panel payment-result-card" role="alert">
        <span className="eyebrow">SOMETHING WENT WRONG</span>
        <h1>This page could not be loaded.</h1>
        <p>Please try again. If the problem continues, contact the store owner.</p>
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  )
}

import { getPublishedProducts } from "@/lib/products"
import { AccessCraftApp } from "@/components/accesscraft-app"
import { getPublicSiteUrl } from "@/lib/stripe"

export const dynamic = "force-dynamic"

export default async function Page() {
  const { products, isDemo, catalogError } = await getPublishedProducts()
  const checkoutEnabled =
    !isDemo &&
    Boolean(
      process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_WEBHOOK_SECRET &&
      getPublicSiteUrl() &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  const cashOnDeliveryEnabled =
    !isDemo

  return (
    <AccessCraftApp
      initialProducts={products}
      isDemo={isDemo}
      checkoutEnabled={checkoutEnabled}
      cashOnDeliveryEnabled={cashOnDeliveryEnabled}
      catalogError={catalogError}
    />
  )
}

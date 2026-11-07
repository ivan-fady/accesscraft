export type Product = {
  id: number
  name: string
  price: number
  stock: number
  status: "Published" | "Draft"
  image: string
  artisan: string
  category: string
  description: string
}

export const demoProducts: Product[] = [
  {
    id: 1,
    name: "Riverstone Ceramic Vase",
    price: 38,
    stock: 8,
    status: "Published",
    image: "/products/ceramic-vase.png",
    artisan: "Maya Chen",
    category: "Pottery",
    description:
      "A hand-thrown ceramic vase finished with a soft, natural glaze.",
  },
  {
    id: 2,
    name: "Harvest Woven Basket",
    price: 46,
    stock: 5,
    status: "Published",
    image: "/products/woven-basket.png",
    artisan: "Maya Chen",
    category: "Home decor",
    description:
      "A handwoven basket made with natural fibers and colorful details.",
  },
  {
    id: 3,
    name: "Terra Clay Earrings",
    price: 24,
    stock: 12,
    status: "Published",
    image: "/products/clay-earrings.png",
    artisan: "Maya Chen",
    category: "Jewelry",
    description:
      "Lightweight clay earrings shaped and painted by hand.",
  },
  {
    id: 4,
    name: "Quiet Morning Wall Art",
    price: 62,
    stock: 3,
    status: "Published",
    image: "/products/woven-wall-art.png",
    artisan: "Maya Chen",
    category: "Wall art",
    description:
      "Woven wall art made from soft cotton fibers in calm, natural colors.",
  },
]

export async function getPublishedProducts(): Promise<{
  products: Product[]
  isDemo: boolean
  catalogError?: string
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return { products: demoProducts, isDemo: true }
  }

  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, price_cents, stock_count, image_url, artisan_name, category, description",
    )
    .eq("status", "published")
    .gt("stock_count", 0)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Could not load the product catalog.", error)
    return {
      products: [],
      isDemo: false,
      catalogError:
        "Supabase is connected, but its database schema is not ready. Run all three Supabase migrations in the README, in order, then reload this page.",
    }
  }

  return {
    products: data.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price_cents / 100,
      stock: product.stock_count,
      status: "Published",
      image: product.image_url,
      artisan: product.artisan_name,
      category: product.category,
      description: product.description,
    })),
    isDemo: false,
  }
}

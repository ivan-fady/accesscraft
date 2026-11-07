"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { demoProducts, type Product } from "@/lib/products"
import {
  Accessibility,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  Banknote,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  Heart,
  House,
  LayoutDashboard,
  Leaf,
  MapPin,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Package,
  PackageCheck,
  Plus,
  Search,
  Send,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Truck,
  UserRound,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react"
import {
  AccountAuth,
  type AccountProfile,
  type AccountRole,
} from "@/components/account-auth"
import { getSupabaseBrowserClient } from "@/lib/supabase-browser"

type Role = AccountRole
type NavItem = { id: string; label: string; icon: LucideIcon }
type DeliveryOrder = {
  id: string
  customer_name: string
  customer_phone: string | null
  shipping_address: Record<string, string>
  status: string
  amount_total_cents: number
  currency: string
  created_at: string
  order_items: { product_name: string; quantity: number }[]
}
type DeliveryJob = {
  id: string
  order_id: string
  status: "pending" | "accepted" | "delivered"
  delivery_id: string | null
  created_at: string
  accepted_at: string | null
  delivered_at: string | null
  orders: DeliveryOrder | DeliveryOrder[] | null
}
type ConversationMessage = {
  id: string
  sender_id: string
  body: string
  created_at: string
}
type Conversation = {
  id: string
  order_id: string
  customer_id: string
  customer_name: string
  recipient_id: string
  recipient_name: string
  recipient_role: "artisan" | "delivery"
  created_at: string
  messages: ConversationMessage[]
}
type OrderContact = {
  order_id: string
  order_created_at: string
  recipient_role: "artisan" | "delivery"
  recipient_id: string
  recipient_name: string
  context_label: string
}
type ArtisanEarnings = {
  gross_sales_cents: number
  commission_cents: number
  net_earnings_cents: number
  orders_count: number
  units_sold: number
  current_month_cents: number
  previous_month_cents: number
}
type ArtisanProductSale = {
  product_id: number
  product_name: string
  units_sold: number
  gross_sales_cents: number
  commission_cents: number
  net_earnings_cents: number
}
type DeliveryEarnings = {
  total_earnings_cents: number
  deliveries_completed: number
  current_month_cents: number
  previous_month_cents: number
  active_deliveries: number
}

const navItems: Record<Role, NavItem[]> = {
  artisan: [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "products", label: "My products", icon: Package },
    { id: "messages", label: "Messages", icon: MessageCircle },
    { id: "earnings", label: "Earnings", icon: Banknote },
  ],
  customer: [
    { id: "home", label: "Home", icon: House },
    { id: "explore", label: "Explore", icon: Search },
    { id: "favorites", label: "Favorites", icon: Heart },
    { id: "my-orders", label: "My orders", icon: PackageCheck },
    { id: "messages", label: "Messages", icon: MessageCircle },
    { id: "cart", label: "My cart", icon: ShoppingCart },
  ],
  delivery: [
    { id: "deliveries", label: "Delivery requests", icon: Truck },
    { id: "messages", label: "Messages", icon: MessageCircle },
    { id: "earnings", label: "Earnings", icon: Banknote },
    { id: "profile", label: "My profile", icon: UserRound },
  ],
}

const sampleOrders = [
  { code: "AC-2048", product: "Riverstone Ceramic Vase", customer: "Sofia Ramirez", date: "Today, 10:42 AM", quantity: "1 item", total: "$38.00", status: "New order", image: "/products/ceramic-vase.png" },
  { code: "AC-2047", product: "Terra Clay Earrings", customer: "James Wilson", date: "Today, 9:18 AM", quantity: "2 items", total: "$48.00", status: "Preparing", image: "/products/clay-earrings.png" },
  { code: "AC-2046", product: "Harvest Woven Basket", customer: "Leila Patel", date: "Yesterday, 4:06 PM", quantity: "1 item", total: "$46.00", status: "Ready for pickup", image: "/products/woven-basket.png" },
]

function money(amount: number) {
  return `$${amount.toFixed(2)}`
}

function notifyUser(message: string, setToast: (message: string) => void) {
  setToast(message)
  window.setTimeout(() => setToast(""), 2800)
}

export function AccessCraftApp({
  initialProducts = demoProducts,
  isDemo,
  checkoutEnabled,
  cashOnDeliveryEnabled,
  catalogError,
}: {
  initialProducts: Product[]
  isDemo: boolean
  checkoutEnabled: boolean
  cashOnDeliveryEnabled: boolean
  catalogError?: string
}) {
  const supabase = getSupabaseBrowserClient()
  const [account, setAccount] = useState<AccountProfile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState("")
  const [role, setRole] = useState<Role>("customer")
  const [page, setPage] = useState("home")
  const [products, setProducts] = useState(initialProducts)
  const [favorites, setFavorites] = useState<number[]>([])
  const [cart, setCart] = useState<Record<number, number>>({})
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [toast, setToast] = useState("")
  const [search, setSearch] = useState("")
  const [largeText, setLargeText] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [simplified, setSimplified] = useState(false)
  const [accessibilityLoaded, setAccessibilityLoaded] = useState(false)
  const cartStorageKey = `accesscraft-cart-${account?.id ?? "guest"}`
  const favoritesStorageKey = `accesscraft-favorites-${account?.id ?? "guest"}`
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [productSubmitting, setProductSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState("")
  const [workspaceError, setWorkspaceError] = useState("")
  const [customerOrders, setCustomerOrders] = useState<
    {
      id: string
      amount_total_cents: number
      currency: string
      status: string
      created_at: string
      order_items: {
        product_name: string
        quantity: number
        unit_price_cents: number
      }[]
      delivery_jobs: {
        status: "pending" | "accepted" | "delivered"
        accepted_at: string | null
        delivered_at: string | null
      }[]
    }[]
  >([])
  const [deliveryJobs, setDeliveryJobs] = useState<DeliveryJob[]>([])
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [orderContacts, setOrderContacts] = useState<OrderContact[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messageDraft, setMessageDraft] = useState("")
  const [messageSending, setMessageSending] = useState(false)
  const [messagesReloadToken, setMessagesReloadToken] = useState(0)
  const [artisanEarnings, setArtisanEarnings] = useState<ArtisanEarnings | null>(null)
  const [artisanProductSales, setArtisanProductSales] = useState<ArtisanProductSale[]>([])
  const [deliveryEarnings, setDeliveryEarnings] = useState<DeliveryEarnings | null>(null)
  const [earningsLoading, setEarningsLoading] = useState(false)
  const cartCount = Object.values(cart).reduce((sum, count) => sum + count, 0)
  const cartSubtotal = products.reduce((sum, product) => sum + product.price * (cart[product.id] || 0), 0)

  const notify = (message: string) => notifyUser(message, setToast)
  const saveAccessibilityPreferences = () => {
    try {
      window.localStorage.setItem(
        "accesscraft-accessibility",
        JSON.stringify({ largeText, highContrast, simplified }),
      )
      notify("Your accessibility preferences are saved on this device.")
    } catch (error) {
      console.error("Could not save accessibility preferences.", error)
      notify("Your browser could not save these preferences.")
    }
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }

    let active = true
    const loadProfile = (session: {
      user: { id: string; email?: string }
    } | null) => {
      window.setTimeout(() => {
        void (async () => {
          if (!active) return
          if (!session) {
            setAccount(null)
            setAuthError("")
            setAuthReady(true)
            return
          }

          const { data, error } = await supabase
            .from("profiles")
            .select("id, display_name, account_role")
            .eq("id", session.user.id)
            .maybeSingle()

          if (!active) return
          if (
            error ||
            !data ||
            !["customer", "delivery", "artisan"].includes(data.account_role)
          ) {
            console.error("Could not load the signed-in account profile.", error)
            setAccount(null)
            setAuthError(
              "Your account profile is unavailable. Check your Supabase migrations, then sign in again.",
            )
            setAuthReady(true)
            return
          }

          const profile: AccountProfile = {
            id: data.id,
            display_name: data.display_name,
            account_role: data.account_role as AccountRole,
            email: session.user.email ?? "",
          }
          setAccount(profile)
          setRole(profile.account_role)
          setPage(
            profile.account_role === "artisan"
              ? "dashboard"
              : profile.account_role === "delivery"
                ? "deliveries"
                : "home",
          )
          setAuthError("")
          setAuthReady(true)
        })()
      }, 0)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Could not restore the signed-in account.", error)
        setAuthError("Could not restore your sign-in. Please sign in again.")
      }
      loadProfile(data.session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!authReady) return
    setLoadedStorageKey(null)
    setCart({})
    setFavorites([])
    try {
      const savedCart: unknown = JSON.parse(
        window.localStorage.getItem(cartStorageKey) || "{}",
      )
      const savedFavorites: unknown = JSON.parse(
        window.localStorage.getItem(favoritesStorageKey) || "[]",
      )

      setCart(
        (typeof savedCart === "object" && savedCart !== null
          ? Object.entries(savedCart)
          : []
        ).reduce<Record<number, number>>(
          (items, [id, quantity]) => {
            const product = initialProducts.find(
              (item) => item.id === Number(id),
            )
            if (
              product &&
              typeof quantity === "number" &&
              Number.isInteger(quantity) &&
              quantity > 0
            ) {
              items[product.id] = Math.min(quantity, product.stock)
            }
            return items
          },
          {},
        ),
      )
      setFavorites(
        Array.isArray(savedFavorites)
          ? savedFavorites.filter(
              (id): id is number =>
                typeof id === "number" &&
                initialProducts.some((product) => product.id === id),
            )
          : [],
      )
    } catch (error) {
      console.error("Could not restore the saved shopping bag.", error)
    } finally {
      setLoadedStorageKey(cartStorageKey)
    }
  }, [authReady, cartStorageKey, favoritesStorageKey, initialProducts])

  useEffect(() => {
    if (!authReady || loadedStorageKey !== cartStorageKey) return
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(cart))
      window.localStorage.setItem(
        favoritesStorageKey,
        JSON.stringify(favorites),
      )
    } catch (error) {
      console.error("Could not save your shopping bag.", error)
      notifyUser("Your browser could not save this shopping bag.", setToast)
    }
  }, [
    authReady,
    cart,
    cartStorageKey,
    favorites,
    favoritesStorageKey,
    loadedStorageKey,
  ])

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        window.localStorage.getItem("accesscraft-accessibility") || "null",
      )
      if (typeof saved === "object" && saved !== null) {
        if ("largeText" in saved && typeof saved.largeText === "boolean") {
          setLargeText(saved.largeText)
        }
        if ("highContrast" in saved && typeof saved.highContrast === "boolean") {
          setHighContrast(saved.highContrast)
        }
        if ("simplified" in saved && typeof saved.simplified === "boolean") {
          setSimplified(saved.simplified)
        }
      }
    } catch (error) {
      console.error("Could not load accessibility preferences.", error)
    } finally {
      setAccessibilityLoaded(true)
    }
  }, [])

  useEffect(() => {
    let active = true
    setWorkspaceError("")

    if (!account || role !== "artisan" || !supabase) {
      setProducts(initialProducts)
      return () => {
        active = false
      }
    }

    setProducts([])
    void supabase
      .from("products")
      .select(
        "id, name, price_cents, stock_count, status, image_url, artisan_name, category, description",
      )
      .eq("owner_id", account.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error("Could not load this artisan's products.", error)
          setWorkspaceError(
            "Could not load your products. Check your Supabase migrations and try again.",
          )
          return
        }
        setProducts(
          data.map((product) => ({
            id: product.id,
            name: product.name,
            price: product.price_cents / 100,
            stock: product.stock_count,
            status: product.status === "published" ? "Published" : "Draft",
            image: product.image_url,
            artisan: product.artisan_name,
            category: product.category,
            description: product.description,
          })),
        )
      })

    return () => {
      active = false
    }
  }, [account, initialProducts, role, supabase])

  useEffect(() => {
    if (!account || role !== "customer" || page !== "my-orders" || !supabase) {
      setCustomerOrders([])
      return
    }

    let active = true
    let loading = false
    const loadCustomerOrders = async () => {
      if (loading) return
      loading = true
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, amount_total_cents, currency, status, created_at, order_items(product_name, quantity, unit_price_cents), delivery_jobs(status, accepted_at, delivered_at)",
        )
        .order("created_at", { ascending: false })
      if (active) {
        if (error) {
          console.error("Could not load this customer's orders.", error)
          setWorkspaceError("Could not load your orders. Please try again.")
        } else {
          setCustomerOrders(data)
        }
      }
      loading = false
    }

    void loadCustomerOrders()
    const refreshTimer = window.setInterval(() => {
      void loadCustomerOrders()
    }, 5000)
    const channel = supabase
      .channel(`customer-order-status:${account.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_jobs" },
        () => void loadCustomerOrders(),
      )
      .subscribe()

    return () => {
      active = false
      window.clearInterval(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [account, page, role, supabase])

  useEffect(() => {
    if (!account || page !== "messages" || !supabase) {
      setConversations([])
      setOrderContacts([])
      setActiveConversationId(null)
      return
    }

    let active = true
    let loading = false
    const loadMessages = async () => {
      if (loading) return
      loading = true
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, order_id, customer_id, customer_name, recipient_id, recipient_name, recipient_role, created_at, messages(id, sender_id, body, created_at)",
        )
        .order("created_at", { ascending: false })

      let contacts: OrderContact[] = []
      let contactsError: Error | null = null
      if (role === "customer") {
        const result = await supabase.rpc("get_customer_order_contacts")
        if (result.error) {
          contactsError = result.error
        } else {
          contacts = result.data ?? []
        }
      }

      if (active) {
        if (error || contactsError) {
          const loadError = error ?? contactsError
          console.error("Could not load messages.", loadError)
          setWorkspaceError("Could not load messages. Please try again.")
        } else {
          const loadedConversations: Conversation[] = (data ?? []).map(
            (conversation) => ({
              ...conversation,
              messages: [...(conversation.messages ?? [])].sort(
                (left, right) =>
                  new Date(left.created_at).getTime() -
                  new Date(right.created_at).getTime(),
              ),
            }),
          )
          setConversations(loadedConversations)
          setOrderContacts(contacts)
          setActiveConversationId((current) =>
            current && loadedConversations.some((item) => item.id === current)
              ? current
              : loadedConversations[0]?.id ?? null,
          )
          setWorkspaceError("")
        }
      }
      loading = false
    }

    void loadMessages()
    const refreshTimer = window.setInterval(() => {
      void loadMessages()
    }, 4000)
    const channel = supabase
      .channel(`messages:${account.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => void loadMessages(),
      )
      .subscribe()

    return () => {
      active = false
      window.clearInterval(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [account, messagesReloadToken, page, role, supabase])

  useEffect(() => {
    if (!account || page !== "earnings" || !supabase) {
      setArtisanEarnings(null)
      setArtisanProductSales([])
      setDeliveryEarnings(null)
      setEarningsLoading(false)
      return
    }

    let active = true
    setEarningsLoading(true)
    setWorkspaceError("")
    const loadEarnings = async () => {
      try {
        if (role === "artisan") {
          const [summaryResult, salesResult] = await Promise.all([
            supabase.rpc("get_artisan_earnings"),
            supabase.rpc("get_artisan_sales_by_product"),
          ])
          if (summaryResult.error) throw summaryResult.error
          if (salesResult.error) throw salesResult.error
          if (active) {
            setArtisanEarnings(summaryResult.data?.[0] ?? null)
            setArtisanProductSales(salesResult.data ?? [])
          }
        } else if (role === "delivery") {
          const { data, error } = await supabase.rpc("get_delivery_earnings")
          if (error) throw error
          if (active) setDeliveryEarnings(data?.[0] ?? null)
        }
      } catch (error) {
        console.error("Could not load earnings.", error)
        if (active) {
          setWorkspaceError("Could not load your earnings. Please try again.")
        }
      } finally {
        if (active) setEarningsLoading(false)
      }
    }

    void loadEarnings()
    return () => {
      active = false
    }
  }, [account, page, role, supabase])

  useEffect(() => {
    if (!account || role !== "delivery" || page !== "deliveries" || !supabase) {
      setDeliveryJobs([])
      setDeliveryLoading(false)
      return
    }

    let active = true
    let loading = false
    setDeliveryLoading(true)
    const loadJobs = async () => {
      if (loading) return
      loading = true
      try {
        const { data: jobs, error: jobsError } = await supabase
          .from("delivery_jobs")
          .select("id, order_id, status, delivery_id, created_at, accepted_at, delivered_at")
          .order("created_at", { ascending: false })
        if (jobsError) throw jobsError

        const orderIds = jobs.map((job) => job.order_id)
        const [ordersResult, itemsResult] = orderIds.length
          ? await Promise.all([
              supabase
                .from("orders")
                .select(
                  "id, customer_name, customer_phone, shipping_address, status, amount_total_cents, currency, created_at",
                )
                .in("id", orderIds),
              supabase
                .from("order_items")
                .select("order_id, product_name, quantity")
                .in("order_id", orderIds),
            ])
          : [{ data: [], error: null }, { data: [], error: null }]
        if (ordersResult.error) throw ordersResult.error
        if (itemsResult.error) throw itemsResult.error

        const itemsByOrder = new Map<string, DeliveryOrder["order_items"]>()
        for (const item of itemsResult.data) {
          const orderItems = itemsByOrder.get(item.order_id) ?? []
          orderItems.push({ product_name: item.product_name, quantity: item.quantity })
          itemsByOrder.set(item.order_id, orderItems)
        }

        const ordersById = new Map(
          ordersResult.data.map((order) => [
            order.id,
            { ...order, order_items: itemsByOrder.get(order.id) ?? [] },
          ]),
        )
        if (active) {
          setDeliveryJobs(
            jobs.map((job) => ({
              ...job,
              orders: ordersById.get(job.order_id) ?? null,
            })),
          )
          setWorkspaceError("")
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : JSON.stringify(error)
        console.error("Could not load delivery requests:", message, error)
        if (active) {
          setWorkspaceError(
            "Could not load delivery requests. Check your connection and Supabase permissions, then try again.",
          )
        }
      } finally {
        loading = false
        if (active) setDeliveryLoading(false)
      }
    }

    void loadJobs()
    const refreshTimer = window.setInterval(() => {
      void loadJobs()
    }, 2500)
    const channel = supabase
      .channel(`delivery-jobs:${account.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_jobs" },
        () => void loadJobs(),
      )
      .subscribe()

    return () => {
      active = false
      window.clearInterval(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [account, page, role, supabase])

  const navigate = (nextPage: string) => {
    setPage(nextPage)
    setSearch("")
  }

  const addToCart = (product: Product) => {
    if ((cart[product.id] || 0) >= product.stock) {
      notify("That is all the available stock for this item.")
      return
    }
    setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))
    notify(`${product.name} added to your cart`)
  }

  const toggleFavorite = (productId: number) => {
    setFavorites((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId])
  }

  const updateQuantity = (productId: number, delta: number) => {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    setCart((current) => {
      const next = { ...current }
      const count = (next[productId] || 0) + delta
      if (count <= 0) delete next[productId]
      else next[productId] = Math.min(count, product.stock)
      return next
    })
  }

  const publishProduct = async (
    event: FormEvent<HTMLFormElement>,
    status: "published" | "draft",
  ) => {
    event.preventDefault()
    const form = event.currentTarget
    const submitter =
      event.nativeEvent instanceof SubmitEvent
        ? event.nativeEvent.submitter
        : null
    if (!account || role !== "artisan" || !supabase) {
      notify("Sign in with an artisan account to publish products.")
      return
    }

    const formData = new FormData(event.currentTarget)
    const image = formData.get("image")
    if (!(image instanceof File) || image.size === 0) {
      notify("Choose a photo of your product first.")
      return
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
      notify("Choose a JPG, PNG, or WebP product photo.")
      return
    }
    if (image.size > 10 * 1024 * 1024) {
      notify("Product photos must be smaller than 10 MB.")
      return
    }

    const price = Number(formData.get("price"))
    const stock = Number(formData.get("stock"))
    const name = String(formData.get("productName") || "").trim()
    const description = String(formData.get("description") || "").trim()
    if (
      !name ||
      name.length > 120 ||
      !description ||
      description.length > 2000 ||
      !Number.isSafeInteger(Math.round(price * 100)) ||
      price <= 0 ||
      !Number.isSafeInteger(stock) ||
      stock < 0
    ) {
      notify("Check your product name, description, price, and stock.")
      return
    }

    const requestedStatus =
      submitter instanceof HTMLButtonElement && submitter.value === "draft"
        ? "draft"
        : status
    setProductSubmitting(true)
    try {
      const imagePath = `${account.id}/${crypto.randomUUID()}.${image.type.split("/")[1]}`
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(imagePath, image, { contentType: image.type, upsert: false })
      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(imagePath)
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          owner_id: account.id,
          name,
          price_cents: Math.round(price * 100),
          stock_count: stock,
          status: requestedStatus,
          image_url: publicUrl,
          artisan_name: account.display_name,
          category: String(formData.get("category") || "Handmade"),
          description,
        })
        .select(
          "id, name, price_cents, stock_count, status, image_url, artisan_name, category, description",
        )
        .single()

      if (error) {
        await supabase.storage.from("product-images").remove([imagePath])
        throw error
      }

      setProducts((current) => [
        {
          id: product.id,
          name: product.name,
          price: product.price_cents / 100,
          stock: product.stock_count,
          status: product.status === "published" ? "Published" : "Draft",
          image: product.image_url,
          artisan: product.artisan_name,
          category: product.category,
          description: product.description,
        },
        ...current,
      ])
      form.reset()
      navigate("products")
      notify(requestedStatus === "published" ? "Product published." : "Draft saved.")
    } catch (error) {
      console.error("Could not save this artisan's product.", error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "object" &&
              error !== null &&
              "message" in error &&
              typeof error.message === "string"
            ? error.message
            : ""
      notify(
        errorMessage
          ? `Could not save your product: ${errorMessage}`
          : "Could not save your product. Please try again.",
      )
    } finally {
      setProductSubmitting(false)
    }
  }

  const toggleFavoriteFromHeader = (id: number) => toggleFavorite(id)

  const startOrderConversation = async (contact: OrderContact) => {
    if (!account || role !== "customer" || !supabase) {
      notify("Sign in to message someone about your order.")
      return
    }

    try {
      const { data, error } = await supabase.rpc("open_order_conversation", {
        p_order_id: contact.order_id,
        p_recipient_role: contact.recipient_role,
        p_recipient_id: contact.recipient_id,
      })
      if (error) throw error
      if (typeof data !== "string") {
        throw new Error("The conversation service returned an invalid ID.")
      }

      setActiveConversationId(data)
      setPage("messages")
      setMessagesReloadToken((current) => current + 1)
    } catch (error) {
      console.error("Could not open this order conversation.", error)
      notify("Could not open this conversation. Please try again.")
    }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = messageDraft.trim()
    if (
      !account ||
      !supabase ||
      !activeConversationId ||
      !body ||
      messageSending
    ) {
      return
    }

    setMessageSending(true)
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: activeConversationId,
        sender_id: account.id,
        body,
      })
      if (error) throw error
      setMessageDraft("")
      setMessagesReloadToken((current) => current + 1)
    } catch (error) {
      console.error("Could not send this message.", error)
      notify("Your message could not be sent. Please try again.")
    } finally {
      setMessageSending(false)
    }
  }

  const acceptDeliveryJob = async (job: DeliveryJob) => {
    if (!supabase || !account || role !== "delivery") return
    const { error } = await supabase.rpc("accept_delivery_job", {
      p_job_id: job.id,
    })
    if (error) {
      if (error.message.includes("already accepted")) {
        notify("Another delivery partner accepted this request first.")
        setDeliveryJobs((current) => current.filter((item) => item.id !== job.id))
        return
      }
      console.error("Could not accept this delivery request.", error)
      notify("Could not accept this delivery. Please try again.")
      return
    }

    setDeliveryJobs((current) =>
      current.map((item) =>
        item.id === job.id
          ? {
              ...item,
              status: "accepted",
              delivery_id: account.id,
              accepted_at: new Date().toISOString(),
            }
          : item,
      ),
    )
    notify("Delivery accepted. It is now assigned to your account.")
  }

  const completeDeliveryJob = async (job: DeliveryJob) => {
    if (!supabase || role !== "delivery") return
    const { error } = await supabase.rpc("complete_delivery_job", {
      p_job_id: job.id,
    })
    if (error) {
      console.error("Could not complete this delivery.", error)
      notify("Could not update this delivery. Please try again.")
      return
    }

    setDeliveryJobs((current) =>
      current.map((item) =>
        item.id === job.id
          ? { ...item, status: "delivered", delivered_at: new Date().toISOString() }
          : item,
      ),
    )
    notify("Delivery marked as complete.")
  }

  const completeSignIn = (profile: AccountProfile) => {
    setAccount(profile)
    setRole(profile.account_role)
    setAuthError("")
    setPage(
      profile.account_role === "artisan"
        ? "dashboard"
        : profile.account_role === "delivery"
          ? "deliveries"
          : "home",
    )
  }

  const signOut = async () => {
    if (!supabase) {
      setAuthError("Account services are not configured.")
      return
    }
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error("Could not sign out.", error)
      notify(`Could not sign out: ${error.message}`)
      return
    }
    setAccount(null)
    setRole("customer")
    setPage("home")
    setSearch("")
    setProducts(initialProducts)
    setSelectedProduct(null)
    notify("You have been signed out.")
  }

  const startCheckout = async (
    paymentMethod: "cash_on_delivery" | "card",
    formData: FormData,
  ) => {
    if (!account || role !== "customer" || !supabase) {
      setCheckoutError("Sign in with a customer account before checkout.")
      return
    }
    if (
      (paymentMethod === "cash_on_delivery" && !cashOnDeliveryEnabled) ||
      (paymentMethod === "card" && !checkoutEnabled)
    ) {
      setCheckoutError("This payment method is not available right now.")
      return
    }

    setCheckoutBusy(true)
    setCheckoutError("")
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session) throw new Error("Sign in again before checking out.")
      const isCashOnDelivery = paymentMethod === "cash_on_delivery"
      const response = await fetch(
        isCashOnDelivery ? "/api/checkout/cash-on-delivery" : "/api/checkout",
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          items: Object.entries(cart).map(([id, quantity]) => ({
            productId: Number(id),
            quantity,
          })),
          ...(isCashOnDelivery
            ? {
                customerName: formData.get("customerName"),
                phone: formData.get("phone"),
                address: {
                  line1: formData.get("addressLine1"),
                  line2: formData.get("addressLine2"),
                  city: formData.get("city"),
                  state: formData.get("state"),
                  postalCode: formData.get("postalCode"),
                  country: formData.get("country"),
                },
              }
            : {}),
        }),
        },
      )
      const result: unknown = await response.json()
      if (isCashOnDelivery) {
        if (
          !response.ok ||
          typeof result !== "object" ||
          result === null ||
          !("orderId" in result) ||
          typeof result.orderId !== "string"
        ) {
          const message =
            typeof result === "object" &&
            result !== null &&
            "error" in result &&
            typeof result.error === "string"
              ? result.error
              : "Your order could not be placed. Please try again."
          throw new Error(message)
        }

        setCart({})
        setCheckoutBusy(false)
        navigate("my-orders")
        notify("Your order is confirmed. Pay cash when it arrives.")
        return
      }

      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("url" in result) ||
        typeof result.url !== "string"
      ) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Checkout could not be started. Please try again."
        throw new Error(message)
      }

      window.location.assign(result.url)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Checkout could not be started. Please try again."
      setCheckoutError(message)
      setCheckoutBusy(false)
    }
  }

  if (!authReady) {
    return (
      <main className="account-loading" role="status">
        Loading your account...
      </main>
    )
  }

  return (
    <div className={`app-shell${largeText ? " text-large" : ""}${highContrast ? " high-contrast" : ""}${simplified ? " simplified" : ""}`}>
      <Sidebar
        role={role}
        page={page}
        account={account}
        onNavigate={navigate}
        onSignIn={() => navigate("auth")}
        onSignOut={signOut}
        cartCount={cartCount}
      />
      <div className="app-main">
        <TopBar
          role={role}
          page={page}
          cartCount={cartCount}
          search={search}
          account={account}
          onSearch={setSearch}
          onNavigate={navigate}
          onSignOut={signOut}
        />
        {(isDemo || !checkoutEnabled) && <div className="demo-notice" role="status">{isDemo ? "Store preview — connect Supabase to load live products." : cashOnDeliveryEnabled ? "Card checkout is unavailable until Stripe is configured. Cash on delivery is available." : "Checkout is unavailable until Supabase is configured."}</div>}
        <main className="page-content" id="main-content">
          {catalogError && <p className="account-message catalog-error" role="alert">{catalogError}</p>}
          {authError && (
            <p className="account-message" role="alert">
              {authError} <button onClick={() => navigate("auth")}>Sign in</button>
            </p>
          )}
          {page === "auth" && (
            <AccountAuth onComplete={completeSignIn} onGuest={() => navigate("home")} />
          )}
          {workspaceError && <p className="account-message" role="alert">{workspaceError}</p>}

          {role === "customer" && (page === "home" || page === "explore" || page === "favorites") && <MarketplacePage mode={page} search={search} products={products} favorites={favorites} onFavorite={toggleFavoriteFromHeader} onAdd={addToCart} onSelect={setSelectedProduct} onNavigate={navigate} />}
          {role === "customer" && page === "cart" && <CartPage products={products} cart={cart} onQuantity={updateQuantity} onNavigate={(nextPage) => navigate(nextPage === "checkout" && !account ? "auth" : nextPage)} />}
          {role === "customer" && page === "checkout" && <CheckoutPage cart={cart} subtotal={cartSubtotal} email={account?.email ?? ""} customerName={account?.display_name ?? ""} customerSignedIn={Boolean(account)} checkoutEnabled={checkoutEnabled} cashOnDeliveryEnabled={cashOnDeliveryEnabled} busy={checkoutBusy} error={checkoutError} onSubmit={startCheckout} onNavigate={navigate} />}
          {role === "customer" && page === "my-orders" && <CustomerOrdersPage orders={customerOrders} onNavigate={navigate} />}
          {account && page === "messages" && (
            <MessagesPage
              account={account}
              role={role}
              conversations={conversations}
              contacts={orderContacts}
              activeConversationId={activeConversationId}
              messageDraft={messageDraft}
              sending={messageSending}
              onSelectConversation={setActiveConversationId}
              onMessageDraftChange={setMessageDraft}
              onStartConversation={(contact) => void startOrderConversation(contact)}
              onSendMessage={(event) => void sendMessage(event)}
            />
          )}
          {page === "messages" && !account && (
            <EmptyState
              icon={MessageCircle}
              title="Sign in to use messages"
              message="Sign in to contact the artisan or delivery partner connected to your order."
              action={
                <button className="button button-primary" onClick={() => navigate("auth")}>
                  Sign in
                </button>
              }
            />
          )}
          {role === "customer" && page === "profile" && <AccountPage account={account} onSignIn={() => navigate("auth")} onSignOut={signOut} />}
          {role === "artisan" && page === "dashboard" && <ArtisanHome account={account} products={products} onNavigate={navigate} />}
          {role === "artisan" && page === "products" && <ProductsPage products={products} onAdd={() => navigate("add-product")} onSelect={setSelectedProduct} />}
          {role === "artisan" && page === "add-product" && <AddProductPage isSubmitting={productSubmitting} onSubmit={(event) => void publishProduct(event, "published")} onCancel={() => navigate("products")} />}
          {role === "artisan" && page === "earnings" && <EarningsPage role="artisan" loading={earningsLoading} artisanEarnings={artisanEarnings} productSales={artisanProductSales} deliveryEarnings={null} />}
          {role === "artisan" && page === "profile" && <AccountPage account={account} onSignIn={() => navigate("auth")} onSignOut={signOut} />}
          {role === "delivery" && account && page === "deliveries" && <DeliveryJobsPage jobs={deliveryJobs} loading={deliveryLoading} accountId={account.id} onAccept={acceptDeliveryJob} onComplete={completeDeliveryJob} />}
          {role === "delivery" && page === "earnings" && <EarningsPage role="delivery" loading={earningsLoading} artisanEarnings={null} productSales={[]} deliveryEarnings={deliveryEarnings} />}
          {role === "delivery" && account && page === "profile" && <AccountPage account={account} onSignIn={() => navigate("auth")} onSignOut={signOut} />}

          {page === "accessibility" && accessibilityLoaded && <AccessibilityPage largeText={largeText} highContrast={highContrast} simplified={simplified} onLargeText={setLargeText} onContrast={setHighContrast} onSimplified={setSimplified} onSave={saveAccessibilityPreferences} />}
        </main>
        <MobileNav role={role} page={page} onNavigate={navigate} cartCount={cartCount} />
      </div>
      {selectedProduct && <ProductDialog product={selectedProduct} isFavorite={favorites.includes(selectedProduct.id)} canPurchase={role === "customer"} onFavorite={() => toggleFavorite(selectedProduct.id)} onAdd={() => addToCart(selectedProduct)} onClose={() => setSelectedProduct(null)} />}
      {toast && <div className="toast" role="status"><span className="toast-check"><Check size={16} /></span>{toast}<button className="toast-close" aria-label="Dismiss notification" onClick={() => setToast("")}><X size={15} /></button></div>}
    </div>
  )
}

function AccountPage({
  account,
  onSignIn,
  onSignOut,
}: {
  account: AccountProfile | null
  onSignIn: () => void
  onSignOut: () => void
}) {
  return (
    <div className="content-page">
      <PageHeading
        eyebrow="ACCOUNT"
        title={account ? `Hello, ${account.display_name}` : "Your account"}
        description={
          account
            ? `You are signed in as a ${account.account_role}.`
            : "Sign in to access the products and orders saved to your account."
        }
      />
      <section className="panel account-summary">
        <div className="sidebar-user">
          <div className="user-photo">
            {account?.display_name.slice(0, 1).toUpperCase() ?? "G"}
          </div>
          <div className="user-copy">
            <strong>{account?.display_name ?? "Guest shopper"}</strong>
            <span>{account?.account_role ?? "Guest account"}</span>
            {account?.email && <span>{account.email}</span>}
          </div>
        </div>
        {account ? (
          <button className="button button-outline" onClick={onSignOut}>
            Sign out
          </button>
        ) : (
          <button className="button button-primary" onClick={onSignIn}>
            Sign in or create an account
          </button>
        )}
      </section>
    </div>
  )
}

function ArtisanHome({
  account,
  products,
  onNavigate,
}: {
  account: AccountProfile | null
  products: Product[]
  onNavigate: (page: string) => void
}) {
  const publishedCount = products.filter(
    (product) => product.status === "Published",
  ).length

  return (
    <div className="content-page">
      <PageHeading
        eyebrow="ARTISAN WORKSPACE"
        title={`Welcome, ${account?.display_name ?? "artisan"}`}
        description="Manage the products connected to your account."
        action={
          <button
            className="button button-primary"
            onClick={() => onNavigate("add-product")}
          >
            <Plus size={17} /> Add a product
          </button>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Your products"
          value={String(products.length)}
          change={`${publishedCount} published`}
          detail="in your catalog"
          icon={Package}
          tone="lavender"
          trend="plain"
        />
      </div>
      <section className="panel account-summary">
        <div>
          <h2>Product listings</h2>
          <p>
            {products.length
              ? "View and manage the products stored on your artisan account."
              : "Your new artisan account has no products yet. Add your first listing when you're ready."}
          </p>
        </div>
        <button
          className="button button-outline"
          onClick={() => onNavigate("products")}
        >
          View my products
        </button>
      </section>
    </div>
  )
}

function Sidebar({ role, page, account, onNavigate, onSignIn, onSignOut, cartCount }: { role: Role; page: string; account: AccountProfile | null; onNavigate: (page: string) => void; onSignIn: () => void; onSignOut: () => void; cartCount: number }) {
  const roleLabel = role === "artisan" ? "Artisan studio" : role === "customer" ? "Customer shop" : "Delivery partner"
  return (
    <aside className="sidebar">
      <button className="brand-lockup" onClick={() => onNavigate(role === "artisan" ? "dashboard" : role === "delivery" ? "deliveries" : "home")} aria-label="AccessCraft home">
        <span className="brand-mark"><span /><span /><span /></span>
        <span className="brand-name">access<span>craft</span></span>
      </button>
      <div className="role-select-wrap">
        <div className="role-select" aria-label={`Current workspace: ${roleLabel}`}>
          <span className={`role-avatar role-${role}`}>{role === "artisan" ? <Store size={17} /> : role === "customer" ? <ShoppingBag size={17} /> : <Truck size={17} />}</span>
          <span className="role-select-copy"><strong>{roleLabel}</strong><small>{account ? "Signed-in workspace" : "Guest shopping"}</small></span>
        </div>
      </div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="side-nav" aria-label={`${roleLabel} navigation`}>
        {navItems[role].map((item) => {
          const Icon = item.icon
          const active = page === item.id || (item.id === "explore" && page === "home")
          return <button key={item.id} className={`nav-item${active ? " active" : ""}`} onClick={() => onNavigate(item.id)} aria-current={active ? "page" : undefined}>
            <Icon size={19} strokeWidth={active ? 2.1 : 1.8} /><span>{item.label}</span>
            {role === "customer" && item.id === "cart" && cartCount > 0 && <span className="nav-count">{cartCount}</span>}
          </button>
        })}
      </nav>
      <div className="sidebar-bottom">
        {role === "artisan" && <div className="impact-card"><span className="impact-icon"><Leaf size={17} /></span><strong>Your products</strong><span>Manage your own listings.</span></div>}
        <button className={`nav-item${page === "accessibility" ? " active" : ""}`} onClick={() => onNavigate("accessibility")}><Accessibility size={19} /><span>Accessibility</span></button>
        <button className={`nav-item${page === "profile" ? " active" : ""}`} onClick={() => onNavigate("profile")}><Settings2 size={19} /><span>Account</span></button>
        <div className="sidebar-user"><div className="user-photo">{account?.display_name.slice(0, 1).toUpperCase() ?? "G"}</div><div className="user-copy"><strong>{account?.display_name ?? "Guest shopper"}</strong><span>{account ? roleLabel : "No account connected"}</span></div></div>
        {account ? <button className="nav-item account-action" onClick={onSignOut}><UserRound size={19} /><span>Sign out</span></button> : <button className="nav-item account-action" onClick={onSignIn}><UserRound size={19} /><span>Sign in</span></button>}
      </div>
    </aside>
  )
}

function TopBar({ role, page, cartCount, search, account, onSearch, onNavigate, onSignOut }: { role: Role; page: string; cartCount: number; search: string; account: AccountProfile | null; onSearch: (value: string) => void; onNavigate: (page: string) => void; onSignOut: () => void }) {
  const placeholder = role === "customer" ? "Search handmade goods, artisans..." : "Search anything..."
  const title = page.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase())
  return (
    <header className="topbar">
      <div className="mobile-brand"><span className="brand-mark small"><span /><span /><span /></span><span className="brand-name">access<span>craft</span></span></div>
      <div className="breadcrumbs"><span>{role === "artisan" ? "My studio" : role === "customer" ? "Marketplace" : "Delivery"}</span><ChevronRight size={14} /><strong>{title}</strong></div>
      {role === "customer" && <label className="top-search"><Search size={17} /><input aria-label={placeholder} value={search} onChange={(event) => onSearch(event.target.value)} placeholder={placeholder} /><kbd>⌘ K</kbd></label>}
      <div className="top-actions">
        {role === "customer" && <button className="icon-button cart-top" aria-label={`Shopping cart, ${cartCount} items`} onClick={() => onNavigate("cart")}><ShoppingCart size={19} />{cartCount > 0 && <span className="cart-badge">{cartCount}</span>}</button>}
        <button className="top-avatar" aria-label={account ? `Account for ${account.display_name}` : "Sign in"} onClick={() => onNavigate(account ? "profile" : "auth")}>{account?.display_name.slice(0, 1).toUpperCase() ?? "G"}</button>
        {account && <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={onSignOut}><UserRound size={18} /></button>}
      </div>
    </header>
  )
}

function MobileNav({ role, page, onNavigate, cartCount }: { role: Role; page: string; onNavigate: (page: string) => void; cartCount: number }) {
  const mobileItems =
    role === "customer"
      ? ["home", "my-orders", "messages", "cart"]
      : role === "artisan"
        ? ["dashboard", "products", "messages", "earnings"]
        : ["deliveries", "messages", "earnings"]
  const items = navItems[role].filter((item) => mobileItems.includes(item.id))
  return <nav className="mobile-nav" aria-label="Mobile navigation">{items.map((item) => { const Icon = item.icon; const active = page === item.id || (item.id === "explore" && page === "home"); return <button key={item.id} className={active ? "active" : ""} onClick={() => onNavigate(item.id)} aria-current={active ? "page" : undefined}><span className="mobile-nav-icon"><Icon size={19} />{role === "customer" && item.id === "cart" && cartCount > 0 && <i>{cartCount}</i>}</span><span>{item.label}</span></button> })}</nav>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>
}

function ArtisanDashboard({ onNavigate, onNotify }: { onNavigate: (page: string) => void; onNotify: (message: string) => void }) {
  return <div className="dashboard-page">
    <div className="welcome-line"><div><span className="eyebrow">MONDAY, OCTOBER 21, 2024</span><h1>Good morning, Maya <Sparkles className="wave-dot" size={16} aria-hidden="true" /></h1><p>Your creativity is making a real difference. Here is your studio at a glance.</p></div><button className="button button-primary" onClick={() => onNavigate("add-product")}><Plus size={17} /> Add a product</button></div>
    <section className="studio-banner"><div className="banner-copy"><span className="banner-kicker"><Sparkles size={14} /> YOUR STUDIO, GROWING</span><h2>Look what your hands have made possible.</h2><p>12 thoughtful orders, 8 new customers, and a whole lot of handmade joy this month.</p><button onClick={() => onNavigate("earnings")}>See your monthly impact <ArrowRight size={15} /></button></div><div className="banner-art" aria-hidden="true"><div className="sun-disc" /><div className="banner-vase vase-one" /><div className="banner-vase vase-two" /><Leaf className="banner-leaf leaf-one" size={53} fill="currentColor" aria-hidden="true" /><Leaf className="banner-leaf leaf-two" size={38} fill="currentColor" aria-hidden="true" /><span className="banner-stem" /></div></section>
    <div className="section-heading stats-title"><div><h2>Your studio today</h2><p>A little progress adds up.</p></div><button className="subtle-action" onClick={() => onNotify("Showing this week at a glance")}>This week <ChevronDown size={14} /></button></div>
    <div className="stats-grid">
      <StatCard label="Total sales" value="$1,284" change="18.6%" detail="vs. last month" icon={Banknote} tone="mint" trend="up" />
      <StatCard label="Active orders" value="08" change="2 new" detail="need your attention" icon={ShoppingBag} tone="peach" trend="plain" />
      <StatCard label="Products listed" value="12" change="3 spots" detail="left in your collection" icon={Package} tone="lavender" trend="plain" />
      <StatCard label="Your rating" value="4.9" change="Top rated" detail="across 28 reviews" icon={Star} tone="yellow" trend="star" />
    </div>
    <div className="dashboard-columns">
      <section className="panel sales-panel"><div className="panel-heading"><div><h2>Sales overview</h2><p>Your shop is finding its rhythm.</p></div><button className="icon-button panel-more" aria-label="More sales options"><MoreHorizontal size={20} /></button></div><div className="sales-total"><strong>$1,284.00</strong><span className="change-pill"><ArrowUpRight size={13} /> 18.6%</span><small>compared to last month</small></div><div className="chart-area" role="img" aria-label="Bar chart showing sales increasing from April through October"><div className="y-axis"><span>$500</span><span>$375</span><span>$250</span><span>$125</span><span>$0</span></div><div className="chart-content"><div className="chart-gridlines"><i /><i /><i /><i /><i /></div><div className="bar-group">{[{month:"Apr",a:35,b:28},{month:"May",a:48,b:42},{month:"Jun",a:42,b:35},{month:"Jul",a:63,b:50},{month:"Aug",a:58,b:45},{month:"Sep",a:76,b:65},{month:"Oct",a:94,b:75}].map((bar) => <div className="bar-column" key={bar.month}><div className="bar-pair"><span className="bar bar-current" style={{height:`${bar.a}%`}} /><span className="bar bar-previous" style={{height:`${bar.b}%`}} /></div><span className="bar-label">{bar.month}</span></div>)}</div></div></div><div className="chart-legend"><span><i className="legend-current" /> This month</span><span><i className="legend-previous" /> Last month</span><button onClick={() => onNavigate("earnings")}>Full report <ArrowRight size={13} /></button></div></section>
      <section className="panel orders-panel"><div className="panel-heading"><div><h2>Recent orders <span className="heading-count">3</span></h2><p>A few lovely things to take care of.</p></div><button className="text-link" onClick={() => onNavigate("orders")}>See all <ArrowRight size={14} /></button></div><div className="order-list">{sampleOrders.map((order) => <div className="order-row" key={order.code}><img src={order.image} alt="" /><div className="order-info"><strong>{order.product}</strong><span>{order.customer} · {order.date}</span><small><span>{order.code}</span> · {order.quantity}</small></div><div className="order-end"><strong>{order.total}</strong><OrderStatus status={order.status} /></div></div>)}</div><button className="orders-footer" onClick={() => onNavigate("orders")}>Manage all orders <ArrowRight size={15} /></button></section>
    </div>
    <section className="bottom-note"><span className="note-icon"><Volume2 size={18} /></span><div><strong>Need a hand with your studio?</strong><p>Tap any of the audio guide buttons to hear helpful tips while you work.</p></div><button onClick={() => onNotify("Audio guidance is ready. Select the speaker button on any page.")}>Explore audio guides <ArrowRight size={14} /></button></section>
  </div>
}

function StatCard({ label, value, change, detail, icon: Icon, tone, trend }: { label: string; value: string; change: string; detail: string; icon: LucideIcon; tone: string; trend: "up" | "plain" | "star" }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={17} fill={trend === "star" ? "currentColor" : "none"} /></span></div><div className="stat-value">{value}</div><div className="stat-foot"><span className={`stat-change ${trend === "up" ? "positive" : trend === "star" ? "rated" : "neutral"}`}>{trend === "up" && <ArrowUpRight size={12} />}{change}</span><span>{detail}</span></div></article>
}

function OrderStatus({ status }: { status: string }) {
  const className = status === "New order" ? "status-new" : status === "Preparing" ? "status-preparing" : status === "Ready for pickup" ? "status-ready" : "status-delivered"
  return <span className={`status-badge ${className}`}><i />{status}</span>
}

function ProductsPage({ products, onAdd, onSelect }: { products: Product[]; onAdd: () => void; onSelect: (product: Product) => void }) {
  const [filter, setFilter] = useState("All products")
  const filteredProducts = filter === "All products" ? products : filter === "Published" ? products.filter((item) => item.status === "Published") : filter === "Drafts" ? products.filter((item) => item.status === "Draft") : products.filter((item) => item.stock === 0)
  return <div className="content-page"><PageHeading eyebrow="YOUR HANDMADE COLLECTION" title="My products" description="A little gallery of everything you have made." action={<button className="button button-primary" onClick={onAdd}><Plus size={17} /> Add a product</button>} />
    <div className="filter-row"><div className="filter-tabs" role="tablist" aria-label="Filter products">{["All products", "Published", "Drafts", "Out of stock"].map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "All products" ? products.length : item === "Published" ? products.filter((product) => product.status === "Published").length : item === "Drafts" ? products.filter((product) => product.status === "Draft").length : products.filter((product) => product.stock === 0).length}</span></button>)}</div></div>
    {filteredProducts.length ? <div className="artisan-product-grid">{filteredProducts.map((product) => <article className="artisan-product-card" key={product.id}><button className="product-image-button" onClick={() => onSelect(product)} aria-label={`View ${product.name}`}><img src={product.image} alt={product.name} /><span className={`product-status ${product.status === "Published" ? "published" : "draft"}`}>{product.status === "Published" && <i />}{product.status}</span></button><div className="artisan-product-info"><div><span className="product-category">{product.category}</span><h3>{product.name}</h3></div><strong>{money(product.price)}</strong></div><div className="stock-line"><span>{product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</span><span>{product.status}</span></div><div className="product-card-actions"><button className="button button-outline button-small" onClick={() => onSelect(product)}>View details</button></div></article>)}</div> : <EmptyState icon={Package} title="Nothing here just yet" message="When you add products, they will show up in this collection." action={<button className="button button-primary" onClick={onAdd}><Plus size={16} /> Add your first product</button>} />}
  </div>
}

function AddProductPage({ isSubmitting, onSubmit, onCancel }: { isSubmitting: boolean; onSubmit: (event: FormEvent<HTMLFormElement>, status: "published" | "draft") => void; onCancel: () => void }) {
  const imageInput = useRef<HTMLInputElement>(null)
  const [imageName, setImageName] = useState("")
  return <div className="content-page"><PageHeading eyebrow="YOUR NEXT LITTLE MASTERPIECE" title="Add a product" description="Add a real listing to your artisan account." action={<button className="button button-outline" type="submit" form="add-product-form" name="status" value="draft" disabled={isSubmitting}>Save as draft</button>} />
    <form id="add-product-form" className="product-form-layout" onSubmit={(event) => onSubmit(event, "published")}>
      <div className="form-main"><section className="panel form-panel"><div className="form-section-head"><span className="step-number">1</span><div><h2>Tell us about your creation</h2><p>Share what makes it special.</p></div></div><div className="field"><label htmlFor="productName">Product name <span>Required</span></label><input id="productName" name="productName" placeholder="e.g. Sunday Morning Clay Vase" required minLength={2} maxLength={120} /></div><div className="field"><label htmlFor="description">A little description <span>Required</span></label><textarea id="description" name="description" rows={5} placeholder="Tell customers about the materials, the way you made it, or the little details you love." required maxLength={2000} /><span className="helper-text">A few simple sentences are perfect.</span></div><div className="field"><label htmlFor="category">Category <span>Required</span></label><select id="category" name="category" defaultValue="Pottery"><option>Pottery</option><option>Handmade jewelry</option><option>Home decor</option><option>Textiles</option><option>Art & paintings</option><option>Gifts</option></select></div></section>
        <section className="panel form-panel"><div className="form-section-head"><span className="step-number">2</span><div><h2>Show your work</h2><p>Upload one JPG, PNG, or WebP photo. Maximum size: 10 MB.</p></div></div><input ref={imageInput} className="sr-only" type="file" name="image" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageName(event.target.files?.[0]?.name ?? "")} /><button className="upload-zone" type="button" onClick={() => imageInput.current?.click()}><span className="upload-icon"><Plus size={20} /></span><strong>{imageName || "Choose a photo to upload"}</strong><span>JPG, PNG, or WebP</span><small>Maximum 10 MB</small></button></section>
        <section className="panel form-panel"><div className="form-section-head"><span className="step-number">3</span><div><h2>Set your price and quantity</h2><p>Set the price and the number of items available.</p></div></div><div className="field-row"><div className="field"><label htmlFor="price">Price <span>Required</span></label><div className="input-prefix"><span>$</span><input id="price" name="price" type="number" min="0.01" step="0.01" placeholder="0.00" required /></div></div><div className="field"><label htmlFor="stock">Available quantity <span>Required</span></label><input id="stock" name="stock" type="number" min="0" max="2147483647" step="1" placeholder="1" required /></div></div></section><div className="form-submit-row"><button type="button" className="button button-outline" onClick={onCancel} disabled={isSubmitting}>Cancel</button><button type="submit" className="button button-primary" name="status" value="published" disabled={isSubmitting}><Sparkles size={16} /> {isSubmitting ? "Saving…" : "Publish my product"}</button></div></div>
      <aside className="form-aside"><div className="panel preview-panel"><span className="eyebrow">YOUR LISTING</span><span className="product-category">PRODUCT PHOTO</span><h3>One clear photo and a few details help customers find your work.</h3><p>Published items appear in the marketplace when available stock is above zero. Drafts remain private to your account.</p></div></aside>
    </form>
  </div>
}

function OrdersPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [filter, setFilter] = useState("All orders")
  const orders = filter === "All orders" ? sampleOrders : sampleOrders.filter((order) => order.status.toLowerCase().includes(filter.toLowerCase().replace(" ", " ")))
  return <div className="content-page"><PageHeading eyebrow="YOUR LOVELY CREATIONS, ON THEIR WAY" title="Orders" description="Every order is a chance to make someone’s day." action={<button className="button button-outline" onClick={() => onNotify("Order list downloaded")}>Download orders</button>} />
    <div className="order-summary-strip"><div><span>Needs your attention</span><strong>1 <small>new order</small></strong></div><div><span>In progress</span><strong>2 <small>being prepared</small></strong></div><div><span>On their way</span><strong>4 <small>with a delivery partner</small></strong></div></div>
    <div className="filter-row"><div className="filter-tabs compact" role="tablist" aria-label="Filter orders">{["All orders", "New", "Preparing", "Ready for pickup"].map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="subtle-action"><CalendarDays size={15} /> Last 30 days</button></div>
    <section className="panel table-panel"><div className="table-scroll"><table className="orders-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>DATE</th><th>STATUS</th><th>TOTAL</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{orders.map((order) => <tr key={order.code}><td><div className="order-table-product"><img src={order.image} alt="" /><div><strong>{order.product}</strong><span>{order.code} · {order.quantity}</span></div></div></td><td>{order.customer}</td><td>{order.date}</td><td><OrderStatus status={order.status} /></td><td className="price-cell">{order.total}</td><td><button className="button button-small button-outline" onClick={() => onNotify(order.status === "New order" ? "Order accepted. Thank you for letting us know!" : `Updated ${order.code}`)}>{order.status === "New order" ? "Accept" : order.status === "Preparing" ? "Mark ready" : "View"}</button></td></tr>)}</tbody></table></div></section>
  </div>
}

function LegacyMessagesPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [activeChat, setActiveChat] = useState("Sofia Ramirez")
  const [message, setMessage] = useState("")
  const [simplify, setSimplify] = useState(false)
  const [sentMessages, setSentMessages] = useState<string[]>([])
  const chatNames = ["Sofia Ramirez", "James Wilson", "Leila Patel"]
  return <div className="content-page"><PageHeading eyebrow="A FRIENDLY PLACE TO CONNECT" title="Messages" description="A little note goes a long way. Every conversation is right here." action={<button className="audio-help" onClick={() => onNotify("Audio messages can be transcribed from the microphone button.")}><Volume2 size={16} /> How it works</button>} />
    <div className="messages-shell panel"><aside className="conversation-list"><label className="conversation-search"><Search size={16} /><input placeholder="Find a conversation" aria-label="Find a conversation" /></label>{chatNames.map((name, index) => <button className={`conversation-item${activeChat === name ? " selected" : ""}`} key={name} onClick={() => setActiveChat(name)}><span className={`conversation-avatar person-${index}`}>{["SR", "JW", "LP"][index]}</span><span className="conversation-copy"><strong>{name}</strong><span>{["Could you tell me more about the glaze?", "Thank you! It looks wonderful.", "Is this available in another color?"][index]}</span></span><span className="conversation-meta"><small>{["10:42", "Yesterday", "Mon"][index]}</small>{index === 0 && <i />}</span></button>)}</aside>
      <section className="chat-window"><header className="chat-head"><span className="conversation-avatar person-0">{activeChat.split(" ").map((name) => name[0]).join("")}</span><div><strong>{activeChat}</strong><span><BadgeCheck size={13} /> Order AC-2048 · Riverstone Ceramic Vase</span></div><button className="audio-help" onClick={() => onNotify("This conversation has been translated into simple language.")}><Sparkles size={15} /> Simplify</button></header><div className="chat-thread"><div className="chat-day">TODAY</div><div className="chat-bubble received"><p>Hi Maya! I just saw your vase. I love that soft blue glaze. Is each one a little different?</p><span>10:38 AM <button aria-label="Listen to message" onClick={() => onNotify("Reading Sofia’s message aloud")}><Volume2 size={13} /></button></span></div><div className="chat-bubble sent"><p>Hi Sofia! Yes, every piece is made by hand, so each one has its own little character. I am happy to send you a photo of this one before I wrap it.</p><span>10:40 AM <CheckCheck size={13} /></span></div><div className="chat-bubble received"><p>That would be lovely, thank you!</p><span>10:42 AM <button aria-label="Listen to message" onClick={() => onNotify("Reading Sofia’s message aloud")}><Volume2 size={13} /></button></span></div>{sentMessages.map((text, index) => <div className="chat-bubble sent" key={`${text}-${index}`}><p>{text}</p><span>Just now <CheckCheck size={13} /></span></div>)}</div><div className="chat-tools"><button className={simplify ? "tool-active" : ""} onClick={() => { setSimplify(!simplify); onNotify(simplify ? "Simple writing turned off" : "Simple writing is on. We will help make messages easier to read.") }}><Sparkles size={14} /> Help me write simply</button><span>Messages are always available as text.</span></div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); if (message.trim()) { setSentMessages((items) => [...items, message.trim()]); setMessage("") } }}><button type="button" className="icon-button" aria-label="Voice message" onClick={() => onNotify("Voice message recording is ready")}><Mic size={18} /></button><input aria-label="Write a message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a kind note..." /><button type="button" className="icon-button" aria-label="Read message aloud" onClick={() => onNotify("Your message will be read aloud")}><Volume2 size={18} /></button><button type="submit" className="send-button" aria-label="Send message"><Send size={17} /></button></form></section>
    </div>
  </div>
}

function LegacyEarningsPage() {
  return <div className="content-page"><PageHeading eyebrow="THE FRUITS OF YOUR CRAFT" title="Your earnings" description="A clear view of what you have earned, every step of the way." action={<button className="button button-outline"><CalendarDays size={15} /> This month</button>} />
    <div className="earnings-overview"><article className="earning-total"><span>YOUR TOTAL EARNINGS</span><strong>$1,284.00</strong><small><span className="change-pill"><ArrowUpRight size={13} /> 18.6%</span> more than last month</small><div className="mini-line-chart" aria-label="Earnings have grown steadily over the last seven months"><svg viewBox="0 0 360 80" preserveAspectRatio="none" role="img"><path d="M0 68 C25 58 30 66 55 50 S85 56 108 41 S140 54 163 35 S196 40 217 27 S254 37 274 19 S315 31 338 11 S350 9 360 4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M0 68 C25 58 30 66 55 50 S85 56 108 41 S140 54 163 35 S196 40 217 27 S254 37 274 19 S315 31 338 11 S350 9 360 4 V80 H0Z" fill="url(#chartGradient)" opacity=".18"/><defs><linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1"><stop stopColor="currentColor"/><stop offset="1" stopColor="white" stopOpacity="0"/></linearGradient></defs></svg></div></article><div className="earning-side"><StatCard label="Available balance" value="$436.00" change="Ready" detail="to transfer" icon={Banknote} tone="mint" trend="plain" /><StatCard label="On the way" value="$128.00" change="2 payments" detail="being processed" icon={Clock3} tone="peach" trend="plain" /></div></div>
    <div className="section-heading earnings-heading"><div><h2>Recent payments</h2><p>Every sale, in one simple list.</p></div><button className="text-link">Download statement <ArrowDownRight size={14} /></button></div><section className="panel table-panel"><div className="table-scroll"><table className="orders-table earnings-table"><thead><tr><th>SALE</th><th>DATE</th><th>PAYMENT METHOD</th><th>STATUS</th><th>YOUR EARNINGS</th></tr></thead><tbody>{[["Riverstone Ceramic Vase","Today, 10:42 AM","Card ending in 2048","Processing","$36.10"],["Terra Clay Earrings × 2","Yesterday, 3:18 PM","Card ending in 9132","Completed","$45.60"],["Harvest Woven Basket","Oct 18, 2024","Cash on delivery","Completed","$43.70"],["Quiet Morning Wall Art","Oct 16, 2024","Card ending in 1881","Completed","$58.90"]].map((row) => <tr key={row[0]}><td><strong>{row[0]}</strong></td><td>{row[1]}</td><td>{row[2]}</td><td><OrderStatus status={row[3] === "Completed" ? "Delivered" : "Preparing"} /></td><td className="price-cell">{row[4]}</td></tr>)}</tbody></table></div></section>
  </div>
}

function ProfilePage({ onNotify }: { onNotify: (message: string) => void }) {
  return <div className="content-page"><PageHeading eyebrow="THE PERSON BEHIND THE PIECES" title="Your artisan profile" description="Share the story behind your work, in your own words." action={<button className="button button-primary" onClick={() => onNotify("Your profile changes have been saved")}>Save changes</button>} />
    <div className="profile-layout"><section className="panel profile-card"><div className="profile-cover"><Leaf className="cover-plant" size={76} aria-hidden="true" /><button className="cover-edit" onClick={() => onNotify("Choose a cover photo from your device")}>Change cover photo</button></div><div className="profile-body"><div className="profile-avatar">MC<button aria-label="Change profile photo" onClick={() => onNotify("Choose a profile photo from your device")}>+</button></div><span className="eyebrow">YOUR PUBLIC PROFILE</span><h2>Maya Chen</h2><p className="profile-location"><MapPin size={14} /> Northfield Village</p><p className="profile-bio">I find my inspiration in the quiet moments of everyday life. Every piece I make is shaped slowly, with care, from my little studio in Northfield.</p><div className="profile-facts"><span><strong>28</strong> happy customers</span><span><strong>12</strong> pieces in your shop</span><span><strong>4.9 <Star size={13} fill="currentColor" /></strong> average rating</span></div><button className="button button-outline" onClick={() => onNotify("Your public shop preview is ready") }><Store size={16} /> View my store</button></div></section><section className="panel profile-edit-panel"><div className="panel-heading"><div><h2>Your story</h2><p>It is your voice. Tell it your way.</p></div><button className="audio-help" onClick={() => onNotify("Reading profile editing tips aloud")}><Volume2 size={15} /> Listen</button></div><div className="field"><label htmlFor="artisan-name">Your name</label><input id="artisan-name" defaultValue="Maya Chen" /></div><div className="field"><label htmlFor="profile-location">Where you create</label><div className="input-with-icon"><MapPin size={16} /><input id="profile-location" defaultValue="Northfield Village" /></div></div><div className="field"><label htmlFor="artisan-story">A little about you</label><textarea id="artisan-story" rows={5} defaultValue="I find my inspiration in the quiet moments of everyday life. Every piece I make is shaped slowly, with care, from my little studio in Northfield." /><span className="helper-text">Only share what feels right. You never need to share personal health information.</span></div><div className="field"><label htmlFor="craft-type">What do you love to make?</label><select id="craft-type" defaultValue="Ceramics & pottery"><option>Ceramics & pottery</option><option>Textiles</option><option>Jewelry</option><option>Painting & art</option><option>Home decor</option></select></div></section></div>
  </div>
}

function AccessibilityPage({ largeText, highContrast, simplified, onLargeText, onContrast, onSimplified, onSave }: { largeText: boolean; highContrast: boolean; simplified: boolean; onLargeText: (value: boolean) => void; onContrast: (value: boolean) => void; onSimplified: (value: boolean) => void; onSave: () => void }) {
  return <div className="content-page"><PageHeading eyebrow="YOUR EXPERIENCE, YOUR WAY" title="Accessibility center" description="Changes apply immediately. Save them to remember your choices on this device." />
    <div className="access-center-layout"><div className="access-options-column"><AccessibilitySetting icon={TypeIcon} title="Larger text" description="Make words easier to read across the whole app." enabled={largeText} onChange={onLargeText} /><AccessibilitySetting icon={Sparkles} title="Simplified language" description="Use shorter sentences and clearer everyday words." enabled={simplified} onChange={onSimplified} /><AccessibilitySetting icon={EyeIcon} title="High contrast" description="Add stronger contrast between text and backgrounds." enabled={highContrast} onChange={onContrast} /></div><aside className="access-preview-column"><div className="panel access-preview"><span className="preview-sparkle"><Accessibility size={20} /></span><h2>Good design gives everyone room to shine.</h2><p>There is no right or wrong way to use AccessCraft. Choose what works best for you.</p><div className="preview-checks"><span><Check size={15} /> You never need to share a disability</span><span><Check size={15} /> Change settings whenever you like</span><span><Check size={15} /> Audio always has a text alternative</span></div><button className="button button-primary" onClick={onSave}>Save my preferences</button></div></aside></div>
  </div>
}

function TypeIcon({ size = 20 }: { size?: number }) { return <span className="type-symbol" style={{ fontSize: size }}>Aa</span> }
function EyeIcon({ size = 20 }: { size?: number }) { return <Accessibility size={size} /> }

function AccessibilitySetting({ icon: Icon, title, description, enabled, onChange }: { icon: React.ComponentType<{ size?: number }>; title: string; description: string; enabled: boolean; onChange: (value: boolean) => void }) {
  return <article className="access-setting"><span className="setting-icon"><Icon size={19} /></span><div className="setting-copy"><h3>{title}</h3><p>{description}</p></div><button className={`switch${enabled ? " on" : ""}`} role="switch" aria-checked={enabled} aria-label={title} onClick={() => onChange(!enabled)}><span /></button></article>
}

function MarketplacePage({ mode, search, products, favorites, onFavorite, onAdd, onSelect, onNavigate }: { mode: string; search: string; products: Product[]; favorites: number[]; onFavorite: (id: number) => void; onAdd: (product: Product) => void; onSelect: (product: Product) => void; onNavigate: (page: string) => void }) {
  const [category, setCategory] = useState("All gifts")
  const filtered = useMemo(() => products.filter((product) => (mode !== "favorites" || favorites.includes(product.id)) && (!search || `${product.name} ${product.category} ${product.artisan}`.toLowerCase().includes(search.toLowerCase())) && (category === "All gifts" || product.category.toLowerCase().includes(category.toLowerCase()))), [products, favorites, mode, search, category])
  const heading = mode === "favorites" ? "Your little wishlist" : mode === "explore" ? "Find something one-of-a-kind" : "Discover handmade. Support incredible talent."
  return <div className="marketplace-page">
    {mode === "home" && <section className="market-hero"><div className="market-hero-copy"><span className="eyebrow"><span className="hero-sparkle"><Sparkles size={13} /></span> MADE BY HAND, SHARED WITH HEART</span><h1>Discover handmade.<br /><em>Support incredible talent.</em></h1><p>One-of-a-kind pieces, made by independent artisans and offered in small batches.</p><button className="button button-primary" onClick={() => onNavigate("explore")}>Explore the collection <ArrowRight size={16} /></button><div className="hero-proof"><span>Thoughtful finds, made by hand and shipped with care.</span></div></div><div className="hero-image-wrap"><img src="/products/woven-wall-art.png" alt="Handwoven wall art made in a small artisan studio" /><div className="hero-note"><span className="note-star"><Sparkles size={14} /></span><div><strong>A story in every stitch</strong><span>Find your next favorite thing</span></div></div><div className="hero-round-seal"><span>MADE<br />WITH<br />HEART</span><Heart size={15} /></div></div></section>}
    <div className="market-section-heading"><div><span className="eyebrow">{mode === "favorites" ? "SAVED FOR LATER" : mode === "explore" ? "THE COLLECTION" : "GOOD THINGS, MADE WITH CARE"}</span><h2>{heading}</h2>{mode === "home" && <p>Small-batch pieces made with a whole lot of heart.</p>}</div>{mode !== "favorites" && <button className="text-link" onClick={() => onNavigate("explore")}>View all pieces <ArrowRight size={14} /></button>}</div>
    {mode !== "favorites" && <div className="category-row">{["All gifts", "Pottery", "Jewelry", "Home decor", "Wall art"].map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item === "All gifts" && <Sparkles size={14} />}{item}</button>)}</div>}
    {filtered.length ? <section className="market-product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} isFavorite={favorites.includes(product.id)} onFavorite={() => onFavorite(product.id)} onAdd={() => onAdd(product)} onSelect={() => onSelect(product)} />)}</section> : <EmptyState icon={mode === "favorites" ? Heart : Search} title={mode === "favorites" ? "Your wishlist is waiting" : "No pieces found just yet"} message={mode === "favorites" ? "Tap the heart on anything you love to save it here." : "Try a different search or choose another category."} />}
    {mode === "home" && <section className="impact-strip"><div className="impact-strip-icon"><Leaf size={22} /></div><div><span>MORE THAN A MARKETPLACE</span><h2>A good thing you can feel good about.</h2><p>Every piece supports the hands and heart behind it, helping artisans find new customers on their own terms.</p></div><button onClick={() => onNavigate("explore")}>Meet the makers <ArrowRight size={14} /></button></section>}
  </div>
}

function ProductCard({ product, isFavorite, onFavorite, onAdd, onSelect }: { product: Product; isFavorite: boolean; onFavorite: () => void; onAdd: () => void; onSelect: () => void }) {
  return <article className="market-product-card"><div className="market-product-image"><button className="product-photo-button" onClick={onSelect} aria-label={`View ${product.name}`}><img src={product.image} alt={product.name} /></button><button className={`favorite-button${isFavorite ? " favorited" : ""}`} onClick={onFavorite} aria-label={isFavorite ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}><Heart size={18} fill={isFavorite ? "currentColor" : "none"} /></button></div><div className="market-product-info"><button className="product-name-button" onClick={onSelect}><span>{product.category}</span><h3>{product.name}</h3></button><span className="market-rating">{product.stock} in stock</span></div><div className="market-product-bottom"><div><strong>{money(product.price)}</strong><span>by {product.artisan}</span></div><button className="quick-add" onClick={onAdd} aria-label={`Add ${product.name} to cart`}><Plus size={18} /></button></div></article>
}

function ProductDialog({ product, isFavorite, canPurchase, onFavorite, onAdd, onClose }: { product: Product; isFavorite: boolean; canPurchase: boolean; onFavorite: () => void; onAdd: () => void; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title"><button className="dialog-close icon-button" onClick={onClose} aria-label="Close product details"><X size={20} /></button><div className="dialog-product-image"><img src={product.image} alt={product.name} /></div><div className="dialog-product-copy"><span className="eyebrow">HANDMADE WITH CARE · {product.category.toUpperCase()}</span><h2 id="product-dialog-title">{product.name}</h2><div className="dialog-price-row"><strong>{money(product.price)}</strong><span className="market-rating">{product.stock} available</span></div><p>{product.description}</p><button className="audio-help dialog-audio" onClick={() => window.speechSynthesis?.speak(new SpeechSynthesisUtterance(product.description))}><Volume2 size={16} /> Listen to description</button><div className="artisan-inline"><div className="user-photo">{product.artisan.slice(0, 2).toUpperCase()}</div><div><strong>Made by {product.artisan}</strong><span><MapPin size={13} /> Independent maker</span></div><BadgeCheck size={18} /></div>{canPurchase && <><div className="dialog-actions"><button className="button button-primary" onClick={onAdd}><ShoppingCart size={17} /> Add to bag</button><button className={`dialog-favorite${isFavorite ? " favorited" : ""}`} onClick={onFavorite} aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}><Heart size={19} fill={isFavorite ? "currentColor" : "none"} /></button></div><div className="dialog-footnote"><Leaf size={14} /> Your purchase supports independent artisan work.</div></>}</div></section></div>
}

function CartPage({ products, cart, onQuantity, onNavigate }: { products: Product[]; cart: Record<number, number>; onQuantity: (id: number, delta: number) => void; onNavigate: (page: string) => void }) {
  const entries = products.filter((product) => cart[product.id])
  const subtotal = entries.reduce((sum, product) => sum + product.price * cart[product.id], 0)
  const delivery = entries.length ? 5.5 : 0
  return <div className="content-page"><PageHeading eyebrow="A FEW GOOD FINDS" title="Your shopping bag" description="Your handmade favorites, all together in one place." action={<button className="button button-outline" onClick={() => onNavigate("explore")}>Keep exploring</button>} />
    {entries.length ? <div className="cart-layout"><section className="panel cart-items-panel"><div className="cart-list-heading"><span>{entries.length} {entries.length === 1 ? "item" : "items"}</span><span>Price</span></div>{entries.map((product) => <div className="cart-item" key={product.id}><img src={product.image} alt={product.name} /><div className="cart-item-info"><span className="product-category">{product.category}</span><h3>{product.name}</h3><span>Made by {product.artisan}</span><div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => onQuantity(product.id, -1)}>−</button><span>{cart[product.id]}</span><button aria-label={`Add one ${product.name}`} onClick={() => onQuantity(product.id, 1)}>+</button></div></div><div className="cart-item-end"><strong>{money(product.price * cart[product.id])}</strong><button onClick={() => onQuantity(product.id, -cart[product.id])}>Remove</button></div></div>)}<div className="cart-note"><Leaf size={16} /><span>Independent makers pack each order with care.</span></div></section><aside className="panel order-summary"><h2>Order summary</h2><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Standard delivery</span><strong>{money(delivery)}</strong></div><div className="summary-total"><span>Total before tax</span><strong>{money(subtotal + delivery)}</strong></div><p>Applicable taxes are not included; configure tax before accepting live orders.</p><button className="button button-primary full-width" onClick={() => onNavigate("checkout")}>Continue to checkout <ArrowRight size={16} /></button><span className="safe-checkout"><BadgeCheck size={14} /> Cash on delivery or card payment</span></aside></div> : <EmptyState icon={ShoppingCart} title="Your bag is empty" message="Browse the collection to find something made with care." action={<button className="button button-primary" onClick={() => onNavigate("explore")}>Explore the collection <ArrowRight size={15} /></button>} />}
  </div>
}

function CheckoutPage({
  cart,
  subtotal,
  email,
  customerName,
  customerSignedIn,
  checkoutEnabled,
  cashOnDeliveryEnabled,
  busy,
  error,
  onSubmit,
  onNavigate,
}: {
  cart: Record<number, number>
  subtotal: number
  email: string
  customerName: string
  customerSignedIn: boolean
  checkoutEnabled: boolean
  cashOnDeliveryEnabled: boolean
  busy: boolean
  error: string
  onSubmit: (
    paymentMethod: "cash_on_delivery" | "card",
    formData: FormData,
  ) => Promise<void>
  onNavigate: (page: string) => void
}) {
  const [paymentMethod, setPaymentMethod] = useState<
    "cash_on_delivery" | "card"
  >("cash_on_delivery")
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)
  const paymentAvailable =
    paymentMethod === "cash_on_delivery"
      ? cashOnDeliveryEnabled
      : checkoutEnabled

  return (
    <div className="content-page">
      <PageHeading
        eyebrow="ALMOST THERE"
        title="Complete your order"
        description="Choose cash on delivery or pay securely by card."
      />
      <form
        className="checkout-layout"
        onSubmit={(event) => {
          event.preventDefault()
          void onSubmit(paymentMethod, new FormData(event.currentTarget))
        }}
      >
        <div className="checkout-fields">
          {paymentMethod === "cash_on_delivery" ? (
            <section className="panel form-panel">
              <div className="form-section-head">
                <span className="step-number">1</span>
                <div>
                  <h2>Delivery details</h2>
                  <p>We will use these details to deliver your order.</p>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="checkout-customer-name">Full name</label>
                  <input
                    id="checkout-customer-name"
                    name="customerName"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    defaultValue={customerName}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="checkout-phone">Phone number</label>
                  <input
                    id="checkout-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    minLength={5}
                    maxLength={40}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="checkout-address-line1">Street address</label>
                <input
                  id="checkout-address-line1"
                  name="addressLine1"
                  autoComplete="address-line1"
                  minLength={3}
                  maxLength={200}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="checkout-address-line2">
                  Apartment, suite, etc. <span>Optional</span>
                </label>
                <input
                  id="checkout-address-line2"
                  name="addressLine2"
                  autoComplete="address-line2"
                  maxLength={200}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="checkout-city">City or town</label>
                  <input
                    id="checkout-city"
                    name="city"
                    autoComplete="address-level2"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="checkout-state">
                    State or region <span>Optional</span>
                  </label>
                  <input
                    id="checkout-state"
                    name="state"
                    autoComplete="address-level1"
                    maxLength={100}
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="checkout-postal-code">
                    Postal code <span>Optional</span>
                  </label>
                  <input
                    id="checkout-postal-code"
                    name="postalCode"
                    autoComplete="postal-code"
                    maxLength={30}
                  />
                </div>
                <div className="field">
                  <label htmlFor="checkout-country">Country</label>
                  <input
                    id="checkout-country"
                    name="country"
                    autoComplete="country-name"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </div>
              </div>
            </section>
          ) : (
            <section className="panel form-panel">
              <div className="form-section-head">
                <span className="step-number">1</span>
                <div>
                  <h2>Delivery details</h2>
                  <p>Stripe will collect your shipping address and phone number.</p>
                </div>
              </div>
              <div className="field">
                <span className="field-label">Receipt email</span>
                <p>{email || "The email on your customer account"}</p>
              </div>
            </section>
          )}
          <section className="panel form-panel">
            <div className="form-section-head">
              <span className="step-number">2</span>
              <div>
                <h2>Payment method</h2>
                <p>Choose how you would like to pay for your order.</p>
              </div>
            </div>
            <label
              className={`payment-option${paymentMethod === "cash_on_delivery" ? " selected" : ""}`}
            >
              <input
                type="radio"
                name="payment-method"
                value="cash_on_delivery"
                checked={paymentMethod === "cash_on_delivery"}
                disabled={!cashOnDeliveryEnabled || busy}
                onChange={() => setPaymentMethod("cash_on_delivery")}
              />
              <span className="payment-radio" />
              <span>
                <strong>Cash on delivery</strong>
                <small>Pay the delivery partner when your order arrives.</small>
              </span>
              <Banknote size={20} />
            </label>
            <label
              className={`payment-option${paymentMethod === "card" ? " selected" : ""}`}
            >
              <input
                type="radio"
                name="payment-method"
                value="card"
                checked={paymentMethod === "card"}
                disabled={!checkoutEnabled || busy}
                onChange={() => setPaymentMethod("card")}
              />
              <span className="payment-radio" />
              <span>
                <strong>Credit or debit card</strong>
                <small>
                  {checkoutEnabled
                    ? "Secure, encrypted checkout"
                    : "Card checkout is not configured"}
                </small>
              </span>
              <BadgeCheck size={20} />
            </label>
          </section>
        </div>
        <aside className="panel order-summary">
          <h2>Order summary</h2>
          <p>{cartCount} {cartCount === 1 ? "item" : "items"} in your bag</p>
          <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <div><span>Standard delivery</span><strong>$5.50</strong></div>
          <div className="summary-total"><span>Total before tax</span><strong>{money(subtotal + 5.5)}</strong></div>
          <p>Applicable taxes are not calculated automatically.</p>
          {error && <p className="checkout-error" role="alert">{error}</p>}
          {!customerSignedIn && (
            <p className="checkout-error" role="status">
              Sign in to your customer account to place an order.
              {" "}
              <button type="button" className="text-link" onClick={() => onNavigate("auth")}>Sign in</button>
            </p>
          )}
          {customerSignedIn && !cashOnDeliveryEnabled && !checkoutEnabled && (
            <p className="checkout-error" role="status">
              Checkout requires Supabase server configuration. Please contact the store.
            </p>
          )}
          <button
            className="button button-primary full-width"
            type="submit"
            disabled={!customerSignedIn || !paymentAvailable || busy || cartCount === 0}
          >
            {busy
              ? paymentMethod === "cash_on_delivery"
                ? "Placing your order..."
                : "Opening secure checkout..."
              : paymentMethod === "cash_on_delivery"
                ? "Place order — pay on delivery"
                : "Continue to secure payment"}
            {" "}<ArrowRight size={16} />
          </button>
          <button className="back-to-cart" type="button" onClick={() => onNavigate("cart")}>Back to my bag</button>
        </aside>
      </form>
    </div>
  )
}

function LegacyCheckoutPage({ cartCount, subtotal, onNavigate, onComplete }: { cartCount: number; subtotal: number; onNavigate: (page: string) => void; onComplete: () => void }) {
  return <div className="content-page"><PageHeading eyebrow="ALMOST THERE" title="A few final details" description="Just the essentials, so your handmade piece finds its way to you." />
    <form className="checkout-layout" onSubmit={(event) => { event.preventDefault(); onComplete() }}><div className="checkout-fields"><section className="panel form-panel"><div className="form-section-head"><span className="step-number">1</span><div><h2>Who should we deliver to?</h2><p>Only the details our local delivery partner needs.</p></div></div><div className="field-row"><div className="field"><label htmlFor="checkout-name">Your name</label><input id="checkout-name" placeholder="Full name" required /></div><div className="field"><label htmlFor="checkout-phone">Phone number</label><input id="checkout-phone" type="tel" placeholder="For delivery updates" required /></div></div><div className="field"><label htmlFor="checkout-address">Delivery address</label><input id="checkout-address" placeholder="Street and house number" required /></div><div className="field-row"><div className="field"><label htmlFor="checkout-village">Village or town</label><input id="checkout-village" placeholder="Your village or town" required /></div><div className="field"><label htmlFor="checkout-notes">Delivery notes <span>Optional</span></label><input id="checkout-notes" placeholder="A helpful landmark, if you like" /></div></div></section><section className="panel form-panel"><div className="form-section-head"><span className="step-number">2</span><div><h2>How would you like to pay?</h2><p>Choose what feels easiest for you.</p></div></div><label className="payment-option selected"><input type="radio" name="payment" defaultChecked /><span className="payment-radio" /><span><strong>Cash on delivery</strong><small>Pay your delivery partner when your order arrives.</small></span><Banknote size={20} /></label><label className="payment-option"><input type="radio" name="payment" /><span className="payment-radio" /><span><strong>Card payment</strong><small>Secure card payment is available at checkout.</small></span><span className="card-symbol">••••</span></label></section></div><aside className="panel order-summary"><h2>Your order</h2><p>{cartCount} handmade {cartCount === 1 ? "piece" : "pieces"}, packed with care</p><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Delivery</span><strong>$5.50</strong></div><div className="summary-total"><span>Total</span><strong>{money(subtotal + 5.5)}</strong></div><button className="button button-primary full-width" type="submit">Place my order <ArrowRight size={16} /></button><button className="back-to-cart" type="button" onClick={() => onNavigate("cart")}>Back to my bag</button></aside></form>
  </div>
}

function ConfirmationPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  return <div className="confirmation-wrap"><div className="confirmation-card panel"><div className="confirmation-art"><div className="confirmation-circle"><Check size={32} /></div><Sparkles className="confetti confetti-one" size={22} aria-hidden="true" /><Sparkles className="confetti confetti-two" size={15} aria-hidden="true" /><span className="confetti confetti-three" aria-hidden="true">•</span></div><span className="eyebrow">A LOVELY LITTLE MILESTONE</span><h1>Your order is on its way!</h1><p>Thank you for choosing handmade. Maya is getting your piece ready with care.</p><div className="confirmation-order"><span>ORDER NUMBER</span><strong>AC-2051</strong><span>Estimated arrival: October 25–27</span></div><div className="confirmation-actions"><button className="button button-primary" onClick={() => onNavigate("my-orders")}>Track my order <ArrowRight size={15} /></button><button className="button button-outline" onClick={() => onNavigate("home")}>Keep exploring</button></div><div className="confirmation-thanks"><Heart size={15} fill="currentColor" /> Your purchase supports Maya’s independent craft.</div></div></div>
}

function MessagesPage({
  account,
  role,
  conversations,
  contacts,
  activeConversationId,
  messageDraft,
  sending,
  onSelectConversation,
  onMessageDraftChange,
  onStartConversation,
  onSendMessage,
}: {
  account: AccountProfile
  role: Role
  conversations: Conversation[]
  contacts: OrderContact[]
  activeConversationId: string | null
  messageDraft: string
  sending: boolean
  onSelectConversation: (id: string) => void
  onMessageDraftChange: (value: string) => void
  onStartConversation: (contact: OrderContact) => void
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void
}) {
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  )
  const counterpartName = (conversation: Conversation) =>
    conversation.customer_id === account.id
      ? conversation.recipient_name
      : conversation.customer_name

  return (
    <div className="content-page">
      <PageHeading
        eyebrow="STAY IN TOUCH"
        title="Messages"
        description="Order conversations stay private between the customer and their artisan or delivery partner."
      />
      <div className="messages-layout">
        <aside className="panel conversation-sidebar">
          {role === "customer" && (
            <section className="message-contact-section">
              <div className="panel-heading">
                <div>
                  <h2>Contact about an order</h2>
                  <p>Message an artisan or your assigned delivery partner.</p>
                </div>
              </div>
              {contacts.length ? (
                <div className="message-contact-list">
                  {contacts.map((contact) => (
                    <button
                      className="message-contact"
                      key={`${contact.order_id}-${contact.recipient_role}-${contact.recipient_id}`}
                      onClick={() => onStartConversation(contact)}
                    >
                      <span className="conversation-avatar">
                        {contact.recipient_role === "artisan" ? (
                          <Store size={16} />
                        ) : (
                          <Truck size={16} />
                        )}
                      </span>
                      <span>
                        <strong>{contact.recipient_name}</strong>
                        <small>
                          {contact.recipient_role === "artisan"
                            ? "Artisan"
                            : "Delivery partner"}{" "}
                          · Order {contact.order_id.slice(0, 8).toUpperCase()}
                        </small>
                        <small className="message-context">
                          {contact.context_label}
                        </small>
                      </span>
                      <MessageCircle size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="conversation-empty">
                  Your order contacts will appear here after you place an order.
                </p>
              )}
            </section>
          )}
          <section className="message-thread-section">
            <div className="panel-heading">
              <div>
                <h2>Your conversations</h2>
                <p>{conversations.length} conversations</p>
              </div>
            </div>
            {conversations.length ? (
              <div className="message-thread-list">
                {conversations.map((conversation) => (
                  <button
                    className={`message-thread${conversation.id === activeConversationId ? " active" : ""}`}
                    key={conversation.id}
                    onClick={() => onSelectConversation(conversation.id)}
                  >
                    <span className="conversation-avatar">
                      {conversation.recipient_role === "artisan" ? (
                        <Store size={16} />
                      ) : (
                        <Truck size={16} />
                      )}
                    </span>
                    <span>
                      <strong>{counterpartName(conversation)}</strong>
                      <small>
                        Order {conversation.order_id.slice(0, 8).toUpperCase()}
                      </small>
                      <small>
                        {conversation.messages.at(-1)?.body ??
                          "Start the conversation"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="conversation-empty">
                Conversations with customers and order contacts will show up here.
              </p>
            )}
          </section>
        </aside>
        <section className="panel conversation-panel" aria-label="Conversation">
          {activeConversation ? (
            <>
              <header className="conversation-header">
                <span className="conversation-avatar">
                  {activeConversation.recipient_role === "artisan" ? (
                    <Store size={17} />
                  ) : (
                    <Truck size={17} />
                  )}
                </span>
                <div>
                  <strong>{counterpartName(activeConversation)}</strong>
                  <small>
                    {activeConversation.recipient_role === "artisan"
                      ? "Artisan"
                      : "Delivery partner"}{" "}
                    · Order {activeConversation.order_id.slice(0, 8).toUpperCase()}
                  </small>
                </div>
              </header>
              <div className="conversation-messages" aria-live="polite">
                {activeConversation.messages.length ? (
                  activeConversation.messages.map((message) => (
                    <article
                      className={`message-bubble${message.sender_id === account.id ? " own" : ""}`}
                      key={message.id}
                    >
                      <p>{message.body}</p>
                      <time dateTime={message.created_at}>
                        {new Date(message.created_at).toLocaleString()}
                      </time>
                    </article>
                  ))
                ) : (
                  <p className="conversation-empty">
                    No messages yet. Send a message to get started.
                  </p>
                )}
              </div>
              <form className="message-compose" onSubmit={onSendMessage}>
                <label className="sr-only" htmlFor="message-draft">
                  Write a message
                </label>
                <textarea
                  id="message-draft"
                  value={messageDraft}
                  maxLength={4000}
                  placeholder="Write a message..."
                  onChange={(event) => onMessageDraftChange(event.target.value)}
                  required
                />
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={sending || !messageDraft.trim()}
                >
                  {sending ? "Sending..." : "Send"} <Send size={15} />
                </button>
              </form>
            </>
          ) : (
            <div className="conversation-placeholder">
              <MessageCircle size={28} />
              <h2>Select a conversation</h2>
              <p>
                {role === "customer"
                  ? "Choose an order contact to start a private conversation."
                  : "When a customer contacts you about an order, the conversation will appear here."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function EarningsPage({
  role,
  loading,
  artisanEarnings,
  productSales,
  deliveryEarnings,
}: {
  role: "artisan" | "delivery"
  loading: boolean
  artisanEarnings: ArtisanEarnings | null
  productSales: ArtisanProductSale[]
  deliveryEarnings: DeliveryEarnings | null
}) {
  const currency = (cents: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  const monthChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? "New this month" : "No change"
    const change = ((current - previous) / previous) * 100
    return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`
  }

  if (role === "artisan") {
    const summary = artisanEarnings
    return (
      <div className="content-page">
        <PageHeading
          eyebrow="ARTISAN STUDIO"
          title="Sales & earnings"
          description="Completed card orders and delivered cash-on-delivery orders are included. A 5% platform commission is deducted from product sales."
        />
        {loading ? (
          <p className="delivery-loading" role="status">Loading your sales and earnings...</p>
        ) : summary ? (
          <>
            <div className="stats-grid earnings-stats">
              <StatCard label="Gross product sales" value={currency(summary.gross_sales_cents)} change={`${summary.orders_count} orders`} detail={`${summary.units_sold} items sold`} icon={ShoppingBag} tone="mint" trend="plain" />
              <StatCard label="Platform commission (5%)" value={currency(summary.commission_cents)} change="5% per eligible sale" detail="deducted from gross sales" icon={CircleDollarSign} tone="peach" trend="plain" />
              <StatCard label="Your earnings" value={currency(summary.net_earnings_cents)} change="After commission" detail="before any applicable taxes" icon={Banknote} tone="lavender" trend="plain" />
              <StatCard label="This month" value={currency(summary.current_month_cents)} change={monthChange(summary.current_month_cents, summary.previous_month_cents)} detail="gross sales vs. last month" icon={CalendarDays} tone="yellow" trend={summary.current_month_cents >= summary.previous_month_cents ? "up" : "plain"} />
            </div>
            <section className="panel earnings-products">
              <div className="panel-heading">
                <div>
                  <h2>Sales by product</h2>
                  <p>Gross sales, 5% commission, and estimated earnings per product.</p>
                </div>
              </div>
              {productSales.length ? (
                <div className="earnings-table-wrap">
                  <table className="earnings-data-table">
                    <thead>
                      <tr><th>Product</th><th>Units</th><th>Gross sales</th><th>Commission</th><th>Your earnings</th></tr>
                    </thead>
                    <tbody>
                      {productSales.map((sale) => (
                        <tr key={sale.product_id}>
                          <th scope="row">{sale.product_name}</th>
                          <td>{sale.units_sold}</td>
                          <td>{currency(sale.gross_sales_cents)}</td>
                          <td>{currency(sale.commission_cents)}</td>
                          <td>{currency(sale.net_earnings_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="conversation-empty">Your products’ sales will appear here when eligible orders are completed.</p>
              )}
            </section>
          </>
        ) : (
          <EmptyState icon={Banknote} title="Earnings are unavailable" message="We could not load your sales data. Please try again later." />
        )}
      </div>
    )
  }

  return (
    <div className="content-page">
      <PageHeading
        eyebrow="DELIVERY PARTNER"
        title="Delivery earnings"
        description="Your estimated earnings are $5.50 for each completed delivery. Pending and active deliveries are not counted yet."
      />
      {loading ? (
        <p className="delivery-loading" role="status">Loading your delivery earnings...</p>
      ) : deliveryEarnings ? (
        <>
          <div className="stats-grid earnings-stats">
            <StatCard label="Total earnings" value={currency(deliveryEarnings.total_earnings_cents)} change={`${deliveryEarnings.deliveries_completed} completed`} detail="$5.50 per completed delivery" icon={Banknote} tone="mint" trend="plain" />
            <StatCard label="This month" value={currency(deliveryEarnings.current_month_cents)} change={monthChange(deliveryEarnings.current_month_cents, deliveryEarnings.previous_month_cents)} detail="vs. last month" icon={CalendarDays} tone="lavender" trend={deliveryEarnings.current_month_cents >= deliveryEarnings.previous_month_cents ? "up" : "plain"} />
            <StatCard label="Active deliveries" value={String(deliveryEarnings.active_deliveries)} change="In progress" detail="not included in earnings yet" icon={Truck} tone="peach" trend="plain" />
          </div>
          <section className="panel earnings-note">
            <Banknote size={20} />
            <div>
              <h2>How delivery earnings are calculated</h2>
              <p>Each delivery marked complete adds $5.50 to your estimated earnings. This is the store’s current standard delivery charge; actual payouts are managed outside the app.</p>
            </div>
          </section>
        </>
      ) : (
        <EmptyState icon={Banknote} title="Earnings are unavailable" message="We could not load your delivery earnings. Please try again later." />
      )}
    </div>
  )
}

function CustomerOrdersPage({
  orders,
  onNavigate,
}: {
  onNavigate: (page: string) => void
  orders: {
    id: string
    amount_total_cents: number
    currency: string
    status: string
    created_at: string
    order_items: {
      product_name: string
      quantity: number
      unit_price_cents: number
    }[]
    delivery_jobs: {
      status: "pending" | "accepted" | "delivered"
      accepted_at: string | null
      delivered_at: string | null
    }[]
  }[]
}) {
  return (
    <div className="content-page">
      <PageHeading eyebrow="YOUR PURCHASES" title="Your orders" description="Orders placed with this customer account appear here." action={<button className="button button-outline" onClick={() => onNavigate("messages")}><MessageCircle size={15} /> Messages</button>} />
      {orders.length ? (
        <div className="customer-order-list">
          {orders.map((order) => (
            <section className="panel customer-order-card" key={order.id}>
              <div className="customer-order-heading">
                <div>
                  <span className="eyebrow">ORDER {order.id.slice(0, 8).toUpperCase()}</span>
                  <p>{new Date(order.created_at).toLocaleDateString()}</p>
                </div>
                <strong>
                  {new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency: order.currency.toUpperCase(),
                  }).format(order.amount_total_cents / 100)}
                </strong>
              </div>
              <p className="customer-order-status">
                {order.status === "needs_review"
                  ? "Payment received — order needs review"
                  : order.delivery_jobs[0]?.status === "delivered"
                    ? "Order delivered"
                    : order.delivery_jobs[0]?.status === "accepted"
                      ? order.status === "pending_cod"
                        ? "Delivery accepted — pay cash when it arrives"
                        : "A delivery partner accepted your order"
                      : order.status === "pending_cod"
                        ? "Cash on delivery — order confirmed"
                        : order.delivery_jobs[0]?.status === "pending"
                          ? "Order confirmed — finding a delivery partner"
                          : "Payment received"}
              </p>
              <ul>
                {order.order_items.map((item, index) => (
                  <li key={`${order.id}-${index}`}>
                    {item.product_name} · {item.quantity} ×{" "}
                    {money(item.unit_price_cents / 100)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={PackageCheck}
          title="No orders yet"
          message="When you complete a purchase while signed in, it will appear here."
        />
      )}
    </div>
  )
}

function formatShippingAddress(address: Record<string, string>) {
  const cityRegion = [address.city, address.state].filter(Boolean).join(", ")
  return [
    address.line1,
    address.line2,
    cityRegion,
    address.postal_code,
    address.country,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(", ")
}

function DeliveryJobsPage({
  jobs,
  loading,
  accountId,
  onAccept,
  onComplete,
}: {
  jobs: DeliveryJob[]
  loading: boolean
  accountId: string
  onAccept: (job: DeliveryJob) => void
  onComplete: (job: DeliveryJob) => void
}) {
  const availableJobs = jobs.filter((job) => job.status === "pending")
  const assignedJobs = jobs.filter(
    (job) => job.delivery_id === accountId && job.status !== "pending",
  )

  const renderJob = (job: DeliveryJob) => {
    const order = Array.isArray(job.orders) ? job.orders[0] : job.orders
    if (!order) return null
    const shippingAddress = formatShippingAddress(order.shipping_address)

    return (
      <article className="panel delivery-job-card" key={job.id}>
        <div className="delivery-job-header">
          <div>
            <span className="eyebrow">
              ORDER {order.id.slice(0, 8).toUpperCase()}
            </span>
            <h2>{order.customer_name}</h2>
          </div>
          <span className={`delivery-job-status status-${job.status}`}>
            {job.status === "pending"
              ? "Available"
              : job.status === "accepted"
                ? "Assigned to you"
                : "Delivered"}
          </span>
        </div>
        <div className="delivery-job-details">
          <p>
            <MapPin size={15} />
            <span>{shippingAddress || "Shipping address unavailable"}</span>
          </p>
          {order.customer_phone && (
            <p>
              <Truck size={15} />
              <a href={`tel:${order.customer_phone}`}>{order.customer_phone}</a>
            </p>
          )}
          <ul>
            {order.order_items.map((item, index) => (
              <li key={`${job.id}-${index}`}>
                {item.product_name} · {item.quantity}
              </li>
            ))}
          </ul>
        </div>
        <div className="delivery-job-footer">
          <span>
            Order total{" "}
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: order.currency.toUpperCase(),
            }).format(order.amount_total_cents / 100)}
          </span>
          {order.status === "pending_cod" && (
            <strong>Collect cash on delivery</strong>
          )}
          {job.status === "pending" ? (
            <button
              className="button button-primary button-small"
              onClick={() => onAccept(job)}
            >
              Accept delivery
            </button>
          ) : job.status === "accepted" ? (
            <button
              className="button button-outline button-small"
              onClick={() => onComplete(job)}
            >
              Mark delivered
            </button>
          ) : (
            <span>
              Delivered{" "}
              {job.delivered_at
                ? new Date(job.delivered_at).toLocaleString()
                : ""}
            </span>
          )}
        </div>
      </article>
    )
  }

  return (
    <div className="content-page">
      <PageHeading
        eyebrow="DELIVERY PARTNER"
        title="Delivery requests"
        description="New paid orders appear here for every delivery partner. The first partner to accept gets the assignment."
      />
      <section className="delivery-jobs-section">
        <div className="section-heading">
          <div>
            <h2>Available for everyone</h2>
            <p>
              {availableJobs.length}{" "}
              {availableJobs.length === 1 ? "request" : "requests"} waiting
            </p>
          </div>
        </div>
        {loading ? (
          <p className="delivery-loading" role="status">
            Loading delivery requests...
          </p>
        ) : availableJobs.length ? (
          <div className="delivery-job-list">
            {availableJobs.map(renderJob)}
          </div>
        ) : (
          <EmptyState
            icon={Truck}
            title="No available requests right now"
            message="New customer orders will appear here. This list updates automatically."
          />
        )}
      </section>
      <section className="delivery-jobs-section">
        <div className="section-heading">
          <div>
            <h2>Your assignments</h2>
            <p>Only you can see the orders assigned to your account.</p>
          </div>
        </div>
        {assignedJobs.length ? (
          <div className="delivery-job-list">
            {assignedJobs.map(renderJob)}
          </div>
        ) : (
          <EmptyState
            icon={PackageCheck}
            title="No deliveries assigned yet"
            message="When you accept an available request, it will move here."
          />
        )}
      </section>
    </div>
  )
}

function LegacyCustomerOrdersPage({ onNotify }: { onNotify: (message: string) => void }) {
  return <div className="content-page"><PageHeading eyebrow="GOOD THINGS ARE ON THEIR WAY" title="Your orders" description="A clear little update on every piece you have chosen." />{["AC-2051", "AC-2042"].map((code, index) => <section className="panel tracking-card" key={code}><div className="tracking-header"><div><span className="eyebrow">ORDER {code}</span><h2>{index === 0 ? "Riverstone Ceramic Vase" : "Quiet Morning Wall Art"}</h2><p>Made with care by Maya Chen · Northfield Village</p></div><OrderStatus status={index === 0 ? "Preparing" : "Ready for pickup"} /></div><div className="tracking-steps">{["Order placed", "Artisan accepted", "Being prepared", "Ready for pickup", "Out for delivery", "Delivered"].map((step, stepIndex) => <div className={`tracking-step${stepIndex < (index === 0 ? 3 : 4) ? " complete" : stepIndex === (index === 0 ? 2 : 3) ? " current" : ""}`} key={step}><span>{stepIndex < (index === 0 ? 3 : 4) ? <Check size={12} /> : stepIndex + 1}</span><small>{step}</small></div>)}</div><div className="tracking-bottom"><span><Truck size={16} /> Estimated delivery: Oct 25–27</span><button className="text-link" onClick={() => onNotify("Maya and your local delivery partner can help with your order")}>Get order help <ArrowRight size={14} /></button></div></section>)}</div>
}

function DeliveryDashboard({ onNavigate, onNotify }: { onNavigate: (page: string) => void; onNotify: (message: string) => void }) {
  return <div className="dashboard-page"><div className="welcome-line"><div><span className="eyebrow">MONDAY, OCTOBER 21, 2024</span><h1>Good morning, Alex <Sparkles className="wave-dot" size={16} aria-hidden="true" /></h1><p>There are good things on the move today. Here is your route at a glance.</p></div><button className="button button-primary" onClick={() => onNavigate("deliveries")}><Truck size={17} /> Find a delivery</button></div><div className="delivery-highlight"><div className="delivery-highlight-icon"><Truck size={20} /></div><div><span>NEARBY PICKUP REQUEST</span><h2>A handmade vase needs a lift.</h2><p>Northfield Village → Mill Creek · 3.2 miles</p></div><strong>$8.50</strong><button className="button button-primary button-small" onClick={() => onNotify("You accepted delivery AC-2048. Thank you, Alex!")}>Accept delivery</button></div><div className="stats-grid delivery-stats"><StatCard label="Available deliveries" value="04" change="Nearby" detail="within 5 miles" icon={Truck} tone="mint" trend="plain" /><StatCard label="Active deliveries" value="02" change="On route" detail="today" icon={MapPin} tone="peach" trend="plain" /><StatCard label="Completed today" value="06" change="Great work" detail="this week" icon={PackageCheck} tone="lavender" trend="plain" /><StatCard label="Today’s earnings" value="$42.50" change="+$8.50" detail="from last week" icon={CircleDollarSign} tone="yellow" trend="up" /></div><div className="delivery-content-grid"><section className="panel available-panel"><div className="panel-heading"><div><h2>Nearby opportunities</h2><p>Pick a route that works for you.</p></div><button className="text-link" onClick={() => onNavigate("deliveries")}>See all <ArrowRight size={14} /></button></div>{[{code:"AC-2048",item:"Riverstone Ceramic Vase",from:"Northfield Village",to:"Mill Creek",distance:"3.2 mi",fee:"$8.50",img:"/products/ceramic-vase.png"},{code:"AC-2050",item:"Terra Clay Earrings",from:"Northfield Village",to:"Oakwood",distance:"2.1 mi",fee:"$6.25",img:"/products/clay-earrings.png"}].map((delivery) => <div className="delivery-row" key={delivery.code}><img src={delivery.img} alt="" /><div><strong>{delivery.item}</strong><span>{delivery.code} · {delivery.from} to {delivery.to}</span><small><MapPin size={12} /> {delivery.distance} away</small></div><div><strong>{delivery.fee}</strong><button onClick={() => onNotify(`You accepted ${delivery.code}`)}>Accept</button></div></div>)}</section><section className="panel route-panel"><span className="eyebrow">YOUR DAY SO FAR</span><h2>A steady, thoughtful pace.</h2><p>You have helped 6 handmade pieces find their way to happy homes this week.</p><div className="route-stat"><span>Weekly progress</span><strong>6 of 10 deliveries</strong></div><div className="progress-track"><span style={{width:"60%"}} /></div><button className="text-link" onClick={() => onNavigate("history")}>Your delivery history <ArrowRight size={14} /></button></section></div><div className="bottom-note"><span className="note-icon"><Volume2 size={18} /></span><div><strong>Your route, your pace.</strong><p>Accept delivery requests that work for you. You are always in control.</p></div><button onClick={() => onNavigate("accessibility")}>Accessibility options <ArrowRight size={14} /></button></div></div>
}

function DeliveriesPage({ onNotify }: { onNotify: (message: string) => void }) {
  return <div className="content-page"><PageHeading eyebrow="NEARBY, WHEN YOU ARE READY" title="Available deliveries" description="Choose a delivery that works for your route and schedule." action={<button className="button button-outline"><MapPin size={15} /> Within 5 miles</button>} /><div className="delivery-highlight delivery-page-highlight"><div className="delivery-highlight-icon"><MapPin size={20} /></div><div><span>YOUR PICKUP AREA</span><h2>Northfield and nearby villages</h2><p>4 delivery requests are close by right now.</p></div><button className="button button-outline button-small" onClick={() => onNotify("Your pickup area is set to Northfield and nearby villages")}>Change area</button></div><div className="delivery-requests">{[{code:"AC-2048",item:"Riverstone Ceramic Vase",from:"Maya Chen · Northfield Village",to:"Sofia Ramirez · Mill Creek",distance:"3.2 mi",fee:"$8.50",image:"/products/ceramic-vase.png"},{code:"AC-2050",item:"Terra Clay Earrings",from:"Maya Chen · Northfield Village",to:"James Wilson · Oakwood",distance:"2.1 mi",fee:"$6.25",image:"/products/clay-earrings.png"},{code:"AC-2052",item:"Harvest Woven Basket",from:"Elena Cruz · Pine Hollow",to:"Leila Patel · Northfield",distance:"4.8 mi",fee:"$10.00",image:"/products/woven-basket.png"}].map((item) => <article className="panel delivery-request" key={item.code}><img src={item.image} alt="" /><div className="request-info"><span className="eyebrow">{item.code} · {item.distance} AWAY</span><h2>{item.item}</h2><div className="request-route"><span><i className="route-dot pickup" />{item.from}</span><span><i className="route-dot dropoff" />{item.to}</span></div></div><div className="request-fee"><span>DELIVERY FEE</span><strong>{item.fee}</strong><button className="button button-primary button-small" onClick={() => onNotify(`You accepted delivery ${item.code}. The artisan has been notified.`)}>Accept delivery</button></div></article>)}</div></div>
}

function DeliveryHistoryPage() {
  return <div className="content-page"><PageHeading eyebrow="YOU HAVE MADE A DIFFERENCE" title="Delivery history" description="Every journey helped a handmade piece find its person." /><div className="order-summary-strip"><div><span>Completed deliveries</span><strong>48 <small>all time</small></strong></div><div><span>Total earned</span><strong>$386 <small>and growing</small></strong></div><div><span>Your rating</span><strong>4.9 <small>from happy customers</small></strong></div></div><section className="panel table-panel"><div className="table-scroll"><table className="orders-table"><thead><tr><th>DELIVERY</th><th>DATE</th><th>ROUTE</th><th>STATUS</th><th>YOUR EARNINGS</th></tr></thead><tbody>{[["AC-2042 · Quiet Morning Wall Art","Oct 20, 2024","Northfield → Mill Creek","Delivered","$9.00"],["AC-2038 · Terra Clay Earrings","Oct 19, 2024","Oakwood → Northfield","Delivered","$6.25"],["AC-2034 · Woven Basket","Oct 18, 2024","Pine Hollow → Oakwood","Delivered","$10.00"],["AC-2030 · Ceramic Vase","Oct 16, 2024","Northfield → Mill Creek","Delivered","$8.50"]].map((row) => <tr key={row[0]}><td><strong>{row[0]}</strong></td><td>{row[1]}</td><td>{row[2]}</td><td><OrderStatus status={row[3]} /></td><td className="price-cell">{row[4]}</td></tr>)}</tbody></table></div></section></div>
}

function EmptyState({ icon: Icon, title, message, action }: { icon: LucideIcon; title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><span><Icon size={23} /></span><h2>{title}</h2><p>{message}</p>{action}</div>
}

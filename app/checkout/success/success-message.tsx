"use client"

import { useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase-browser"

export function ClearCart() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    void supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error("Could not identify the account after checkout.", error)
        return
      }
      if (!data.user) return
      try {
        window.localStorage.removeItem(`accesscraft-cart-${data.user.id}`)
      } catch (storageError) {
        console.error("Could not clear the paid shopping bag.", storageError)
      }
    })
  }, [])

  return null
}

"use client"

import { useState, type FormEvent } from "react"
import { ArrowRight, LockKeyhole, Store, Truck, UserRound } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase-browser"

export type AccountRole = "customer" | "delivery" | "artisan"

export type AccountProfile = {
  id: string
  display_name: string
  account_role: AccountRole
  email?: string
}

const roles: { id: AccountRole; label: string; description: string }[] = [
  { id: "customer", label: "Customer", description: "Shop handmade products" },
  { id: "delivery", label: "Delivery partner", description: "Delivery workspace" },
  { id: "artisan", label: "Artisan", description: "Manage your products" },
]

export function AccountAuth({
  onComplete,
  onGuest,
}: {
  onComplete: (profile: AccountProfile) => void
  onGuest: () => void
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [role, setRole] = useState<AccountRole>("customer")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const supabase = getSupabaseBrowserClient()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setMessage("Account services are not configured. Add your Supabase URL and public key.")
      return
    }

    setBusy(true)
    setMessage("")
    try {
      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              display_name: name.trim(),
              account_role: role,
            },
          },
        })
        if (error) throw error

        if (!data.session) {
          setMessage("Check your email to confirm your new account, then sign in.")
          return
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (error) throw error
      }

      const { data: userResult, error: userError } =
        await supabase.auth.getUser()
      if (userError) throw userError
      if (!userResult.user) throw new Error("Could not verify your account.")

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, account_role")
        .eq("id", userResult.user.id)
        .single()

      if (profileError) {
        console.error("Could not load the signed-in user's profile.", profileError)
        throw new Error(
          "Could not load your account profile. Run all four Supabase migrations in the README, in order, then sign in again.",
        )
      }

      if (
        profile.account_role !== "customer" &&
        profile.account_role !== "delivery" &&
        profile.account_role !== "artisan"
      ) {
        throw new Error("This account has an unsupported account type.")
      }

      onComplete({
        ...profile,
        email: userResult.user.email ?? "",
      } as AccountProfile)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The account request failed.",
      )
    } finally {
      setBusy(false)
    }
  }

  const switchMode = () => {
    setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"))
    setMessage("")
  }

  return (
    <div className="account-page">
      <section className="panel account-card">
        <div className="account-heading">
          <span className="account-icon">
            <LockKeyhole size={21} />
          </span>
          <span className="eyebrow">YOUR ACCESSCRAFT ACCOUNT</span>
          <h1>{mode === "sign-in" ? "Welcome back" : "Create your account"}</h1>
          <p>
            {mode === "sign-in"
              ? "Sign in to open your saved products and orders."
              : "Choose the account type you want to use."}
          </p>
        </div>

        <form className="account-form" onSubmit={submit}>
          {mode === "sign-up" && (
            <>
              <label className="field">
                <span>Your name</span>
                <input
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              <fieldset className="account-role-picker">
                <legend>I want to join as</legend>
                {roles.map((item) => {
                  const Icon =
                    item.id === "customer"
                      ? UserRound
                      : item.id === "delivery"
                        ? Truck
                        : Store
                  return (
                    <label
                      className={`account-role-option${role === item.id ? " selected" : ""}`}
                      key={item.id}
                    >
                      <input
                        type="radio"
                        name="account-role"
                        value={item.id}
                        checked={role === item.id}
                        onChange={() => setRole(item.id)}
                      />
                      <Icon size={19} />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            </>
          )}

          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              minLength={8}
              maxLength={72}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {message && (
            <p className="account-message" role="status">
              {message}
            </p>
          )}

          <button
            className="button button-primary full-width"
            disabled={busy || !supabase}
            type="submit"
          >
            {busy
              ? "Please wait..."
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
            <ArrowRight size={16} />
          </button>
        </form>

        <button className="account-link" onClick={switchMode} type="button">
          {mode === "sign-in"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
        <button className="account-guest-link" onClick={onGuest} type="button">
          Continue shopping as a guest
        </button>
      </section>
    </div>
  )
}

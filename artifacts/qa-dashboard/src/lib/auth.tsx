/**
 * Authentication facade. Production uses Clerk; VITE_AUTH_MODE=dev enables a
 * local "sign in as <email>" mode (the API must also run with AUTH_MODE=dev,
 * which it refuses in production).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ClerkProvider, useAuth as useClerkAuth, useUser as useClerkUser, useClerk, Show,
} from "@clerk/react";

export const AUTH_MODE: "clerk" | "dev" = import.meta.env.VITE_AUTH_MODE === "dev" ? "dev" : "clerk";
const DEV_KEY = "eresearch.devUser";
const API_BASE = import.meta.env.VITE_API_URL ?? "";

function readDevUser(): string | null {
  try {
    return localStorage.getItem(DEV_KEY);
  } catch {
    return null;
  }
}

if (AUTH_MODE === "dev" && typeof window !== "undefined") {
  // Attach the dev identity to every API call, including the existing ranking pages.
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const user = readDevUser();
    if (user && (url.startsWith("/api") || (API_BASE && url.startsWith(API_BASE)))) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("x-dev-user", user);
      return orig(input, { ...init, headers });
    }
    return orig(input, init);
  };
}

type DevCtx = { email: string | null; setEmail: (e: string | null) => void };
const DevContext = createContext<DevCtx>({ email: null, setEmail: () => {} });

function DevProvider({ children }: { children: ReactNode }) {
  const [email, setEmailState] = useState<string | null>(readDevUser);
  const setEmail = (e: string | null) => {
    try {
      if (e) localStorage.setItem(DEV_KEY, e);
      else localStorage.removeItem(DEV_KEY);
    } catch {
      /* storage unavailable */
    }
    setEmailState(e);
  };
  return <DevContext.Provider value={{ email, setEmail }}>{children}</DevContext.Provider>;
}

export function AuthProvider({ children, navigate }: { children: ReactNode; navigate: (to: string, replace?: boolean) => void }) {
  if (AUTH_MODE === "dev") return <DevProvider>{children}</DevProvider>;
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY (or set VITE_AUTH_MODE=dev for local evaluation)");
  return (
    <ClerkProvider
      publishableKey={key}
      proxyUrl={import.meta.env.VITE_CLERK_PROXY_URL}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, true)}
    >
      {children}
    </ClerkProvider>
  );
}

export function SignedIn({ children }: { children: ReactNode }) {
  if (AUTH_MODE === "dev") return useContext(DevContext).email ? <>{children}</> : null;
  return <Show when="signed-in">{children}</Show>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  if (AUTH_MODE === "dev") return useContext(DevContext).email ? null : <>{children}</>;
  return <Show when="signed-out">{children}</Show>;
}

export type AuthUser = { id: string; name: string; email: string; imageUrl?: string };

export function useAuthUser(): { user: AuthUser | null; signOut: () => void } {
  if (AUTH_MODE === "dev") {
    const { email, setEmail } = useContext(DevContext);
    return { user: email ? { id: email, name: email.split("@")[0], email } : null, signOut: () => setEmail(null) };
  }
  const { user } = useClerkUser();
  const clerk = useClerk();
  return {
    user: user ? {
      id: user.id,
      name: user.fullName || user.username || user.primaryEmailAddress?.emailAddress || "",
      email: user.primaryEmailAddress?.emailAddress ?? "",
      imageUrl: user.imageUrl,
    } : null,
    signOut: () => void clerk.signOut(),
  };
}

/** Drop-in for Clerk's useAuth() used by the ranking pages. */
export function useAuth(): { getToken: () => Promise<string | null> } {
  if (AUTH_MODE === "dev") return { getToken: async () => null };
  return useClerkAuth();
}

/** Clears cached queries when the signed-in identity changes. */
export function useIdentityKey(onChange: () => void) {
  const { user } = useAuthUser();
  const id = user?.id ?? null;
  const [prev, setPrev] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (prev !== undefined && prev !== id) onChange();
    setPrev(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
}

export function useDevSignIn() {
  return useContext(DevContext).setEmail;
}

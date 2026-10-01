import { useState } from "react";
import { SignIn } from "@clerk/react";
import { AUTH_MODE, useDevSignIn } from "@/lib/auth";
import { inputCls } from "@/components/research/common";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function DevSignIn() {
  const signIn = useDevSignIn();
  const [email, setEmail] = useState("");
  return (
    <form className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6" onSubmit={(e) => { e.preventDefault(); if (email.includes("@")) signIn(email.trim().toLowerCase()); }}>
      <div>
        <h1 className="text-lg font-semibold">Development sign-in</h1>
        <p className="text-sm text-muted-foreground">AUTH_MODE=dev — enter any registered staff email. Never enable this mode in production.</p>
      </div>
      <input className={inputCls} type="email" required placeholder="name@university.edu" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      <button className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">Sign in</button>
    </form>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {AUTH_MODE === "dev" ? <DevSignIn /> : <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />}
    </div>
  );
}

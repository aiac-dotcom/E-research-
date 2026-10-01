import { SignUp } from "@clerk/react";
import { Redirect } from "wouter";
import { AUTH_MODE } from "@/lib/auth";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
  if (AUTH_MODE === "dev") return <Redirect to="/sign-in" />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

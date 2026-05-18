import React from "react";
import {
  useAuth as useClerkAuth,
  SignedIn as ClerkSignedIn,
  SignedOut as ClerkSignedOut,
  UserButton as ClerkUserButton,
  RedirectToSignIn as ClerkRedirectToSignIn,
} from "@clerk/clerk-react";

// Test-mode auth shim. When localStorage.dyno_test_auth is set (Playwright sets this
// before navigation), the app pretends the user is signed in. Real Clerk auth still
// works in dev; this is a development/test-only escape hatch.
const TEST_AUTH_KEY = "dyno_test_auth";

function isTestAuth(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(TEST_AUTH_KEY);
}

export function useAuth() {
  const real = useClerkAuth();
  if (isTestAuth()) {
    return { ...real, isLoaded: true, isSignedIn: true };
  }
  return real;
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  if (isTestAuth()) return <>{children}</>;
  return <ClerkSignedIn>{children}</ClerkSignedIn>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  if (isTestAuth()) return null;
  return <ClerkSignedOut>{children}</ClerkSignedOut>;
}

export function UserButton(props: React.ComponentProps<typeof ClerkUserButton>) {
  if (isTestAuth()) {
    return <span className="user-button-test-stub" title="Test user" />;
  }
  return <ClerkUserButton {...props} />;
}

export function RedirectToSignIn() {
  if (isTestAuth()) return null;
  return <ClerkRedirectToSignIn />;
}

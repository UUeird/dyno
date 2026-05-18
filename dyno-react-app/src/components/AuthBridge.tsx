import React from "react";
import { useAuth } from "@clerk/clerk-react";
import { setTokenGetter } from "../lib/api";

// Registers Clerk's getToken with the api module so axios can attach Bearer tokens.
// Must render inside <ClerkProvider>.
export default function AuthBridge() {
  const { getToken, isLoaded } = useAuth();
  React.useEffect(() => {
    if (!isLoaded) return;
    setTokenGetter(() => getToken());
  }, [getToken, isLoaded]);
  return null;
}

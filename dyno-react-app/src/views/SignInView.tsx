import React from "react";
import { SignIn } from "@clerk/clerk-react";

export default function SignInView() {
  return (
    <div className="view sign-in-view">
      <h1 className="sign-in-title">Sign in to Dyno</h1>
      <SignIn
        signUpUrl="/sign-up"
        routing="path"
        path="/sign-in"
        forceRedirectUrl="/"
      />
    </div>
  );
}

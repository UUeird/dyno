import React from "react";
import { SignUp } from "@clerk/clerk-react";

export default function SignUpView() {
  return (
    <div className="view sign-in-view">
      <h1 className="sign-in-title">Create your Dyno account</h1>
      <SignUp
        signInUrl="/sign-in"
        routing="path"
        path="/sign-up"
        forceRedirectUrl="/"
      />
    </div>
  );
}

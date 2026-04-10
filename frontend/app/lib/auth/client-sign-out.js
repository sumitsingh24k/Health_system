"use client";

import { signOut } from "next-auth/react";

export const AUTH_SIGN_OUT_CALLBACK = "/login";

export function signOutFromApp() {
  return signOut({ callbackUrl: AUTH_SIGN_OUT_CALLBACK });
}

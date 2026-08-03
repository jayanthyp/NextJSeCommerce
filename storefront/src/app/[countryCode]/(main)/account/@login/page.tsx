import { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"
import { SITE_NAME } from "@lib/constants"

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to your ${SITE_NAME} account.`,
}

export default function Login() {
  return <LoginTemplate />
}

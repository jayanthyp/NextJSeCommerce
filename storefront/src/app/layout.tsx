import { getBaseURL } from "@lib/util/env"
import { getTheme } from "@lib/data/cookies"
import { Metadata } from "next"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

// Runs before paint (inline, first thing in <body>) so a "system" preference
// resolves to the right theme without a flash of the wrong one — the cookie
// alone can't tell us the OS preference server-side, only the client can.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = document.cookie.match(/(?:^|; )_medusa_theme=([^;]*)/);
    var theme = stored ? decodeURIComponent(stored[1]) : "system";
    var dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`

export default async function RootLayout(props: { children: React.ReactNode }) {
  const theme = await getTheme()

  return (
    <html lang="en" className={theme === "dark" ? "dark" : undefined}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}

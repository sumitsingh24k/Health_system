import "../globals.css";
import Providers from "@/app/components/providers";
import ConditionalAppShell from "@/app/components/conditional-app-shell";

export const metadata = {
  title: "JanSetu",
  description: "JanSetu — public health monitoring and response",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        <Providers>
          <ConditionalAppShell>{children}</ConditionalAppShell>
        </Providers>
      </body>
    </html>
  );
}

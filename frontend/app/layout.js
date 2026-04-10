import "../globals.css";
import Providers from "@/app/components/providers";

export const metadata = {
  title: "Health System",
  description: "Healthcare monitoring platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

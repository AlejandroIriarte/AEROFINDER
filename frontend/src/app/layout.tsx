// =============================================================================
// AEROFINDER Frontend — Layout raíz
// Providers globales: fuente Inter, metadata, hidratación del store Zustand,
// PWA (manifest, meta tags, service worker).
// =============================================================================

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import Script from "next/script";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AEROFINDER",
  description: "Sistema de búsqueda de personas desaparecidas con drones e IA",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js').catch(console.error);
            }
          `}
        </Script>
        {/* AuthProvider hidrata el store de Zustand y restaura la sesión */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

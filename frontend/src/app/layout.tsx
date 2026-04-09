// =============================================================================
// AEROFINDER Frontend — Layout raíz
// Providers globales: fuente Inter, metadata, hidratación del store Zustand.
// =============================================================================

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AEROFINDER",
  description: "Sistema de búsqueda de personas desaparecidas con drones e IA",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        {/* AuthProvider hidrata el store de Zustand y restaura la sesión */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

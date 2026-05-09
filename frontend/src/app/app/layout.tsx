import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aerofinder — Campo",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header compacto */}
      <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
          <svg
            className="h-4 w-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </div>
        <span className="text-sm font-bold text-gray-900">AEROFINDER</span>
      </header>
      <main className="mx-auto max-w-lg p-4">{children}</main>
    </div>
  );
}

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message = "Cargando…" }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

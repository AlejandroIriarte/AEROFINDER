// =============================================================================
// AEROFINDER Frontend — Componente FormField reutilizable
// Input genérico con validaciones, error display, y accesibilidad.
// =============================================================================

import React from "react";

interface FormFieldProps {
  id: string;
  label?: string;
  type?: "text" | "email" | "password" | "number" | "date" | "tel" | "url";
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  icon?: React.ReactNode;
  helperText?: string;
  maxLength?: number;
  showCharCount?: boolean;
  onShowPassword?: () => void;
  showPasswordButton?: boolean;
}

export function FormField({
  id,
  label,
  type = "text",
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  placeholder,
  autoComplete,
  icon,
  helperText,
  maxLength,
  showCharCount = false,
  onShowPassword,
  showPasswordButton = false,
}: FormFieldProps) {
  const isPassword = type === "password";

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor={id}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {showCharCount && maxLength && (
            <span className="text-xs text-gray-500">
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      )}

      <div className="relative">
        {/* Icono izquierdo */}
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </div>
        )}

        {/* Input */}
        <input
          id={id}
          type={isPassword && showPasswordButton ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 ${
            icon ? "pl-10" : ""
          } ${
            isPassword && showPasswordButton ? "pr-12" : ""
          } ${
            error
              ? "border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500"
              : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          } ${disabled ? "cursor-not-allowed bg-gray-100" : ""}`}
        />

        {/* Botón mostrar/ocultar contraseña */}
        {isPassword && showPasswordButton && (
          <button
            type="button"
            onClick={onShowPassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="Toggle password visibility"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        )}
      </div>

      {/* Mensaje de error */}
      {error && (
        <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}

      {/* Helper text */}
      {helperText && !error && (
        <p className="mt-1 text-xs text-gray-500">{helperText}</p>
      )}
    </div>
  );
}

// frontend/src/lib/photo-validator.ts
// Valida archivos de imagen en el cliente antes de subir a MinIO.
// Verifica tipo, tamaño y dimensiones mínimas para InsightFace buffalo_l.
// No hace detección de rostro (eso lo hace el backend AI).

export interface PhotoValidationResult {
  valid:      boolean;
  errors:     string[];
  warnings:   string[];
  previewUrl: string | null;
  dimensions: { width: number; height: number } | null;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_DIMENSION_PX   = 200;               // mínimo para InsightFace
const WARN_DIMENSION_PX  = 400;               // por debajo avisa baja calidad
const ALLOWED_TYPES      = ["image/jpeg", "image/png", "image/webp"];

export async function validatePhoto(file: File): Promise<PhotoValidationResult> {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // Tipo de archivo
  if (!ALLOWED_TYPES.includes(file.type)) {
    errors.push("Formato no válido — usar JPG, PNG o WEBP");
  }

  // Tamaño máximo
  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(
      `Archivo muy grande — máximo 10 MB (actual: ${(file.size / 1024 / 1024).toFixed(1)} MB)`
    );
  }

  // Tamaño mínimo (foto muy chica = probablemente baja calidad)
  if (file.size < 20 * 1024) {
    warnings.push("El archivo es muy pequeño — puede que la calidad no sea suficiente para la IA");
  }

  // Dimensiones — solo si no hubo errores de tipo/tamaño
  let dimensions: { width: number; height: number } | null = null;
  let previewUrl: string | null = null;

  if (!errors.some((e) => e.startsWith("Formato") || e.startsWith("Archivo muy grande"))) {
    try {
      const result = await loadImageDimensions(file);
      dimensions = { width: result.width, height: result.height };
      previewUrl = result.objectUrl;

      if (result.width < MIN_DIMENSION_PX || result.height < MIN_DIMENSION_PX) {
        errors.push(
          `Resolución muy baja — mínimo ${MIN_DIMENSION_PX}×${MIN_DIMENSION_PX}px ` +
          `(actual: ${result.width}×${result.height}px)`
        );
      } else if (result.width < WARN_DIMENSION_PX || result.height < WARN_DIMENSION_PX) {
        warnings.push("Resolución baja — una foto más nítida mejora la precisión del reconocimiento");
      }
    } catch {
      errors.push("No se pudo leer la imagen — puede estar corrupta");
    }
  }

  return { valid: errors.length === 0, errors, warnings, previewUrl, dimensions };
}

// Limpia la URL de objeto cuando ya no se necesita la vista previa
export function revokePreview(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function loadImageDimensions(
  file: File
): Promise<{ width: number; height: number; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img       = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, objectUrl });
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Cannot load image")); };
    img.src = objectUrl;
  });
}

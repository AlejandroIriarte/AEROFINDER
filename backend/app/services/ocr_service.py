# =============================================================================
# AEROFINDER Backend — OcrService
# Extrae campos estructurados de fotos de documentos (CI boliviana, pasaporte).
# Usa PaddleOCR con CPU. Se inicializa lazy para no bloquear el arranque.
# =============================================================================

import logging
import re
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class OcrResult:
    document_type: str          # "ci_boliviana" | "passport" | "other"
    full_name: Optional[str]
    date_of_birth: Optional[str]  # ISO YYYY-MM-DD
    gender: Optional[str]         # "M" | "F"
    document_number: Optional[str]
    address: Optional[str]


class OcrService:
    """
    Singleton para extracción de texto de documentos de identidad.
    PaddleOCR se inicializa en la primera llamada (~3-5 segundos).
    """

    def __init__(self) -> None:
        self._reader = None

    def _get_reader(self):
        if self._reader is None:
            try:
                from paddleocr import PaddleOCR  # import lazy para no bloquear arranque
                self._reader = PaddleOCR(
                    use_angle_cls=True,
                    lang="es",
                    use_gpu=False,
                    show_log=False,
                )
                logger.info("PaddleOCR inicializado correctamente")
            except Exception:
                logger.error("Error al inicializar PaddleOCR", exc_info=True)
                raise
        return self._reader

    def extract_document_fields(self, image_bytes: bytes) -> OcrResult:
        """
        Lee la imagen y extrae campos del documento.
        Detecta automáticamente si es CI boliviana o pasaporte.
        """
        try:
            reader = self._get_reader()
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("No se pudo decodificar la imagen")

            ocr_result = reader.ocr(img, cls=True)
            if not ocr_result or not ocr_result[0]:
                return OcrResult(
                    document_type="other",
                    full_name=None,
                    date_of_birth=None,
                    gender=None,
                    document_number=None,
                    address=None,
                )

            # Filtrar líneas con confianza > 0.5
            lines = [
                item[1][0]
                for item in ocr_result[0]
                if item[1][1] > 0.5
            ]
            text = "\n".join(lines)

            if self._is_passport(lines):
                return self._parse_passport(text, lines)
            return self._parse_ci_boliviana(text, lines)

        except Exception:
            logger.error("Error en extracción OCR de documento", exc_info=True)
            raise

    # ── Detección de tipo ────────────────────────────────────────────────────

    def _is_passport(self, lines: list[str]) -> bool:
        """Detecta pasaporte por texto explícito o líneas MRZ."""
        for line in lines:
            upper = line.upper().replace(" ", "")
            if "PASSPORT" in upper or "PASAPORTE" in upper:
                return True
            # Línea MRZ: solo mayúsculas + dígitos + '<', longitud 44
            if len(line) >= 30 and re.match(r'^[A-Z0-9<\s]+$', line):
                clean = line.replace(" ", "")
                if len(clean) >= 30 and "<" in clean:
                    return True
        return False

    # ── Parser: CI boliviana ─────────────────────────────────────────────────

    def _parse_ci_boliviana(self, text: str, lines: list[str]) -> OcrResult:
        full_name   = self._extract_name_ci(text, lines)
        dob         = self._extract_date(text)
        gender      = self._extract_gender(text)
        doc_number  = self._extract_ci_number(text)
        address     = self._extract_address(text)

        return OcrResult(
            document_type="ci_boliviana",
            full_name=full_name,
            date_of_birth=dob,
            gender=gender,
            document_number=doc_number,
            address=address,
        )

    def _extract_name_ci(self, text: str, lines: list[str]) -> Optional[str]:
        # Intenta extraer de etiquetas APELLIDO(S) + NOMBRE(S)
        ap = re.search(r'APELLIDOS?\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)', text, re.IGNORECASE)
        nm = re.search(r'NOMBRES?\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)', text, re.IGNORECASE)
        if ap and nm:
            apellidos = ap.group(1).strip()
            nombres   = nm.group(1).strip()
            return f"{apellidos} {nombres}".strip()
        # Fallback: línea en mayúsculas con al menos 2 palabras, sin dígitos
        for line in lines:
            if (
                line.isupper()
                and len(line.split()) >= 2
                and not re.search(r'\d', line)
                and len(line) > 6
            ):
                return line.strip()
        return None

    def _extract_date(self, text: str) -> Optional[str]:
        # Formato DD/MM/YYYY o DD-MM-YYYY con etiqueta opcional
        patterns = [
            r'(?:NAC(?:IMIENTO)?\s*:?\s*)(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})',
            r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})',
        ]
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                day, month, year = m.group(1), m.group(2), m.group(3)
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        return None

    def _extract_gender(self, text: str) -> Optional[str]:
        m = re.search(r'SEXO\s*:?\s*([MF])', text, re.IGNORECASE)
        if m:
            return m.group(1).upper()
        if re.search(r'\bMASCULINO\b', text, re.IGNORECASE):
            return "M"
        if re.search(r'\bFEMENINO\b', text, re.IGNORECASE):
            return "F"
        return None

    def _extract_ci_number(self, text: str) -> Optional[str]:
        m = re.search(r'\b(\d{7,9})\b', text)
        return m.group(1) if m else None

    def _extract_address(self, text: str) -> Optional[str]:
        m = re.search(r'DOMICILIO\s*:?\s*([A-ZÁÉÍÓÚÑ0-9][^\n]{3,80})', text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        return None

    # ── Parser: Pasaporte (MRZ ICAO 9303) ───────────────────────────────────

    def _parse_passport(self, text: str, lines: list[str]) -> OcrResult:
        full_name  = None
        dob        = None
        gender     = None
        doc_number = None

        # Buscar líneas MRZ (solo A-Z, 0-9, <, longitud >= 30)
        mrz = [
            line.replace(" ", "")
            for line in lines
            if len(line.replace(" ", "")) >= 30
            and re.match(r'^[A-Z0-9<]+$', line.replace(" ", ""))
            and "<" in line
        ]

        if len(mrz) >= 2:
            line1, line2 = mrz[0], mrz[1]

            # Línea 1: P<BOLSURNAME<<GIVEN<NAME<...
            name_match = re.match(r'P[<A-Z](?:BOL)?([A-Z<]+)', line1)
            if name_match:
                name_part = name_match.group(1)
                parts = name_part.split("<<", 1)
                if len(parts) == 2:
                    surname = parts[0].replace("<", " ").strip()
                    given   = parts[1].replace("<", " ").strip()
                    full_name = f"{surname} {given}".strip()

            # Línea 2: posición 0-8=doc_no, 13-18=DOB(YYMMDD), 20=gender
            if len(line2) >= 21:
                doc_number = line2[:9].replace("<", "").strip() or None
                dob_str    = line2[13:19]
                gender_ch  = line2[20]

                if dob_str.isdigit():
                    yy, mm, dd = int(dob_str[:2]), dob_str[2:4], dob_str[4:6]
                    year = 1900 + yy if yy > 24 else 2000 + yy
                    dob  = f"{year}-{mm}-{dd}"

                if gender_ch in ("M", "F"):
                    gender = gender_ch

        return OcrResult(
            document_type="passport",
            full_name=full_name,
            date_of_birth=dob,
            gender=gender,
            document_number=doc_number,
            address=None,
        )


# Singleton compartido
ocr_service = OcrService()

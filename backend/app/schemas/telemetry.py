# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Telemetría de drones
# Valida el payload que llega desde la app Android DJI y define
# el mensaje que se emite al frontend vía WebSocket.
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class TelemetryIngest(BaseModel):
    """
    Payload de telemetría enviado por la app Android DJI al backend.
    Tanto el WebSocket /ws/ingest/telemetry como el POST /telemetry/ingest
    aceptan este schema.
    """

    drone_id: uuid.UUID
    stream_key: str
    mission_id: uuid.UUID
    # Timestamp Unix en segundos con decimales (e.g. 1712345678.123)
    timestamp: float
    lat: float
    lng: float
    altitude_m: float
    heading_deg: float
    speed_mps: float
    battery_pct: int

    @field_validator("lat")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        if not -90.0 <= v <= 90.0:
            raise ValueError("lat debe estar entre -90 y 90")
        return v

    @field_validator("lng")
    @classmethod
    def validate_lng(cls, v: float) -> float:
        if not -180.0 <= v <= 180.0:
            raise ValueError("lng debe estar entre -180 y 180")
        return v

    @field_validator("altitude_m")
    @classmethod
    def validate_altitude(cls, v: float) -> float:
        if v < 0:
            raise ValueError("altitude_m debe ser >= 0")
        return v

    @field_validator("battery_pct")
    @classmethod
    def validate_battery(cls, v: int) -> int:
        if not 0 <= v <= 100:
            raise ValueError("battery_pct debe estar entre 0 y 100")
        return v

    @field_validator("heading_deg")
    @classmethod
    def validate_heading(cls, v: float) -> float:
        if not 0.0 <= v <= 360.0:
            raise ValueError("heading_deg debe estar entre 0 y 360")
        return v

    @field_validator("speed_mps")
    @classmethod
    def validate_speed(cls, v: float) -> float:
        if v < 0:
            raise ValueError("speed_mps debe ser >= 0")
        return v


class TelemetryWSMessage(BaseModel):
    """
    Mensaje emitido al frontend por ws_manager.broadcast()
    en la sala telemetry:{drone_id}.
    Corresponde al tipo 'telemetry' del protocolo WebSocket del sistema.
    """

    type: str = "telemetry"
    drone_id: uuid.UUID
    mission_id: uuid.UUID
    lat: float
    lng: float
    altitude_m: float
    battery_pct: int
    heading_deg: float
    speed_mps: float
    # Timestamp Unix en segundos — mismo valor que llega del dispositivo
    timestamp: float

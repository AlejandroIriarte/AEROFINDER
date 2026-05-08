# =============================================================================
# AEROFINDER Backend — WebSocket ConnectionManager
#
# Gestiona conexiones agrupadas por "room" (sala).
# Cada sala corresponde a un recurso: misión, dron, canal de alertas.
#
# Uso desde otros módulos (BE-5, AI-1, AI-3):
#   from app.core.ws_manager import ws_manager
#   await ws_manager.broadcast("mission:uuid", {"type": "status_update", ...})
# =============================================================================

import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Gestiona conexiones WebSocket agrupadas por sala (room_id).
    Thread-safe dentro del mismo event loop de asyncio (sin locks adicionales).
    """

    def __init__(self) -> None:
        # room_id → conjunto de WebSockets activos en esa sala
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, room_id: str) -> None:
        """Acepta la conexión y la registra en la sala."""
        await websocket.accept()
        self._rooms[room_id].add(websocket)
        logger.debug("WS conectado room=%s total=%d", room_id, len(self._rooms[room_id]))

    def disconnect(self, websocket: WebSocket, room_id: str) -> None:
        """Elimina la conexión de la sala. Seguro si ya no existía."""
        self._rooms[room_id].discard(websocket)
        logger.debug("WS desconectado room=%s total=%d", room_id, len(self._rooms[room_id]))

    async def broadcast(self, room_id: str, message: dict[str, Any]) -> None:
        """
        Envía un mensaje JSON a todos los clientes de la sala.
        Elimina automáticamente las conexiones muertas.
        """
        connections = set(self._rooms.get(room_id, set()))
        dead: set[WebSocket] = set()

        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                logger.debug("WS muerto en room=%s, marcando para eliminar", room_id)
                dead.add(ws)

        for ws in dead:
            self._rooms[room_id].discard(ws)

    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        """Envía un mensaje a un único cliente (ej: confirmación de conexión)."""
        try:
            await websocket.send_json(message)
        except Exception:
            logger.error("Error al enviar mensaje personal por WS", exc_info=True)

    def room_size(self, room_id: str) -> int:
        """Retorna el número de conexiones activas en una sala."""
        return len(self._rooms.get(room_id, set()))


# Singleton compartido por toda la aplicación
ws_manager = ConnectionManager()

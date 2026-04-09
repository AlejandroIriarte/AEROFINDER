// =============================================================================
// AEROFINDER Frontend — Hook useWebSocket
// Reconexión automática con backoff exponencial y keepalive ping cada 30s.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WSMessage } from "@/lib/types";

// Pasos del backoff en milisegundos: 1s→2s→4s→8s→30s
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 30_000];
const PING_INTERVAL_MS = 30_000;

interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WSMessage | null;
  send: (data: string | object) => void;
}

/**
 * Hook de WebSocket con reconexión automática y keepalive.
 *
 * @param url       URL completa del WebSocket (ej: ws://localhost:8000/ws/alerts?token=...)
 * @param onMessage Callback invocado con cada mensaje recibido del servidor
 */
export function useWebSocket(
  url: string | null,
  onMessage?: (message: WSMessage) => void
): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  const wsRef        = useRef<WebSocket | null>(null);
  const backoffIdx   = useRef(0);
  const pingTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted    = useRef(true);
  const onMessageRef = useRef(onMessage);

  // Mantener referencia al callback sin re-crear el efecto
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearTimers = useCallback(() => {
    if (pingTimer.current)   clearInterval(pingTimer.current);
    if (reconnTimer.current) clearTimeout(reconnTimer.current);
    pingTimer.current   = null;
    reconnTimer.current = null;
  }, []);

  const connect = useCallback(() => {
    if (!url || !isMounted.current) return;

    // Cerrar conexión anterior si existe
    if (wsRef.current) {
      wsRef.current.onclose = null; // evitar doble reconexión
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted.current) return;
        setIsConnected(true);
        backoffIdx.current = 0; // resetear backoff al conectar

        // Iniciar keepalive ping
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!isMounted.current) return;
        try {
          const parsed: WSMessage = JSON.parse(event.data as string);
          // Ignorar pong del servidor (es solo keepalive)
          if (parsed.type === "pong") return;
          setLastMessage(parsed);
          onMessageRef.current?.(parsed);
        } catch {
          // Mensaje no-JSON: ignorar silenciosamente
        }
      };

      ws.onclose = () => {
        if (!isMounted.current) return;
        clearTimers();
        setIsConnected(false);

        // Programar reconexión con backoff exponencial
        const delay = BACKOFF_MS[Math.min(backoffIdx.current, BACKOFF_MS.length - 1)];
        backoffIdx.current = Math.min(backoffIdx.current + 1, BACKOFF_MS.length - 1);
        reconnTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onerror siempre es seguido de onclose; la reconexión se maneja ahí
        ws.close();
      };
    } catch {
      // Fallo al crear el WebSocket (URL inválida, etc.)
      const delay = BACKOFF_MS[Math.min(backoffIdx.current, BACKOFF_MS.length - 1)];
      backoffIdx.current = Math.min(backoffIdx.current + 1, BACKOFF_MS.length - 1);
      reconnTimer.current = setTimeout(connect, delay);
    }
  }, [url, clearTimers]);

  // Conectar al montar; desconectar al desmontar
  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect, clearTimers]);

  // Enviar mensaje al servidor
  const send = useCallback((data: string | object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      wsRef.current.send(payload);
    }
  }, []);

  return { isConnected, lastMessage, send };
}

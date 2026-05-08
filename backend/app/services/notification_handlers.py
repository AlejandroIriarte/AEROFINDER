# =============================================================================
# AEROFINDER Backend — Handlers de envío de notificaciones
#
# Tres canales: push (FCM), email (SendGrid), SMS (Twilio).
# En modo desarrollo (sin API keys): loguea en consola y retorna True.
# En producción: llama a la API externa con httpx y retorna True/False.
# =============================================================================

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Timeout para llamadas a APIs externas
_HTTP_TIMEOUT = 10.0


async def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: dict[str, Any],
) -> bool:
    """
    Envía una notificación push vía FCM Legacy API.
    Si FCM_SERVER_KEY no está configurado: loguea en consola y retorna True.
    Retorna True si la API responde 200, False en cualquier otro caso.
    """
    if not settings.fcm_server_key:
        logger.info(
            "[DESARROLLO] Push notification omitida (FCM_SERVER_KEY no configurado): "
            "token=%s title=%r body=%r",
            token[:12] + "..." if len(token) > 12 else token,
            title,
            body,
        )
        return True

    payload = {
        "to": token,
        "notification": {
            "title": title,
            "body": body,
            "sound": "default",
        },
        "data": {str(k): str(v) for k, v in data.items()},
        "priority": "high",
    }

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            response = await client.post(
                "https://fcm.googleapis.com/fcm/send",
                headers={
                    "Authorization": f"key={settings.fcm_server_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code == 200:
            resp_json = response.json()
            # FCM retorna 200 incluso con errores lógicos; verificar failure count
            failure = resp_json.get("failure", 0)
            if failure > 0:
                results = resp_json.get("results", [{}])
                error_msg = results[0].get("error", "desconocido")
                logger.error(
                    "FCM reportó fallo lógico para token=%s error=%s",
                    token[:12] + "...", error_msg,
                )
                return False
            logger.debug("Push enviado exitosamente: token=%s...", token[:12])
            return True

        logger.error(
            "FCM respondió HTTP %d para token=%s body=%s",
            response.status_code, token[:12] + "...", response.text[:200],
        )
        return False
    except httpx.TimeoutException:
        logger.error(
            "Timeout al llamar a FCM para token=%s", token[:12] + "...", exc_info=True
        )
        return False
    except Exception:
        logger.error(
            "Error al enviar push notification a FCM: token=%s",
            token[:12] + "...", exc_info=True,
        )
        return False


async def send_email_notification(
    to_email: str,
    subject: str,
    body_html: str,
) -> bool:
    """
    Envía un email vía API SendGrid v3.
    Si SENDGRID_API_KEY no está configurado: loguea en consola y retorna True.
    Retorna True si la API responde 202, False en cualquier otro caso.
    """
    if not settings.sendgrid_api_key:
        logger.info(
            "[DESARROLLO] Email omitido (SENDGRID_API_KEY no configurado): "
            "to=%s subject=%r",
            to_email, subject,
        )
        return True

    payload = {
        "personalizations": [
            {"to": [{"email": to_email}]},
        ],
        "from": {"email": settings.sendgrid_from_email},
        "subject": subject,
        "content": [
            {"type": "text/html", "value": body_html},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            response = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {settings.sendgrid_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code == 202:
            logger.debug("Email enviado exitosamente a %s", to_email)
            return True

        logger.error(
            "SendGrid respondió HTTP %d para to=%s body=%s",
            response.status_code, to_email, response.text[:200],
        )
        return False
    except httpx.TimeoutException:
        logger.error(
            "Timeout al llamar a SendGrid para to=%s", to_email, exc_info=True
        )
        return False
    except Exception:
        logger.error(
            "Error al enviar email via SendGrid a %s", to_email, exc_info=True
        )
        return False


async def send_sms_notification(
    to_phone: str,
    message: str,
) -> bool:
    """
    Envía un SMS vía API REST de Twilio.
    Si TWILIO_ACCOUNT_SID no está configurado: loguea en consola y retorna True.
    Retorna True si la API responde 2xx, False en cualquier otro caso.
    """
    if not settings.twilio_account_sid:
        logger.info(
            "[DESARROLLO] SMS omitido (TWILIO_ACCOUNT_SID no configurado): "
            "to=%s message=%r",
            to_phone, message[:80],
        )
        return True

    twilio_url = (
        f"https://api.twilio.com/2010-04-01/Accounts"
        f"/{settings.twilio_account_sid}/Messages.json"
    )

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            response = await client.post(
                twilio_url,
                auth=(settings.twilio_account_sid, settings.twilio_auth_token or ""),
                data={
                    "From": settings.twilio_from_number or "",
                    "To": to_phone,
                    "Body": message,
                },
            )

        if response.status_code in (200, 201):
            logger.debug("SMS enviado exitosamente a %s", to_phone)
            return True

        logger.error(
            "Twilio respondió HTTP %d para to=%s body=%s",
            response.status_code, to_phone, response.text[:200],
        )
        return False
    except httpx.TimeoutException:
        logger.error(
            "Timeout al llamar a Twilio para to=%s", to_phone, exc_info=True
        )
        return False
    except Exception:
        logger.error(
            "Error al enviar SMS via Twilio a %s", to_phone, exc_info=True
        )
        return False

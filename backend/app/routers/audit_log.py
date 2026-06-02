# =============================================================================
# AEROFINDER Backend — Router: Auditoría
# Solo admin. La tabla es inmutable (llenada por triggers de PostgreSQL).
# Endpoints: GET /audit-log/
# =============================================================================

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.enums import RoleName
from app.schemas.audit_log import AuditLogResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audit-log", tags=["auditoría"])

_super_admin = require_role(RoleName.super_admin)


@router.get("/", response_model=list[AuditLogResponse])
async def list_audit_log(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: object = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogResponse]:
    """
    Lista los registros de auditoría ordenados por fecha descendente.
    Solo accesible para administradores.
    La tabla es poblada exclusivamente por triggers de PostgreSQL (inmutable
    desde la capa de aplicación).
    """
    try:
        result = await db.execute(
            select(AuditLog)
            .order_by(AuditLog.changed_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all()
    except Exception:
        logger.error("Error al consultar audit_log", exc_info=True)
        raise

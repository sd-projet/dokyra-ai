from fastapi import APIRouter, Depends

from ...domain.entities import Principal
from ..container import Container
from ..deps import current_principal, get_container
from ..schemas import AgentIn, ResumeIn

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/run")
def run(body: AgentIn, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    """Réponse : status = done | needs_approval. Dans ce dernier cas, appeler /agent/resume."""
    return c.agent.run(p.id, body.message, body.thread_id)


@router.post("/resume")
def resume(body: ResumeIn, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    """Valide (approved=true) ou refuse l'action sensible mise en pause par l'agent."""
    return c.agent.resume(p.id, body.approved, body.thread_id)

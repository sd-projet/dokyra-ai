from fastapi import APIRouter, Depends, Query

from ...domain.entities import Principal
from ..container import Container
from ..deps import current_principal, get_container
from ..schemas import CompareModelsIn, to_dict

router = APIRouter(tags=["llm"])


@router.get("/llm/models")
def models(_: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    return {"default": c.settings.llm_model, "available": c.settings.models}


@router.post("/llm/compare")
def compare_models(body: CompareModelsIn, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    """Même question + mêmes passages envoyés à plusieurs modèles : réponse, latence, tokens, coût."""
    r = c.model_compare.execute(body.question, body.models, body.document_ids, p.id)
    return {"question": r["question"], "sources": to_dict(r["passages"]), "runs": to_dict(r["runs"])}


@router.get("/usage")
def usage(days: int = Query(30, ge=1, le=365), p: Principal = Depends(current_principal),
          c: Container = Depends(get_container)):
    """Tokens et coûts : tout pour un administrateur, sa propre consommation sinon."""
    return c.usage.summary(None if p.is_admin else p.id, days)

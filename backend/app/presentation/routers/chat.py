import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ...domain.entities import Principal
from ..container import Container
from ..deps import current_principal, get_container
from ..schemas import AskIn, FeedbackIn, to_dict

router = APIRouter(tags=["chat"])


@router.post("/chat/ask")
def ask(body: AskIn, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    conv, msg, a = c.chat.ask(p.id, body.question, body.document_ids, body.conversation_id, body.structured)
    return {"conversation_id": conv.id, "message_id": msg.id, "answer": a.text, "sources": to_dict(a.sources),
            "cited": a.cited, "key_points": a.key_points, "confidence": a.confidence, "found": a.found,
            "standalone_question": a.standalone_question, "usage": to_dict(a.usage)}


@router.post("/chat/stream")
def ask_stream(body: AskIn, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    events = c.chat.stream(p.id, body.question, body.document_ids, body.conversation_id)
    first = next(events)  # valide la requête (404/422) avant d'ouvrir le flux SSE

    def gen():  # Server-Sent Events : meta, sources, tokens..., done (ou error)
        def sse(name, data):
            return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
        yield sse(*first)
        try:
            for name, data in events:
                yield sse(name, data)
        except Exception as e:  # l'erreur est transmise au client au lieu de couper le flux net
            yield sse("error", {"detail": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/conversations")
def conversations(p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    return to_dict(c.chat.list_conversations(p.id))


@router.get("/conversations/{conversation_id}")
def conversation(conversation_id: str, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    conv, messages = c.chat.get_conversation(p.id, conversation_id)
    return {**to_dict(conv), "messages": to_dict(messages)}


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    c.chat.delete_conversation(p.id, conversation_id)


@router.post("/messages/{message_id}/feedback", status_code=204)
def feedback(message_id: int, body: FeedbackIn, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    c.chat.feedback(p.id, message_id, body.value)

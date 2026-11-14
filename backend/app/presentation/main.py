import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..domain import errors as E
from ..infrastructure.config import Settings
from .container import Container, build_container
from .routers import agent, auth, chat, documents, llm

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# Erreur métier -> code HTTP
STATUS = {E.UnsupportedFormat: 415, E.EmptyDocument: 422, E.DuplicateDocument: 409, E.NotFound: 404,
          E.InvalidCredentials: 401, E.TooManyAttempts: 429, E.ValidationFailed: 422,
          E.LLMError: 502, E.NoPendingApproval: 409}


def create_app(container: Container | None = None) -> FastAPI:
    """`container` peut être injecté (tests) ; sinon il est construit au démarrage."""
    settings = container.settings if container else Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = container or build_container(settings)
        yield

    app = FastAPI(title="Dokyra AI", version="2.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=False,
                       allow_methods=["*"], allow_headers=["*"])
    if container:  # sans lifespan (TestClient hors `with`)
        app.state.container = container

    @app.exception_handler(E.DomainError)
    async def domain_error(_: Request, exc: E.DomainError):
        code = next((c for t, c in STATUS.items() if isinstance(exc, t)), 400)
        body = {"detail": str(exc)}
        if isinstance(exc, E.DuplicateDocument):
            body["existing_id"] = exc.existing_id
        return JSONResponse(body, status_code=code,
                            headers={"WWW-Authenticate": "Bearer"} if code == 401 else None)

    @app.get("/health", tags=["system"])
    def health(request: Request):
        return request.app.state.container.health()

    for r in (auth.router, documents.router, chat.router, agent.router, llm.router):
        app.include_router(r)
    return app


app = create_app()

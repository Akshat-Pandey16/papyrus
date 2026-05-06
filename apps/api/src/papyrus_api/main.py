from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from papyrus_api import __version__
from papyrus_api.api.router import api_router
from papyrus_api.core.config import settings
from papyrus_api.core.errors import register_exception_handlers
from papyrus_api.core.logging import configure_logging
from papyrus_api.lifespan import lifespan
from papyrus_api.middleware.request_id import RequestIdMiddleware


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(
        title="Papyrus API",
        version=__version__,
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    register_exception_handlers(app)
    app.include_router(api_router, prefix="/api")

    return app

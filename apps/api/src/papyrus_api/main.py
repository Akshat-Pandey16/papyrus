from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from papyrus_api import __version__
from papyrus_api.api.router import api_router
from papyrus_api.core.config import settings
from papyrus_api.core.errors import register_exception_handlers
from papyrus_api.core.logging import configure_logging
from papyrus_api.core.telemetry import setup_telemetry
from papyrus_api.lifespan import lifespan
from papyrus_api.middleware.body_size_limit import BodySizeLimitMiddleware
from papyrus_api.middleware.request_id import RequestIdMiddleware
from papyrus_api.middleware.security_headers import SecurityHeadersMiddleware


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(
        title="Papyrus API",
        version=__version__,
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json" if settings.is_development else None,
        lifespan=lifespan,
    )

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=1_048_576,
    )
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    register_exception_handlers(app)
    app.include_router(api_router, prefix="/api")

    setup_telemetry(app)

    return app

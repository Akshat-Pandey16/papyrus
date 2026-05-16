from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from papyrus_api.core.config import settings

if TYPE_CHECKING:
    from fastapi import FastAPI

log = structlog.get_logger(__name__)


def setup_telemetry(app: FastAPI) -> None:
    if not settings.otel_enabled:
        return

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "deployment.environment": settings.papyrus_env.value,
        }
    )
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint)),
    )
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app, excluded_urls="/api/v1/health")
    SQLAlchemyInstrumentor().instrument()
    log.info("telemetry.configured", endpoint=settings.otel_exporter_otlp_endpoint)

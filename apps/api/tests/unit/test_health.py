from __future__ import annotations

from httpx import AsyncClient


async def test_healthz_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/api/v1/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body


async def test_request_id_header_echoed(client: AsyncClient) -> None:
    response = await client.get("/api/v1/healthz")
    assert "x-request-id" in {k.lower() for k in response.headers}

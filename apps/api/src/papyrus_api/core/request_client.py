from __future__ import annotations

import ipaddress
from collections.abc import Iterable
from functools import lru_cache

from fastapi import Request

from papyrus_api.core.config import settings


@lru_cache(maxsize=1)
def _trusted_networks() -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    out: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for raw in settings.trusted_proxies:
        try:
            out.append(ipaddress.ip_network(raw, strict=False))
        except ValueError:
            continue
    return tuple(out)


def _is_trusted(ip: str, nets: Iterable[ipaddress.IPv4Network | ipaddress.IPv6Network]) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in nets)


def client_ip(request: Request) -> str:
    """Return the client IP, honoring X-Forwarded-For only behind a trusted proxy.

    Walks the XFF chain right-to-left and returns the rightmost address that is
    NOT itself in the trusted-proxy allowlist. Falls back to the immediate peer
    if no XFF or the peer is not trusted.
    """
    peer = request.client.host if request.client else "anonymous"
    nets = _trusted_networks()
    if not nets or not _is_trusted(peer, nets):
        return peer

    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer

    chain = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
    for hop in reversed(chain):
        if not _is_trusted(hop, nets):
            return hop
    return chain[0] if chain else peer

from __future__ import annotations

import uvicorn

from papyrus_api.core.config import settings


def main() -> None:
    uvicorn.run(
        "papyrus_api.main:create_app",
        factory=True,
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.is_development,
        log_config=None,
    )


if __name__ == "__main__":
    main()

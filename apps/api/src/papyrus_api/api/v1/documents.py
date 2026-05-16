from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response, status

from papyrus_api.api.deps import CurrentPrincipal, DocumentServiceDep
from papyrus_api.schemas.documents import (
    ConfirmUploadRequest,
    DocumentOut,
    DocumentVersionOut,
    PresignedUploadOut,
    UploadInitiateRequest,
    UploadInitiateResponse,
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post(
    "/uploads",
    response_model=UploadInitiateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def initiate_upload(
    payload: UploadInitiateRequest,
    principal: CurrentPrincipal,
    service: DocumentServiceDep,
) -> UploadInitiateResponse:
    user, organization = principal
    result = await service.initiate_upload(
        organization_id=organization.id,
        user_id=user.id,
        name=payload.name,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        is_anonymous=user.is_anonymous,
    )
    return UploadInitiateResponse(
        document_id=result.document.id,
        storage_object_id=result.storage_object.id,
        upload=PresignedUploadOut(
            url=result.upload.url,
            fields=dict(result.upload.fields),
            bucket=result.upload.bucket,
            key=result.upload.key,
            expires_at=result.upload.expires_at,
        ),
        max_bytes=result.max_bytes,
    )


@router.post(
    "/uploads/{document_id}/confirm",
    response_model=DocumentOut,
)
async def confirm_upload(
    document_id: UUID,
    _payload: ConfirmUploadRequest,
    principal: CurrentPrincipal,
    service: DocumentServiceDep,
) -> DocumentOut:
    _user, organization = principal
    confirmed = await service.confirm_upload(
        organization_id=organization.id,
        document_id=document_id,
    )
    version = DocumentVersionOut(
        id=confirmed.version.id,
        version=confirmed.version.version,
        storage_object_id=confirmed.storage_object.id,
        size_bytes=confirmed.storage_object.size_bytes,
        sha256=confirmed.storage_object.sha256,
    )
    return DocumentOut(
        id=confirmed.document.id,
        name=confirmed.document.name,
        mime_type=confirmed.document.mime_type,
        page_count=confirmed.document.page_count,
        created_at=confirmed.document.created_at,
        current_version=version,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    principal: CurrentPrincipal,
    service: DocumentServiceDep,
) -> Response:
    _user, organization = principal
    await service.delete(organization_id=organization.id, document_id=document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

from __future__ import annotations

import asyncio
from typing import Protocol

from app.core.config import Settings


class ObjectStorage(Protocol):
    async def put(self, key: str, data: bytes, mime: str) -> None: ...

    async def delete(self, key: str) -> None: ...


class MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    async def put(self, key: str, data: bytes, mime: str) -> None:
        self.objects[key] = (data, mime)

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)


class S3Storage:
    def __init__(self, settings: Settings) -> None:
        import boto3

        self._bucket = settings.s3_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )

    async def put(self, key: str, data: bytes, mime: str) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=mime,
        )

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)


def make_storage(settings: Settings) -> ObjectStorage:
    if settings.s3_endpoint and settings.s3_access_key and settings.s3_secret_key:
        return S3Storage(settings)
    return MemoryStorage()

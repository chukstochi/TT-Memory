import boto3
from botocore.config import Config
from app.config import settings

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp",
    "video/mp4", "video/quicktime",
    "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav",
}

def r2_client():
    if not all([settings.r2_access_key_id, settings.r2_secret_access_key,
                settings.r2_bucket_name, settings.r2_endpoint]):
        raise RuntimeError("Cloudflare R2 is not configured in .env")
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )

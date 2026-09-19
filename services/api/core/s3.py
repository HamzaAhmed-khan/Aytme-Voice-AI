import boto3
from botocore.exceptions import ClientError
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class S3Manager:
    def __init__(self):
        self.bucket = settings.S3_BUCKET
        self.available = False
        try:
            if not all([settings.S3_ACCESS_KEY, settings.S3_SECRET_KEY, self.bucket]):
                logger.warning("[S3] Credentials or bucket name missing. Running in degraded mode.")
                return

            self.client = boto3.client(
                's3',
                aws_access_key_id=settings.S3_ACCESS_KEY,
                aws_secret_access_key=settings.S3_SECRET_KEY,
                endpoint_url=settings.S3_ENDPOINT,
            )
            self.validate_bucket()
        except Exception as e:
            logger.error(f"[S3] Failed to initialize client: {str(e)} — running in degraded mode")

    def validate_bucket(self):
        """Proactively verify bucket existence and permissions on startup."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
            self.available = True
            logger.info(f"[S3] Bucket '{self.bucket}' verified.")
        except Exception:
            logger.warning(f"[S3] Bucket '{self.bucket}' not found or inaccessible — running in degraded mode")
            self.available = False

    def upload_artifact(self, file_path: str, object_name: str):
        if not self.available:
            logger.warning(f"[S3] Skipping artifact upload '{object_name}' — bucket not available.")
            return None
        try:
            self.client.upload_file(file_path, self.bucket, object_name)
            logger.info(f"Uploaded {file_path} to s3://{self.bucket}/{object_name}")
            return f"{settings.S3_ENDPOINT}/{self.bucket}/{object_name}" if settings.S3_ENDPOINT else f"https://{self.bucket}.s3.amazonaws.com/{object_name}"
        except Exception as e:
            logger.error(f"S3 Upload failed: {e}")
            return None

    def upload_fileobj(self, data: bytes, object_name: str):
        """Upload raw bytes to S3."""
        if not self.available:
            logger.warning(f"[S3] Skipping fileobj upload '{object_name}' — bucket not available.")
            return None
        try:
            from io import BytesIO
            self.client.upload_fileobj(BytesIO(data), self.bucket, object_name)
            logger.info(f"Uploaded bytes to s3://{self.bucket}/{object_name}")
            return f"{settings.S3_ENDPOINT}/{self.bucket}/{object_name}" if settings.S3_ENDPOINT else f"https://{self.bucket}.s3.amazonaws.com/{object_name}"
        except Exception as e:
            logger.error(f"S3 byte upload failed: {e}")
            return None

    def get_presigned_url(self, object_name: str, expiration=3600):
        if not self.available:
            return None
        try:
            response = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': object_name},
                ExpiresIn=expiration
            )
            return response
        except Exception as e:
            logger.error(f"S3 Presign failed: {e}")
            return None

s3_manager = S3Manager()

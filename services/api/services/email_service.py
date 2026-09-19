"""
Lightweight SMTP Email Service (Gmail App Password)

Replaces Resend/SendGrid with simple SMTP using STARTTLS and app password
for Gmail. Uses synchronous smtplib calls executed in a threadpool to keep
the public API async-compatible.
"""

import logging
import secrets
import smtplib
import asyncio
from email.message import EmailMessage
from typing import Optional
from datetime import datetime, timedelta
from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Send emails via SMTP (Gmail App Password recommended)"""

    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT or 587
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD.get_secret_value() if settings.SMTP_PASSWORD else None
        self.from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER

        if self._is_configured():
            logger.info(f"✓ SMTP configured: host={self.smtp_host}, user={self.smtp_user}")
        else:
            logger.warning("⚠️ SMTP not configured. OTP emails will be logged to console in dev.")

    def _is_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    def _build_message(self, to_email: str, subject: str, html_content: str) -> EmailMessage:
        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = self.from_email
        msg['To'] = to_email
        msg.set_content("""This is an HTML email. Enable HTML view to see content.""")
        msg.add_alternative(html_content, subtype='html')
        return msg

    def _send_smtp(self, to_email: str, subject: str, html_content: str) -> bool:
        """Synchronous SMTP send using STARTTLS. Returns True on success."""
        if not self._is_configured():
            logger.warning(f"SMTP not configured, skipping send to {to_email}")
            logger.info(f"🔑 [DEV] OTP for {to_email}: {subject.split()[0]}")
            return True

        msg = self._build_message(to_email, subject, html_content)

        try:
            with smtplib.SMTP(self.smtp_host, int(self.smtp_port), timeout=20) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            logger.info(f"✓ SMTP email sent to {to_email} via {self.smtp_host}")
            return True
        except Exception as e:
            logger.error(f"SMTP send failed to {to_email}: {e}", exc_info=True)
            return False

    async def _send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        # Run blocking SMTP send in threadpool
        return await asyncio.to_thread(self._send_smtp, to_email, subject, html_content)

    async def send_otp_email(self, to_email: str, otp_code: str) -> bool:
        """Send a 6-digit OTP code via SMTP"""
        subject = f"{otp_code} is your AYTME verification code"
        html_content = f"""
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4f46e5; text-align: center; font-size: 24px; font-weight: 800; margin-bottom: 30px;">AYTME Secure Login</h2>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Hi,</p>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Use the following verification code to sign in to your AYTME account. This code is valid for 10 minutes.</p>
            <div style="text-align: center; margin: 40px 0;">
                <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #1e293b; background: #f8fafc; padding: 15px 30px; border-radius: 12px; border: 2px solid #e2e8f0;">{otp_code}</span>
            </div>
            <p style="font-size: 14px; color: #64748b; margin-top: 40px; text-align: center;">If you didn't request this code, you can safely ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;">
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">&copy; 2026 AYTME. All rights reserved.</p>
        </div>
        """
        success = await self._send_email(to_email, subject, html_content)
        if not success:
            logger.error(f"✗ Failed to send OTP email to {to_email}")
        return success

    async def send_verification_email(self, to_email: str, user_name: str, verification_token: str, frontend_url: Optional[str] = None) -> bool:
        frontend = frontend_url or settings.FRONTEND_URL
        verification_link = f"{frontend}/auth/verify-email?token={verification_token}"
        subject = "Verify Your AYTME Email"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to AYTME! 🎉</h2>
            <p>Hi {user_name},</p>
            <p>Thank you for signing up. Please verify your email address to complete your registration.</p>
            <div style="text-align: center; margin: 30px 0;"><a href="{verification_link}" style="background-color: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a></div>
            <p style="color: #666; font-size: 12px;">Or paste this link: <br><code style="word-break: break-all;">{verification_link}</code></p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 24 hours.</p>
        </div>
        """
        return await self._send_email(to_email, subject, html_content)

    async def send_password_reset_email(self, to_email: str, user_name: str, reset_token: str, frontend_url: Optional[str] = None) -> bool:
        frontend = frontend_url or settings.FRONTEND_URL
        reset_link = f"{frontend}/auth/reset-password?token={reset_token}"
        subject = "Reset Your AYTME Password"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>Hi {user_name},</p>
            <p>You recently requested to reset your AYTME password. Click the link below to set a new password.</p>
            <div style="text-align: center; margin: 30px 0;"><a href="{reset_link}" style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></div>
            <p style="color: #666; font-size: 12px;">Or paste this link: <br><code style="word-break: break-all;">{reset_link}</code></p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 1 hour. If you didn't request this reset, please ignore this email.</p>
        </div>
        """
        return await self._send_email(to_email, subject, html_content)


def generate_verification_token() -> str:
    return secrets.token_urlsafe(32)


def generate_token_expiry(hours: int = 24) -> datetime:
    return datetime.utcnow() + timedelta(hours=hours)


# Global email service instance
email_service = EmailService()

"""
Contact / Quote Request API — sends enterprise quote inquiries to admin email.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from app.services.email_service import email_service
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

ENTERPRISE_INQUIRY_EMAIL = "info@meshedinc.com"


class QuoteRequest(BaseModel):
    company_name: str
    contact_name: str
    email: str
    phone: str = ""
    estimated_users: str = ""
    message: str = ""


@router.post("/quote")
async def request_quote(req: QuoteRequest):
    """Send an enterprise quote request email to the admin."""
    if not req.company_name or not req.contact_name or not req.email:
        raise HTTPException(status_code=400, detail="Company name, contact name, and email are required.")

    subject = f"🏢 Enterprise Quote Request from {req.company_name}"
    html_content = f"""
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #4f46e5; text-align: center; font-size: 24px; font-weight: 800; margin-bottom: 30px;">
            New Enterprise Quote Request
        </h2>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; font-weight: 700; color: #64748b; width: 160px;">Company</td>
                <td style="padding: 12px 0; color: #1e293b; font-weight: 600;">{req.company_name}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; font-weight: 700; color: #64748b;">Contact Name</td>
                <td style="padding: 12px 0; color: #1e293b; font-weight: 600;">{req.contact_name}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; font-weight: 700; color: #64748b;">Email</td>
                <td style="padding: 12px 0; color: #1e293b; font-weight: 600;">{req.email}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; font-weight: 700; color: #64748b;">Phone</td>
                <td style="padding: 12px 0; color: #1e293b; font-weight: 600;">{req.phone or 'Not provided'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; font-weight: 700; color: #64748b;">Estimated Users</td>
                <td style="padding: 12px 0; color: #1e293b; font-weight: 600;">{req.estimated_users or 'Not specified'}</td>
            </tr>
        </table>

        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin: 20px 0;">
            <p style="font-weight: 700; color: #64748b; margin-bottom: 8px; font-size: 13px;">MESSAGE</p>
            <p style="color: #1e293b; line-height: 1.6; margin: 0;">{req.message or 'No additional message.'}</p>
        </div>

        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;">
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
            This quote request was submitted via the AYTME platform.
        </p>
    </div>
    """

    try:
        success = await email_service._send_email(ENTERPRISE_INQUIRY_EMAIL, subject, html_content)
        if success:
            logger.info(f"[QUOTE] Enterprise quote sent for {req.company_name} ({req.email})")
            return {"status": "sent", "message": "Your quote request has been submitted. We'll get back to you within 24 hours."}
        else:
            logger.error(f"[QUOTE] Failed to send quote email for {req.company_name}")
            raise HTTPException(status_code=500, detail="Failed to send quote request. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[QUOTE] Error sending quote: {e}")
        raise HTTPException(status_code=500, detail="An error occurred. Please try again later.")

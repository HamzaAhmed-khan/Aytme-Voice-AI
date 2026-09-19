import csv
import io
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Transcript
from uuid import UUID
from typing import List

class TranscriptExportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_transcripts(self, room_id: UUID) -> List[Transcript]:
        stmt = select(Transcript).where(Transcript.room_id == room_id).order_by(Transcript.start_ms)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def export_to_csv(self, room_id: UUID) -> str:
        transcripts = await self.get_transcripts(room_id)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Start MS", "End MS", "Source Lang", "Target Lang", "Raw", "Translated"])
        
        for t in transcripts:
            writer.writerow([
                t.start_ms,
                t.end_ms,
                t.source_lang,
                t.target_lang,
                t.text_raw,
                t.text_translated
            ])
        
        return output.getvalue()

    async def export_to_json(self, room_id: UUID) -> str:
        transcripts = await self.get_transcripts(room_id)
        data = [
            {
                "start_ms": t.start_ms,
                "end_ms": t.end_ms,
                "source_lang": t.source_lang,
                "target_lang": t.target_lang,
                "text_raw": t.text_raw,
                "text_translated": t.text_translated
            }
            for t in transcripts
        ]
        return json.dumps(data)

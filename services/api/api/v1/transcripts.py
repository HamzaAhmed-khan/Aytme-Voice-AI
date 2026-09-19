from fastapi import APIRouter, Depends, HTTPException, Query, Response
from app.services.transcript_export import TranscriptExportService
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, func
from app.core.database import get_db
from app.schemas.transcript import TranscriptResponse
from app.api.deps import get_current_user, ScopeChecker
from app.models.models import User, Transcript, Room, TTSArtifact
from typing import List, Optional
from uuid import UUID

router = APIRouter()

@router.get(
    "/{room_id}/transcripts",
    response_model=List[TranscriptResponse],
    summary="List Room Transcripts",
    description="""
Get paginated transcript segments for a specific room with optional filtering.

Each segment represents a detected speech utterance with speaker identity,
language information, and translated text.

**Query Parameters:**
- `limit` (int): Number of records to return (default 100, max 500)
- `offset` (int): Number of records to skip for pagination
- `source_lang` (str): Filter by source language (e.g., 'en', 'ur', 'es')
- `target_lang` (str): Filter by target language
- `speaker_id` (UUID): Filter by participant ID
- `session_id` (UUID): Filter by specific session
- `is_final` (bool): Filter by finalization status

**React Integration Example:**

```javascript
// hooks/useTranscripts.js
import { useState, useEffect } from 'react';

export function useTranscripts(roomId, token, filters = {}) {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    const fetchTranscripts = async () => {
      const params = new URLSearchParams({
        limit: 50,
        offset: 0,
        ...filters
      });
      const res = await fetch(
        `/api/v1/rooms/${roomId}/transcripts?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setTranscripts(await res.json());
      setLoading(false);
    };
    fetchTranscripts();
  }, [roomId, token, filters]);

  return { transcripts, loading };
}
```
    """,
    responses={
        200: {"description": "Paginated list of transcript segments with language metadata"},
        403: {"description": "Access denied — not the room owner or admin"},
        404: {"description": "Room not found"},
    }
)
async def list_transcripts(
    room_id: UUID,
    limit: int = Query(100, le=500, description="Maximum number of segments to return (max 500)"),
    offset: int = Query(0, description="Number of segments to skip for pagination"),
    source_lang: Optional[str] = Query(None, description="Filter by source language (e.g., 'en', 'ur', 'es')"),
    target_lang: Optional[str] = Query(None, description="Filter by target language"),
    speaker_id: Optional[UUID] = Query(None, description="Filter by participant ID"),
    is_final: Optional[bool] = Query(None, description="Filter by finalization status"),
    session_id: Optional[UUID] = Query(None, description="Filter by session ID"),
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db)
):
    # Verify room exists and owner/org matches
    room_result = await db.execute(select(Room).where(Room.id == room_id))
    room = room_result.scalar_one_or_none()
    if not room or (room.owner_id != current_user.id and current_user.role not in ["admin", "worker"]):
        raise HTTPException(status_code=403, detail="Access denied to this room")

    # Build dynamic query with filtering
    filters = [Transcript.room_id == room_id]
    
    if source_lang:
        filters.append(Transcript.source_lang == source_lang.lower())
    if target_lang:
        filters.append(Transcript.target_lang == target_lang.lower())
    if speaker_id:
        filters.append(Transcript.participant_id == speaker_id)
    if is_final is not None:
        filters.append(Transcript.is_final == is_final)
    if session_id:
        filters.append(Transcript.session_id == session_id)

    query = select(Transcript).where(and_(*filters)).order_by(Transcript.created_at.asc()).offset(offset).limit(limit)
    result = await db.execute(query)
    
    return result.scalars().all()


@router.get(
    "/{room_id}/export/{format}",
    summary="Export Transcripts",
    description="""
Export all room transcripts as a downloadable file.

**Supported formats:**
- `csv` — Comma-separated values with columns: speaker, text, start_ms, end_ms, language
- `json` — Full JSON array of transcript objects

**React Integration Example:**

```javascript
// Download transcript as CSV
const handleExport = async (roomId, format, token) => {
  const res = await fetch(
    `/api/v1/rooms/${roomId}/export/${format}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transcript_${roomId}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
};
```
    """,
    responses={
        200: {"description": "File download — Content-Disposition header set for attachment"},
        400: {"description": "Invalid format — must be 'csv' or 'json'"},
        403: {"description": "Access denied"},
        404: {"description": "Room not found"},
    }
)
async def export_transcripts(
    room_id: UUID, 
    format: str,
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db)
):
    """Export room transcripts in CSV or JSON format."""
    # Verify room exists and owner/org matches
    room_result = await db.execute(select(Room).where(Room.id == room_id))
    room = room_result.scalar_one_or_none()
    if not room or (room.owner_id != current_user.id and current_user.role not in ["admin", "worker"]):
        raise HTTPException(status_code=403, detail="Access denied to this room")

    service = TranscriptExportService(db)
    if format.lower() == "csv":
        data = await service.export_to_csv(room_id)
        media_type = "text/csv"
    elif format.lower() == "json":
        data = await service.export_to_json(room_id)
        media_type = "application/json"
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Supported: csv, json")

    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=transcript_{room_id}.{format}"}
    )


@router.get(
    "/{room_id}/transcripts/{transcript_id}/audio",
    summary="Get Transcript Audio",
    description="Return saved TTS audio for a specific transcript in a room.",
    responses={
        200: {"description": "Audio stream returned"},
        403: {"description": "Access denied"},
        404: {"description": "Transcript or audio not found"},
    },
)
async def get_transcript_audio(
    room_id: UUID,
    transcript_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db),
):
    room_result = await db.execute(select(Room).where(Room.id == room_id))
    room = room_result.scalar_one_or_none()
    if not room or (room.owner_id != current_user.id and current_user.role not in ["admin", "worker"]):
        raise HTTPException(status_code=403, detail="Access denied to this room")

    transcript_result = await db.execute(
        select(Transcript).where(
            Transcript.id == transcript_id,
            Transcript.room_id == room_id,
        )
    )
    transcript = transcript_result.scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    artifact_result = await db.execute(
        select(TTSArtifact)
        .where(TTSArtifact.transcript_id == transcript_id)
        .order_by(TTSArtifact.created_at.desc())
    )
    artifact = artifact_result.scalars().first()

    if not artifact or not artifact.audio_data:
        raise HTTPException(status_code=404, detail="No saved audio for this transcript")

    audio_format = (artifact.audio_format or "mp3").lower()
    media_type = "audio/mpeg" if audio_format == "mp3" else "application/octet-stream"

    return Response(
        content=artifact.audio_data,
        media_type=media_type,
        headers={
            "Content-Disposition": f"inline; filename=transcript_{transcript_id}.{audio_format}"
        },
    )


@router.delete(
    "/{room_id}/transcripts/{transcript_id}",
    status_code=204,
    summary="Delete Transcript",
    description="Delete a transcript and any linked TTS artifact for the selected room.",
    responses={
        204: {"description": "Transcript deleted"},
        403: {"description": "Access denied"},
        404: {"description": "Transcript not found"},
    },
)
async def delete_transcript(
    room_id: UUID,
    transcript_id: UUID,
    current_user: User = Depends(ScopeChecker(["room:write"])),
    db: AsyncSession = Depends(get_db),
):
    room_result = await db.execute(select(Room).where(Room.id == room_id))
    room = room_result.scalar_one_or_none()
    if not room or (room.owner_id != current_user.id and current_user.role not in ["admin", "worker"]):
        raise HTTPException(status_code=403, detail="Access denied to this room")

    await db.execute(delete(TTSArtifact).where(TTSArtifact.transcript_id == transcript_id))

    delete_transcript_result = await db.execute(
        delete(Transcript).where(
            Transcript.id == transcript_id,
            Transcript.room_id == room_id,
        )
    )

    if not delete_transcript_result.rowcount:
        await db.rollback()
        raise HTTPException(status_code=404, detail="Transcript not found")

    await db.commit()
    return Response(status_code=204)


@router.get(
    "/{room_id}/sessions",
    summary="List Room Sessions",
    description="Get unique sessions (bot starts/stops) for a room based on transcript data."
)
async def list_sessions(
    room_id: UUID, 
    current_user: User = Depends(ScopeChecker(["room:read"])),
    db: AsyncSession = Depends(get_db)
):
    """List unique sessions for a room."""
    # Verify room exists and owner/org matches
    room_result = await db.execute(select(Room).where(Room.id == room_id))
    room = room_result.scalar_one_or_none()
    if not room or (room.owner_id != current_user.id and current_user.role not in ["admin", "worker"]):
        raise HTTPException(status_code=403, detail="Access denied to this room")

    # Group transcripts by session_id to find unique sessions
    stmt = (
        select(
            Transcript.session_id,
            func.min(Transcript.created_at).label("start_time"),
            func.max(Transcript.created_at).label("end_time"),
            func.count(Transcript.id).label("transcript_count")
        )
        .where(Transcript.room_id == room_id)
        .group_by(Transcript.session_id)
        .order_by(func.min(Transcript.created_at).desc())
    )
    result = await db.execute(stmt)
    
    sessions = []
    for row in result.all():
        sessions.append({
            "session_id": row.session_id,
            "start_time": row.start_time,
            "end_time": row.end_time,
            "transcript_count": row.transcript_count
        })
    
    return sessions

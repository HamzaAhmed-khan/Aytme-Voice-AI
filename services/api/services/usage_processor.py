import asyncio
import json
import logging
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.core.redis import redis_manager
from app.core.config import settings
from app.models.models import BillingEvent, Room, UsageRecord, Subscription, Plan
from sqlalchemy import select
from datetime import datetime
from decimal import Decimal

logger = logging.getLogger("usage_processor")


async def process_usage_events(ws_manager=None):
    """
    Process usage events from Redis and persist to PostgreSQL.
    Handles metering aggregation for billing purposes.
    """
    redis = await redis_manager.get_client()
    group_name = "usage-processor-group"
    stream_name = "usage:events"
    
    # Create async session factory
    engine = create_async_engine(settings.DATABASE_URL)
    AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        # Create consumer group if not exists
        try:
            await redis.xgroup_create(stream_name, group_name, id="0", mkstream=True)
            logger.info(f"Created consumer group {group_name} for stream {stream_name}")
        except Exception as e:
            if "BUSYGROUP" not in str(e):
                logger.warning(f"Could not create consumer group: {str(e)}")

        logger.info("Usage processor started, listening for events...")

        while True:
            try:
                # Read from stream with timeout
                messages = await redis.xreadgroup(
                    group_name, 
                    "processor-worker", 
                    {stream_name: ">"}, 
                    count=50,  # Process more at once
                    block=5000
                )
                
                if not messages:
                    await asyncio.sleep(1)
                    continue

                async with AsyncSessionLocal() as db:
                    for stream, msgs in messages:
                        for message_id, data in msgs:
                            try:
                                # Decode data (already strings due to decode_responses=True)
                                room_id = data.get("room_id", "")
                                org_id = data.get("org_id", "")
                                event_type = data.get("event_type", "usage")
                                
                                if not room_id and not org_id:
                                    logger.warning(f"Skipping message without room_id or org_id: {data}")
                                    await redis.xack(stream_name, group_name, message_id)
                                    continue
                                
                                from uuid import UUID
                                room_uuid = UUID(room_id) if room_id else None
                                org_uuid = UUID(org_id) if org_id else None
                                
                                # Fallback: Look up org_id from room if missing
                                if not org_uuid and room_uuid:
                                    room_stmt = select(Room).where(Room.id == room_uuid)
                                    room_res = await db.execute(room_stmt)
                                    room_obj = room_res.scalars().first()
                                    if room_obj:
                                        org_uuid = room_obj.org_id
                                        logger.debug(f"Resolved missing org_id {org_uuid} for room {room_id}")

                                if event_type in ["usage", "speech_processed"]:
                                    # Parse metrics
                                    quantity = float(data.get("quantity", 0))
                                    if "seconds_processed" in data:
                                        quantity = float(data["seconds_processed"]) / 60.0
                                    
                                    if quantity > 0 and org_uuid:
                                        usage = UsageRecord(
                                            org_id=org_uuid,
                                            room_id=room_uuid,
                                            minutes_used=Decimal(str(quantity)),
                                            recorded_at=datetime.utcnow()
                                        )
                                        db.add(usage)
                                        logger.debug(f"Usage recorded: org={org_uuid}, minutes={quantity}")
                                        
                                elif event_type == "tts.ready" and ws_manager:
                                    tts_url = data.get("url", "")
                                    response_id = data.get("response_id", "")
                                    await ws_manager.broadcast({
                                        "type": "tts.ready",
                                        "room_id": room_id,
                                        "url": tts_url,
                                        "response_id": response_id
                                    })
                                    
                                elif event_type == "transcript":
                                    from app.models.models import Transcript
                                    text = data.get("text", "")
                                    text_original = data.get("text_original", "")
                                    speaker = data.get("speaker", "Speaker")
                                    speaker_identity = data.get("speaker_identity", speaker)
                                    is_ai = data.get("is_ai") == "true"
                                    
                                    # Extract language metadata and session ID from Redis event (NEW)
                                    source_lang = data.get("source_lang", "en")
                                    target_lang = data.get("target_lang", "en")
                                    is_final = data.get("is_final") == "true"
                                    session_id_str = data.get("session_id")
                                    session_uuid = UUID(session_id_str) if session_id_str else None
                                    
                                    if room_uuid and org_uuid and text:
                                        # Try to find participant by speaker_identity to get participant_id
                                        participant_id = None
                                        if speaker_identity and speaker_identity != "Speaker":
                                            try:
                                                from app.models.models import Participant
                                                participant_stmt = select(Participant).where(
                                                    (Participant.room_id == room_uuid) & 
                                                    (Participant.identity == speaker_identity)
                                                )
                                                participant_res = await db.execute(participant_stmt)
                                                participant_obj = participant_res.scalars().first()
                                                if participant_obj:
                                                    participant_id = participant_obj.id
                                                    logger.debug(f"Resolved participant_id {participant_id} for identity {speaker_identity}")
                                            except Exception as p_err:
                                                logger.debug(f"Could not resolve participant for {speaker_identity}: {p_err}")
                                        
                                        transcript = Transcript(
                                            room_id=room_uuid,
                                            org_id=org_uuid,
                                            participant_id=participant_id,
                                            speaker_identity=speaker_identity,
                                            is_ai=is_ai,
                                            source_lang=source_lang,
                                            target_lang=target_lang,
                                            text_raw=text_original or text,
                                            text_translated=text,
                                            start_ms=0,
                                            end_ms=0,
                                            is_final=is_final,
                                            session_id=session_uuid
                                        )
                                        db.add(transcript)
                                        logger.debug(f"Saved DB Transcript for room {room_id}: {text[:30]}... (langs: {source_lang}→{target_lang}, final={is_final})")
                                
                                # Acknowledge message
                                await redis.xack(stream_name, group_name, message_id)
                                
                            except Exception as e:
                                logger.error(f"Error processing message {message_id}: {str(e)}", exc_info=True)
                                # Acknowledge anyway to prevent infinite loops
                                await redis.xack(stream_name, group_name, message_id)
                    
                    # Batch commit
                    try:
                        await db.commit()
                    except Exception as e:
                        logger.error(f"Error committing usage records: {str(e)}")
                        await db.rollback()
                
            except asyncio.CancelledError:
                logger.info("Usage processor shutting down")
                break
            except Exception as e:
                logger.error(f"Error processing usage batch: {str(e)}", exc_info=True)
                await asyncio.sleep(5)
    
    finally:
        await engine.dispose()
        logger.info("Usage processor stopped")

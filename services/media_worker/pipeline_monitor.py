import asyncio
import logging
from typing import Dict

logger = logging.getLogger(__name__)

class PipelineMonitor:
    """
    Monitors queue health and overflow states.
    If backpressure builds up, it clears tasks to catch up.
    """
    
    # Safe caps for queue lengths to prevent OOM or 30s delays
    MAX_WHISPER_QUEUE = 10
    MAX_GPT_QUEUE     = 20
    MAX_TTS_QUEUE     = 50

    def __init__(self):
        self.queues: Dict[str, asyncio.Queue] = {}

    def register_queue(self, name: str, queue: asyncio.Queue):
        self.queues[name] = queue

    def health_check(self) -> bool:
        """Returns False if pipeline has catastrophically backed up."""
        healthy = True
        
        for name, q in self.queues.items():
            size = q.qsize()
            maxsize = self._get_max_for_queue(name)
            
            if size > maxsize:
                logger.warning(f"Pipeline backpressure: {name} queue at {size}")
                self._clear_queue(q)
                healthy = False
                
        return healthy

    def _get_max_for_queue(self, name: str) -> int:
        if "whisper" in name.lower(): return self.MAX_WHISPER_QUEUE
        if "gpt" in name.lower():     return self.MAX_GPT_QUEUE
        if "tts" in name.lower():     return self.MAX_TTS_QUEUE
        return 20 # default

    def _clear_queue(self, q: asyncio.Queue):
        # Leave the last item so we don't drop context completely
        while q.qsize() > 1:
            try:
                q.get_nowait()
                q.task_done()
            except asyncio.QueueEmpty:
                break

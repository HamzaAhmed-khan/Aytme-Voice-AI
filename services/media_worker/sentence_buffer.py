import asyncio
import logging
import time
from typing import List, Optional

logger = logging.getLogger("sentence_buffer")

class SentenceBuffer:
    """
    Groups streamed word tokens into coherent sentences or flushes them 
    based on count/timeout to keep the translation pipeline moving.
    """
    def __init__(self, max_words: int = 3, flush_timeout: float = 0.5):
        self.max_words = max_words
        self.flush_timeout = flush_timeout
        self.words: List[str] = []
        
        self.on_sentences = asyncio.Queue(maxsize=100)
        self.is_active = False
        self._watcher_task: Optional[asyncio.Task] = None
        self._last_word_at = 0.0

    async def start(self):
        """Starts the inactivity watcher."""
        self.is_active = True
        self._watcher_task = asyncio.create_task(self._watch_timeout())
        logger.info(f"SentenceBuffer started (Max words: {self.max_words}, Global Timeout: {self.flush_timeout}s)")

    async def stop(self):
        """Stops the watcher."""
        self.is_active = False
        if self._watcher_task:
            self._watcher_task.cancel()
            try:
                await self._watcher_task
            except asyncio.CancelledError:
                pass
        logger.info("SentenceBuffer stopped.")

    async def process_text(self, text: str):
        """Receives new words/text and checks for flush triggers."""
        if not text or not text.strip():
            return
        
        logger.info(f"[DIAG][BUFFER] Received token: '{text.strip()[:80]}'")
        
        # No dedup — trust WhisperPoller's offset-based dedup upstream
        new_words = text.strip().split()
        if not new_words:
            return

        for word in new_words:
            self.words.append(word)
            self._last_word_at = time.time()
            logger.info(f"[DIAG][BUFFER] Buffer now: {self.words}")
            
            # Trigger 1: Punctuation (End of Thought)
            if any(p in word for p in (".", "!", "?", "。", "!", "?")):
                await self.flush()
                continue

            # Trigger 2: Max Words exceeded
            if len(self.words) >= self.max_words:
                await self.flush()

    async def flush(self):
        """Assembles accumulated words and pushes to the output queue."""
        if not self.words:
            return

        sentence = " ".join(self.words).strip()
        self.words = []
        
        if len(sentence) < 2: # Ignore noise
            return

        logger.info(f"[DIAG][BUFFER] FLUSHING: '{sentence}'")
        try:
            await self.on_sentences.put(sentence)
        except asyncio.QueueFull:
            logger.warning("SentenceBuffer output queue full. Dropping sentence.")

    async def _watch_timeout(self):
        """Background task that flushes the buffer if the speaker pauses."""
        while self.is_active:
            await asyncio.sleep(0.1) # 100ms resolution for faster flush detection
            
            if not self.words:
                continue
            
            # Trigger 3: Inactivity timeout (Speaker paused)
            idle_time = time.time() - self._last_word_at
            word_count = len(self.words)
            
            # Flush if: enough words OR waited long enough with any words
            if word_count >= self.max_words:
                await self.flush()
            elif idle_time >= self.flush_timeout and word_count >= 1:
                # logger.debug(f"Timeout flush triggered ({idle_time:.2f}s idle, words: {word_count})")
                await self.flush()

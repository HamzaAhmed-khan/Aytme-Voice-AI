/**
 * TalkTogetherSession.js
 * 
 * Manages the local 2-microphone capture and translation pipeline for 
 * Mode 2 (Talk Together). This mode bypasses LiveKit and calls a 
 * translation proxy directly from the browser.
 */

export class TalkTogetherSession {
  constructor(config) {
    this.micAId = config.micAId;
    this.micBId = config.micBId;
    this.langA = config.langA;
    this.langB = config.langB;
    this.onTranscript = config.onTranscript;
    this.onPartialTranscript = config.onPartialTranscript || null; // Live streaming caption callback
    this.apiToken = config.apiToken;
    this.apiUrl = config.apiUrl || '';

    this.streams = { A: null, B: null };
    this.recorders = { A: null, B: null };
    this.audioContext = null;
    this.isRecording = false;
    this.playbackQueue = [];
    this.isPlaying = false;
    
    // 🟢 ACOUSTIC ECHO GATE
    this.muteUntil = 0;

    // Streaming session state per mic
    this._streamSessions = { A: null, B: null };
    this._chunkIndexes = { A: 0, B: 0 };
    // Silence detection: track last chunk time per mic for auto-finalize
    this._lastChunkTime = { A: 0, B: 0 };
    this._silenceTimers = { A: null, B: null };
    this._SILENCE_TIMEOUT_MS = 1500; // Finalize after 1.5s of silence
    // Per-mic chunk accumulation (WebM header is only in chunk 0)
    this._audioChunks = { A: [], B: [] };
    // Track last partial STT text per mic for speculative pipeline
    this._lastPartialText = { A: '', B: '' };
  }

  async start() {
    try {
      this.isRecording = true;
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Setup Mic A
      this.streams.A = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: this.micAId } }
      });
      this._setupRecorder('A', this.streams.A, this.langA, this.langB);

      // Setup Mic B
      this.streams.B = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: this.micBId } }
      });
      this._setupRecorder('B', this.streams.B, this.langB, this.langA);

      console.log('TalkTogetherSession: Both mics active (streaming mode).');
    } catch (err) {
      console.error('Failed to start TalkTogether mics:', err);
      throw err;
    }
  }

  stop() {
    this.isRecording = false;
    // Finalize any active streaming sessions
    ['A', 'B'].forEach(id => {
      if (this._silenceTimers[id]) clearTimeout(this._silenceTimers[id]);
    });
    Object.values(this.streams).forEach(s => s?.getTracks().forEach(t => t.stop()));
    Object.values(this.recorders).forEach(r => { try { r?.stop(); } catch(_){} });
    this.audioContext?.close();
  }

  _setupRecorder(id, stream, sourceLang, targetLang) {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    this.recorders[id] = recorder;

    recorder.ondataavailable = async (event) => {
      // 🟢 ACOUSTIC ECHO GATE - Hard drop
      if (Date.now() < this.muteUntil) {
        console.debug(`[ECHO GATE] Dropping mic ${id} chunk because TTS is playing.`);
        return;
      }
      
      if (event.data.size > 50 && this.isRecording) {
        // Initialize streaming session if needed
        if (!this._streamSessions[id]) {
          this._streamSessions[id] = `tt-${id}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
          this._chunkIndexes[id] = 0;
          this._audioChunks[id] = [];
        }

        // CRITICAL: Accumulate chunks. WebM header is only in chunk 0.
        this._audioChunks[id].push(event.data);
        this._lastChunkTime[id] = Date.now();
        
        const chunkIdx = this._chunkIndexes[id];
        // Send partial STT every chunk (~1s) for freshest possible text.
        // Skip only chunk 0 (too short for meaningful STT).
        if (chunkIdx > 0) {
          // Build accumulated blob with valid WebM header
          const accBlob = new Blob(this._audioChunks[id], { type: mimeType || 'audio/webm' });
          this._processStreamChunk(id, accBlob, sourceLang, targetLang, false);
        } else {
          this._chunkIndexes[id] = chunkIdx + 1;
          // Show speaking indicator without STT
          if (this.onPartialTranscript) {
            this.onPartialTranscript({ micId: id, text: '...', sessionId: this._streamSessions[id] });
          }
        }

        // Reset silence timer — auto-finalize after silence
        if (this._silenceTimers[id]) clearTimeout(this._silenceTimers[id]);
        this._silenceTimers[id] = setTimeout(() => {
          this._finalizeSession(id, sourceLang, targetLang);
        }, this._SILENCE_TIMEOUT_MS);
      }
    };

    recorder.start(1000); // 1-second streaming chunks
  }

  async _processStreamChunk(micId, blob, sourceLang, targetLang, finalize = false) {
    const sessionId = this._streamSessions[micId];
    if (!sessionId) return;

    const chunkIdx = this._chunkIndexes[micId];
    this._chunkIndexes[micId] = chunkIdx + 1;

    const formData = new FormData();
    const ext = blob.type?.includes('mp4') ? 'mp4' : 'webm';
    formData.append('audio', blob, `chunk.${ext}`);
    formData.append('session_id', sessionId);
    formData.append('chunk_index', String(chunkIdx));
    formData.append('finalize', finalize ? 'true' : 'false');
    formData.append('source_lang', sourceLang);
    formData.append('target_lang', targetLang);

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/talk-together/translate/stream`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiToken}` },
        body: formData
      });

      if (!response.ok) throw new Error(`Stream error: ${response.status}`);
      const data = await response.json();

      if (!finalize && data.status === 'partial') {
        // Store last partial text for speculative pipeline
        if (data.accumulated_text) {
          this._lastPartialText[micId] = data.accumulated_text;
        }
        // Fire partial transcript callback for live caption display
        if (data.accumulated_text && this.onPartialTranscript) {
          this.onPartialTranscript({
            micId,
            text: data.accumulated_text + '...',
            sessionId,
          });
        }
        return;
      }

      // Final result — full translation + TTS
      if (finalize && data.status === 'final' && data.translated_text && data.audio) {
        this.onTranscript?.({
          micId,
          source: data.source_text,
          translated: data.translated_text
        });
        this._queuePlayback(data.audio);
      }
    } catch (err) {
      console.error(`TalkTogether stream failed for Mic ${micId}:`, err);
    }
  }

  async _finalizeSession(micId, sourceLang, targetLang) {
    const sessionId = this._streamSessions[micId];
    if (!sessionId) return;

    console.log(`[TalkTogether] Finalizing streaming session for Mic ${micId}`);

    // ─── SPECULATIVE FAST PATH ───
    // If we have pre-accumulated STT text, use the text pipeline (skip final STT)
    const speculativeText = this._lastPartialText[micId];
    if (speculativeText && speculativeText.trim().length > 3) {
      console.log(`[TalkTogether] ⚡ Using speculative text pipeline for Mic ${micId}: "${speculativeText.slice(0, 60)}"`);
      await this._sendTextPipeline(micId, speculativeText, sourceLang, targetLang);
    } else {
      // FALLBACK: Build full accumulated blob (valid WebM with header from chunk 0)
      const chunks = this._audioChunks[micId] || [];
      const fullBlob = chunks.length > 0
        ? new Blob(chunks, { type: 'audio/webm' })
        : new Blob([], { type: 'audio/webm' });
      await this._processStreamChunk(micId, fullBlob, sourceLang, targetLang, true);
    }

    // Reset session state for next utterance
    this._streamSessions[micId] = null;
    this._chunkIndexes[micId] = 0;
    this._audioChunks[micId] = [];
    this._lastPartialText[micId] = '';
    // Clear partial caption
    if (this.onPartialTranscript) {
      this.onPartialTranscript({ micId, text: null, sessionId: null });
    }
  }

  async _sendTextPipeline(micId, text, sourceLang, targetLang) {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('source_lang', sourceLang);
    formData.append('target_lang', targetLang);

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/talk-together/translate/text-pipeline`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiToken}` },
        body: formData
      });

      if (!response.ok) throw new Error(`Text pipeline error: ${response.status}`);
      const data = await response.json();

      if (data.status === 'final' && data.translated_text && data.audio) {
        this.onTranscript?.({
          micId,
          source: data.source_text,
          translated: data.translated_text
        });
        this._queuePlayback(data.audio);
        console.log(`[TalkTogether] ⚡ Speculative pipeline complete (${data.metrics?.latency_ms}ms)`);
      }
    } catch (err) {
      console.error(`TalkTogether text pipeline failed for Mic ${micId}:`, err);
      // Fallback to full audio pipeline
      const chunks = this._audioChunks[micId] || [];
      if (chunks.length > 0) {
        const fullBlob = new Blob(chunks, { type: 'audio/webm' });
        await this._processStreamChunk(micId, fullBlob, sourceLang, targetLang, true);
      }
    }
  }

  _queuePlayback(base64Audio) {
    this.playbackQueue.push(base64Audio);
    if (!this.isPlaying) {
      this._playNext();
    }
  }

  async _playNext() {
    if (this.playbackQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const b64 = this.playbackQueue.shift();
    const audioBlob = this._base64ToBlob(b64, 'audio/mp3');
    const url = URL.createObjectURL(audioBlob);
    
    const audio = new Audio(url);
    
    // 🟢 ACOUSTIC ECHO GATE - Sync lock length to audio bounds + 300ms reverb tail
    audio.onloadedmetadata = () => {
      const durationMs = audio.duration * 1000;
      this.muteUntil = Date.now() + durationMs + 300; 
    };

    audio.onended = () => {
      URL.revokeObjectURL(url);
      this._playNext();
    };
    
    try {
      await audio.play();
    } catch (e) {
      console.warn('Playback interrupted or blocked:', e);
      this._playNext();
    }
  }

  _base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

/**
 * RealtimeTranslateSession.js
 *
 * Drop-in replacement for TalkTogetherSession — same constructor/start/stop API.
 *
 * Architecture:
 *   Two WebSocket connections (one per mic direction):
 *     Session A: mic A audio → backend relay → OpenAI  (source=langA, target=langB)
 *     Session B: mic B audio → backend relay → OpenAI  (source=langB, target=langA)
 *
 * Audio pipeline (send):
 *   getUserMedia → AudioContext → AudioWorklet (PCM16 24 kHz) → WebSocket binary
 *
 * Audio pipeline (receive):
 *   WebSocket binary (PCM16 24 kHz) → Float32 decode → AudioBufferSourceNode → speakers
 *
 * Echo suppression:
 *   When session A is playing translated audio, session B stops sending mic input
 *   (and vice versa). This prevents the playback from being re-translated.
 *
 * Captions:
 *   onPartialTranscript fires on every caption_delta from the relay.
 *   onTranscript fires on turn_done with the complete translated turn.
 *
 * Accent lock:
 *   The backend re-injects the system prompt on every OpenAI session connect/reconnect.
 *   The client does not need to do anything extra — reconnects are handled by the relay.
 */

// ── AudioWorklet processor (inlined as a blob URL) ───────────────────────────
// Captures Float32 audio at context.sampleRate, downsamples to 24 kHz with a
// proper 8-tap FIR anti-aliasing low-pass filter (prevents aliasing artifacts),
// converts to Int16, and posts 100 ms chunks to the main thread.
const _WORKLET_CODE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf   = [];
    this._CHUNK = 480;               // 20 ms at 24 000 Hz — minimises first-byte latency
    this._ratio = sampleRate / 24000;

    // 8-tap windowed-sinc FIR low-pass filter — cutoff at Nyquist of 24 kHz output
    // (0.5 / ratio in normalized input frequency). Prevents aliasing on downsample.
    // N=8 kept as power-of-2 so the circular history buffer uses fast bit-masking.
    const N = 8;
    const cutoff = 0.5 / this._ratio;
    const fir = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = i - (N - 1) / 2;
      const sinc = x === 0 ? 2 * cutoff
                            : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
      const win  = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1))); // Hanning
      fir[i] = sinc * win;
    }
    // Normalise DC gain to 1.0
    const gain = fir.reduce((s, v) => s + v, 0);
    for (let i = 0; i < N; i++) fir[i] /= gain;
    this._fir  = fir;
    this._hist = new Float32Array(N); // circular history
    this._hidx = 0;
    this._phase = 0;                  // fractional resampling phase
  }

  _filter(x) {
    const N = this._fir.length;
    this._hist[this._hidx] = x;
    let y = 0;
    for (let i = 0; i < N; i++) {
      y += this._fir[i] * this._hist[(this._hidx - i + N) & (N - 1)];
    }
    this._hidx = (this._hidx + 1) & (N - 1);
    return y;
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;

    const ratio = this._ratio;
    for (let i = 0; i < ch.length; i++) {
      const filtered = this._filter(ch[i]);
      this._phase += 1;
      if (this._phase >= ratio) {
        this._phase -= ratio;
        this._buf.push(filtered);
      }
    }

    while (this._buf.length >= this._CHUNK) {
      const slice = this._buf.splice(0, this._CHUNK);
      const pcm   = new Int16Array(this._CHUNK);
      for (let i = 0; i < this._CHUNK; i++) {
        pcm[i] = Math.round(Math.max(-1, Math.min(1, slice[i])) * 32767);
      }
      this.port.postMessage({ type: 'audio', buf: pcm.buffer }, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCaptureProcessor);
`;

function _workletUrl() {
  const blob = new Blob([_WORKLET_CODE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}


// ── PCM16 → Float32 decoder (for playback) ───────────────────────────────────
function _pcm16ToFloat32(arrayBuffer) {
  const int16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}


// ── Per-direction session ─────────────────────────────────────────────────────
class _DirectionSession {
  /**
   * @param {object}   cfg
   * @param {string}   cfg.id             'A' | 'B'
   * @param {string}   cfg.micId          deviceId for getUserMedia
   * @param {string}   cfg.sourceLang     display name, e.g. "English"
   * @param {string}   cfg.targetLang     display name, e.g. "Yoruba"
   * @param {string}   cfg.wsBase         base URL, e.g. "https://api.example.com"
   * @param {string}   cfg.apiToken       JWT — forwarded as ?token=
   * @param {Function} cfg.onPartialTranscript
   * @param {Function} cfg.onTranscript
   * @param {object}   cfg.echoGate       { isPlaying: boolean } — shared with sibling
   * @param {Function} cfg.setPlaying     called with true/false when playback starts/stops
   */
  constructor(cfg) {
    this.id           = cfg.id;
    this.micId        = cfg.micId;
    this.sourceLang   = cfg.sourceLang;
    this.targetLang   = cfg.targetLang;
    this.wsBase       = cfg.wsBase;
    this.apiToken     = cfg.apiToken;
    this.onPartialTranscript = cfg.onPartialTranscript;
    this.onTranscript        = cfg.onTranscript;
    this.echoGate     = cfg.echoGate;   // sibling's isPlaying flag
    this.setPlaying   = cfg.setPlaying; // our own playing flag setter

    this._ws          = null;
    this._audioCtx    = null;
    this._micStream   = null;
    this._workletNode = null;
    this._active      = false;

    // Playback state
    this._playbackCtx   = null;
    this._playbackQueue = [];  // Float32Array[]
    this._isPlaying     = false;
    this._nextPlayAt    = 0;

    // Caption accumulator for current turn (translation output)
    this._captionBuf    = '';
    // Input speech transcription for current turn (what the speaker actually said)
    this._speechBuf     = '';
  }

  async start() {
    this._active = true;

    // Playback AudioContext (separate from capture to avoid feedback)
    this._playbackCtx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 24000,
    });

    // Capture pipeline
    this._audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    this._micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId:         { exact: this.micId },
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl:  false,
        sampleRate:       { ideal: 48000 },
        channelCount:     1,
      },
    });

    await this._audioCtx.audioWorklet.addModule(_workletUrl());
    const source = this._audioCtx.createMediaStreamSource(this._micStream);
    this._workletNode = new AudioWorkletNode(this._audioCtx, 'pcm-capture');

    this._workletNode.port.onmessage = ({ data }) => {
      if (!this._active || !this._ws || this._ws.readyState !== WebSocket.OPEN) return;
      // Echo gate: don't send if sibling session is playing its output
      if (this.echoGate.isPlaying) return;
      this._ws.send(data.buf);
    };

    source.connect(this._workletNode);

    // Open WebSocket to relay
    this._connect();
  }

  _connect() {
    if (!this._active) return;
    // Always reset caption state on (re)connect — prevents stale text from a
    // previous turn or dropped connection bleeding into the next caption.
    this._captionBuf = '';
    this._speechBuf  = '';

    const proto  = location.protocol === 'https:' ? 'wss' : 'ws';
    const host   = this.wsBase.replace(/^https?:\/\//, '');
    const src    = encodeURIComponent(this.sourceLang);
    const tgt    = encodeURIComponent(this.targetLang);
    const tok    = encodeURIComponent(this.apiToken || '');
    // mode=vad: relay uses server VAD so OpenAI auto-detects speech boundaries
    // and fires responses without an explicit PTT commit from the client.
    const url    = `${proto}://${host}/api/v1/realtime/ws?source=${src}&target=${tgt}&token=${tok}&mode=vad`;

    console.info(`[Realtime/${this.id}] Connecting: ${this.sourceLang} → ${this.targetLang}`);
    this._ws = new WebSocket(url);
    this._ws.binaryType = 'arraybuffer';

    this._ws.onopen = () => {
      console.info(`[Realtime/${this.id}] WebSocket open`);
    };

    this._ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        this._handleText(evt.data);
      } else {
        this._handleAudio(evt.data);
      }
    };

    this._ws.onerror = (err) => {
      console.error(`[Realtime/${this.id}] WebSocket error`, err);
    };

    this._ws.onclose = ({ code, reason }) => {
      if (!this._active) return;
      console.warn(`[Realtime/${this.id}] WebSocket closed (${code} ${reason}) — reconnecting`);
      setTimeout(() => this._connect(), 500); // 500ms vs 2000ms — recover faster
    };
  }

  _handleText(raw) {
    let evt;
    try { evt = JSON.parse(raw); } catch { return; }

    switch (evt.type) {
      case 'speech_started':
        // New speech turn beginning — clear any stale caption from previous turn
        this._captionBuf = '';
        this._speechBuf  = '';
        this.onPartialTranscript?.({ micId: this.id, text: '…', sessionId: this.id });
        break;

      case 'speech_delta':
        // Streaming transcription of what the speaker is actually saying
        this._speechBuf += evt.text;
        break;

      case 'speech_done':
        // Final transcription of the speaker's input — ground truth of what was said
        this._speechBuf = evt.text || this._speechBuf;
        break;

      case 'caption_delta':
        this._captionBuf += evt.text;
        this.onPartialTranscript?.({
          micId: this.id,
          text: this._captionBuf + '…',
          sessionId: this.id,
        });
        break;

      case 'turn_done': {
        const full = evt.text || this._captionBuf;
        if (full) {
          this.onTranscript?.({
            micId:      this.id,
            source:     this._speechBuf || '',  // what the speaker actually said
            translated: full,                    // the translation output
          });
        }
        // Clear both buffers — next turn starts fresh
        this._captionBuf = '';
        this._speechBuf  = '';
        this.onPartialTranscript?.({ micId: this.id, text: null, sessionId: null });
        break;
      }

      case 'error':
        console.error(`[Realtime/${this.id}] Server error: ${evt.message} (${evt.code})`);
        this.onTranscript?.({
          micId:      this.id,
          source:     '',
          translated: `[Translation error: ${evt.message}]`,
          isError:    true,
        });
        break;

      default:
        break;
    }
  }

  _handleAudio(arrayBuffer) {
    if (!this._playbackCtx || !this._active) return;

    const float32 = _pcm16ToFloat32(arrayBuffer);
    this._playbackQueue.push(float32);

    if (!this._isPlaying) {
      this._isPlaying = true;
      this.setPlaying(true);
      this._drainQueue();
    }
  }

  _drainQueue() {
    if (!this._active || !this._playbackCtx) return;

    const ctx = this._playbackCtx;

    // Resume suspended context (needed on some browsers after user gesture)
    if (ctx.state === 'suspended') ctx.resume();

    // Schedule all queued chunks back-to-back
    while (this._playbackQueue.length > 0) {
      const samples = this._playbackQueue.shift();
      const buffer  = ctx.createBuffer(1, samples.length, 24000);
      buffer.copyToChannel(samples, 0);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime, this._nextPlayAt);
      src.start(startAt);
      this._nextPlayAt = startAt + buffer.duration;
    }

    // Check again shortly — more chunks may arrive
    const self = this;
    setTimeout(() => {
      if (self._playbackQueue.length > 0) {
        self._drainQueue();
      } else {
        // Nothing left — re-enable mic after audio finishes + tight 80ms tail
        // (was 200ms — the extra 120ms was dead silence where mic stayed muted)
        const remaining = Math.max(0, (self._nextPlayAt ?? 0) - (self._playbackCtx?.currentTime ?? 0));
        setTimeout(() => {
          self._isPlaying = false;
          self.setPlaying(false);
        }, (remaining * 1000) + 80);
      }
    }, 8); // poll every 8ms instead of 20ms — starts playback ~12ms sooner
  }

  interrupt() {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'interrupt' }));
    }
  }

  stop() {
    this._active = false;
    this._ws?.close();
    this._workletNode?.disconnect();
    this._micStream?.getTracks().forEach(t => t.stop());
    this._audioCtx?.close();
    this._playbackCtx?.close();
  }
}


// ── Public API (matches TalkTogetherSession exactly) ─────────────────────────
export class RealtimeTranslateSession {
  /**
   * @param {object} config
   * @param {string} config.micAId           deviceId for participant A's mic
   * @param {string} config.micBId           deviceId for participant B's mic
   * @param {string} config.langA            language display name for participant A
   * @param {string} config.langB            language display name for participant B
   * @param {string} config.apiToken         JWT bearer token
   * @param {string} [config.apiUrl]         base URL (defaults to window.location.origin)
   * @param {Function} config.onTranscript   ({ micId, source, translated }) => void
   * @param {Function} [config.onPartialTranscript]  ({ micId, text, sessionId }) => void
   */
  constructor(config) {
    this.langA = config.langA;
    this.langB = config.langB;

    // Shared echo-gate flags: each session reads the other's flag
    const gateA = { isPlaying: false };
    const gateB = { isPlaying: false };

    this._sessionA = new _DirectionSession({
      id:          'A',
      micId:       config.micAId,
      sourceLang:  config.langA,
      targetLang:  config.langB,
      wsBase:      config.apiUrl || window.location.origin,
      apiToken:    config.apiToken,
      onTranscript:         config.onTranscript,
      onPartialTranscript:  config.onPartialTranscript,
      echoGate:    gateA,          // session A reads its own gate — sibling writes it
      setPlaying:  (v) => { gateA.isPlaying = v; },
    });

    this._sessionB = new _DirectionSession({
      id:          'B',
      micId:       config.micBId,
      sourceLang:  config.langB,
      targetLang:  config.langA,
      wsBase:      config.apiUrl || window.location.origin,
      apiToken:    config.apiToken,
      onTranscript:         config.onTranscript,
      onPartialTranscript:  config.onPartialTranscript,
      echoGate:    gateB,
      setPlaying:  (v) => { gateB.isPlaying = v; },
    });

    // Cross-link: each session's echoGate IS the OTHER session's playing flag
    // so mic A is silenced when session B (the one translating B→A) is playing,
    // and mic B is silenced when session A is playing.
    this._sessionA.echoGate = gateB;  // A mutes when B is playing
    this._sessionB.echoGate = gateA;  // B mutes when A is playing
  }

  async start() {
    await Promise.all([
      this._sessionA.start(),
      this._sessionB.start(),
    ]);
    console.info('[Realtime] Both sessions started (sub-1s latency mode)');
  }

  stop() {
    this._sessionA.stop();
    this._sessionB.stop();
    console.info('[Realtime] Both sessions stopped');
  }
}

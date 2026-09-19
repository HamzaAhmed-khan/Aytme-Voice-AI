import React, { useEffect, useState, useRef, useMemo } from 'react';
import TranscriptLine from './TranscriptLine';

/**
 * Batched, Virtualized Transcript Feed
 * Reduces React re-renders by batching incoming messages every 100ms
 * and using useMemo to limit DOM payload.
 */
const TranscriptFeed = ({
  transcripts,
  participants,
  onParticipantClick,
  botActive,
  targetLanguage
}) => {
  const containerRef = useRef(null);
  const [batchedTranscripts, setBatchedTranscripts] = useState([]);
  
  // 100ms Batching throttle
  useEffect(() => {
    const timeout = setTimeout(() => {
      // Filter out empty and language mismatches for broadcast mode
      const valid = transcripts.filter(t => {
        if (!t.textRaw && !t.textTranslated) return false;
        
        // In broadcast mode, only show transcripts matching target language or source
        if (targetLanguage && targetLanguage !== 'auto') {
          // If this is a translation (DataChannel), it MUST match targetLanguage
          if (t.isAI && t.targetLang && t.targetLang !== targetLanguage) {
            return false;
          }
        }
        return true;
      });
      setBatchedTranscripts(valid);
    }, 100);
    return () => clearTimeout(timeout);
  }, [transcripts, targetLanguage]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [batchedTranscripts]);

  // Render Virtualized Array (DOM limited to last 50 items for speed)
  const renderList = useMemo(() => {
    const visibleTranscripts = batchedTranscripts.slice(-50); // Keep DOM light
    return visibleTranscripts.map((t, idx) => {
      const participant = participants.find(p => p.identity === t.speakerIdentity);
      // Determine if we should treat it as AI
      const isAI = t.isAI || t.speakerIdentity.startsWith('bot-');

      return (
        <TranscriptLine
          key={t.id || `t-${idx}`}
          transcript={t}
          participant={participant}
          isAI={isAI}
          onParticipantClick={onParticipantClick}
        />
      );
    });
  }, [batchedTranscripts, participants, onParticipantClick]);

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-800/50 shadow-2xl relative">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex justify-between items-center sticky top-0 z-10">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Live Transcript {targetLanguage && targetLanguage !== 'auto' ? `(${targetLanguage})` : ''}
        </h3>
        
        {botActive && (
          <div className="flex items-center gap-2">
             <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-emerald-400">AI Active</span>
          </div>
        )}
      </div>

      {/* Feed Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-5 scroll-smooth custom-scrollbar"
      >
        <div className="flex flex-col gap-4">
          {batchedTranscripts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 mt-12 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm">Waiting for speech...</p>
            </div>
          ) : (
            renderList
          )}
        </div>
      </div>
    </div>
  );
};

export default TranscriptFeed;

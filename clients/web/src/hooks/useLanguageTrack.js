import { useState, useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

/**
 * Hook to dynamically bind to a specific language translation track
 * pushed by the BroadcastAudioRouter in the precision media worker.
 */
export function useLanguageTrack(targetLanguage) {
  const room = useRoomContext();
  const [audioTrack, setAudioTrack] = useState(null);

  useEffect(() => {
    if (!room || !targetLanguage) return;

    const findAndSetTrack = () => {
      let activeTrack = null;
      
      room.remoteParticipants.forEach((participant) => {
        // The bot's identity usually starts with "bot-"
        if (participant.identity.startsWith('bot-')) {
          participant.audioTrackPublications.forEach((pub) => {
            // The BroadcastAudioRouter sets the track name exactly to target_lang
            if (pub.trackName === targetLanguage) {
              activeTrack = pub.track;
              
              // Eagerly subscribe if it isn't already
              if (!pub.isSubscribed) {
                pub.setSubscribed(true);
              }
            } else {
              // Unsubscribe from other bot tracks to prevent overlapping audio
              if (pub.isSubscribed) {
                pub.setSubscribed(false);
              }
            }
          });
        }
      });
      
      setAudioTrack(activeTrack);
    };

    // Initial check
    findAndSetTrack();

    // Listen to changes
    room.on(RoomEvent.TrackPublished, findAndSetTrack);
    room.on(RoomEvent.TrackUnpublished, findAndSetTrack);
    room.on(RoomEvent.TrackSubscribed, findAndSetTrack);
    room.on(RoomEvent.TrackUnsubscribed, findAndSetTrack);

    return () => {
      room.off(RoomEvent.TrackPublished, findAndSetTrack);
      room.off(RoomEvent.TrackUnpublished, findAndSetTrack);
      room.off(RoomEvent.TrackSubscribed, findAndSetTrack);
      room.off(RoomEvent.TrackUnsubscribed, findAndSetTrack);
    };
  }, [room, targetLanguage]);

  return audioTrack;
}

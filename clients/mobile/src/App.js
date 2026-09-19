import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { LiveKitRoom, useTracks, VideoTrack, TrackReference } from '@livekit/react-native';
import { Track } from 'livekit-client';

const LIVEKIT_URL = 'wss://your-livekit-url';

export default function App() {
    const [token, setToken] = useState(null);

    useEffect(() => {
        // Fetch token from backend
        fetch('http://localhost:8000/api/v1/rooms/room-name/token')
            .then(res => res.json())
            .then(data => setToken(data.token))
            .catch(err => console.error("Failed to fetch token", err));
    }, []);

    if (!token) {
        return (
            <View style={styles.container}>
                <Text>AYTME Mobile - Connecting...</Text>
            </View>
        );
    }

    return (
        <LiveKitRoom
            video={true}
            audio={true}
            token={token}
            serverUrl={LIVEKIT_URL}
            style={{ flex: 1 }}
        >
            <VideoView />
            <CaptionOverlay />
        </LiveKitRoom>
    );
}

function VideoView() {
    const tracks = useTracks([Track.Source.Camera]);
    return (
        <ScrollView style={styles.videoGrid}>
            {tracks.map((track) => (
                <VideoTrack key={track.participant.identity} trackRef={track} style={styles.video} />
            ))}
        </ScrollView>
    );
}

function CaptionOverlay() {
    // Logic to listen to the Data Channel for the AI-generated captions
    return (
        <View style={styles.captionContainer}>
            <Text style={styles.captionText}>AI Translation Captions will appear here...</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    videoGrid: { flex: 1, width: '100%' },
    video: { width: '100%', height: 300 },
    captionContainer: { position: 'absolute', bottom: 50, width: '100%', padding: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
    captionText: { color: '#fff', fontSize: 18, textAlign: 'center' }
});

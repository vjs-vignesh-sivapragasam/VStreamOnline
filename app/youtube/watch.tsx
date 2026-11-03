import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useYouTubePlayer } from '@/contexts/YouTubePlayerContext';

export default function YouTubeWatchScreen() {
  const router = useRouter();
  const { playVideo, expand } = useYouTubePlayer();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    channel?: string;
    thumbnail?: string;
    duration?: string;
    views?: string;
    published?: string;
  }>();

  useEffect(() => {
    if (params.id) {
      playVideo({
        id: params.id,
        title: params.title || 'YouTube Video',
        channel: params.channel || 'YouTube',
        thumbnail: params.thumbnail || '',
        duration: params.duration,
        views: params.views,
        published: params.published,
      });
      expand();
      if (router.canGoBack()) {
        router.back();
      }
    }
  }, [params.id, params.title, params.channel, params.thumbnail, playVideo, expand, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FF0000" />
      <Text style={styles.loadingText}>Opening YouTube Player...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 14,
    color: '#888888',
    fontSize: 14,
  },
});

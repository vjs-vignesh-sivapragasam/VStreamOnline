import React, { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Language } from '@/hooks/useTamilMv';

export default function WebSeriesScreen() {
  const params = useLocalSearchParams<{
    title?: string;
    language?: Language;
  }>();

  useEffect(() => {
    router.replace({
      pathname: '/(tabs)',
      params: {
        category: 'series',
        title: params.title || 'Web Series & TV Shows',
        language: params.language || 'tamil',
      },
    });
  }, [params.title, params.language]);

  return null;
}

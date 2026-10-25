import React, { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Language, Category } from '@/hooks/useTamilMv';

const TorrentList = () => {
  const { title, language, category } = useLocalSearchParams<{
    title: string;
    language: Language;
    category: Category;
  }>();

  useEffect(() => {
    router.replace({
      pathname: '/(tabs)',
      params: {
        category: category || 'webhd',
        title: title || 'Web HD',
        language: language || 'tamil',
      },
    });
  }, [category, title, language]);

  return null;
};

export default TorrentList;

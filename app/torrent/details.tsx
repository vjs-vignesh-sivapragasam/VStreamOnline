import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  Image,
  Linking,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { StatusBar, Text, View } from '../../components/Themed';
import BottomSpacing from '@/components/BottomSpacing';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported, showAlert } from '@/utils/platform';
import { Ionicons } from '@expo/vector-icons';
import {
  TorrentItem,
  fetchTamilMVTopicMagnets,
  searchTamilMV,
  cleanTopicTitle,
  Language,
  getTamilMVBaseUrl,
} from '@/hooks/useTamilMv';
import { StreamingServerClient, TorrentFile, resolveStreamingServerClient } from '@/clients/stremio';
import { StorageKeys, storageService } from '@/utils/StorageService';
import { downloadService, DownloadItem } from '@/services/DownloadService';
import { myListService } from '@/services/MyListService';
import { tmdbService, TmdbDetails, detectLanguageCode } from '@/services/TmdbService';
import { externalPlayerService } from '@/utils/ExternalPlayerService';
import { ensureEmbeddedServerRunning } from '@/utils/StremioServerManager';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractQualityTag(title: string): string | null {
  const match = title.match(/\b(2160p|1080p|720p|4K)[^)]*?(WEB-?DL|BluRay|WEBRip|HDTV|PreDVD|x265|x264|HEVC|AVC)?/i);
  if (!match) return null;
  return [match[1], match[2]].filter(Boolean).join(' ');
}

function cleanTorrentTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/^(?:https?:\/\/)?(?:www\.)?[^\s-]+\.[a-z]{2,10}\s*[-_:]\s*/i, '')
    .replace(/^[a-z0-9\.-]+\.[a-z]{2,6}\s*[-_:]\s*/i, '')
    .trim();
}

function getMovieSearchTitle(title: string): string {
  if (!title) return '';
  return cleanTopicTitle(title).name;
}

function cleanTitle(title: string): string {
  return cleanTorrentTitle(title);
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

const KNOWN_LANGUAGES: { name: string; regex: RegExp }[] = [
  { name: 'Tamil', regex: /\b(tamil|tam)\b/i },
  { name: 'English', regex: /\b(english|eng)\b/i },
  { name: 'Telugu', regex: /\b(telugu|tel)\b/i },
  { name: 'Hindi', regex: /\b(hindi|hin)\b/i },
  { name: 'Malayalam', regex: /\b(malayalam|mal)\b/i },
  { name: 'Kannada', regex: /\b(kannada|kan)\b/i },
  { name: 'Korean', regex: /\b(korean|kor)\b/i },
  { name: 'Japanese', regex: /\b(japanese|jap)\b/i },
  { name: 'Chinese', regex: /\b(chinese|chi)\b/i },
  { name: 'Spanish', regex: /\b(spanish|spa)\b/i },
  { name: 'French', regex: /\b(french|fre)\b/i },
  { name: 'German', regex: /\b(german|ger)\b/i },
];

function extractLanguagesFromText(text: string): string[] {
  if (!text) return [];
  const matches: { name: string; index: number }[] = [];

  // 1. Look inside square brackets [ ... ] or parentheses ( ... ) where audio languages are listed
  const bracketMatches = Array.from(text.matchAll(/[\[\(]([^\]\)]+)[\]\)]/g));
  const bracketText = bracketMatches.map((m) => m[1]).join(' ');
  const target = bracketText.length > 0 ? bracketText : text;

  for (const lang of KNOWN_LANGUAGES) {
    const idx = target.search(lang.regex);
    if (idx !== -1) {
      matches.push({ name: lang.name, index: idx });
    }
  }

  // 2. Fallback to searching the whole title if bracket text didn't match languages
  if (matches.length === 0 && target !== text) {
    for (const lang of KNOWN_LANGUAGES) {
      const idx = text.search(lang.regex);
      if (idx !== -1) {
        matches.push({ name: lang.name, index: idx });
      }
    }
  }

  matches.sort((a, b) => a.index - b.index);
  return matches.map((m) => m.name);
}

function getAllMovieLanguages(
  topicTitle: string,
  items: TorrentItem[],
  tmdbLanguages?: string,
  fallbackLang: string = 'Tamil'
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (lang: string) => {
    if (!lang) return;
    const key = lang.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      const formatted = lang.trim().charAt(0).toUpperCase() + lang.trim().slice(1);
      result.push(formatted);
    }
  };

  // 1. Extract from topic title
  extractLanguagesFromText(topicTitle).forEach(add);

  // 2. Extract from variant torrent item titles & language tags
  if (items && items.length > 0) {
    for (const it of items) {
      if (it.title) {
        extractLanguagesFromText(it.title).forEach(add);
      }
      if (it.language) {
        const normalized = it.language.charAt(0).toUpperCase() + it.language.slice(1).toLowerCase();
        if (['Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English'].includes(normalized)) {
          add(normalized);
        }
      }
    }
  }

  // 3. Extract from TMDB languages
  if (tmdbLanguages) {
    const list = tmdbLanguages.split(',').map((s) => s.trim()).filter(Boolean);
    for (const t of list) {
      const match = KNOWN_LANGUAGES.find((k) => k.regex.test(t));
      if (match) add(match.name);
      else if (t.length > 0 && t.length < 25) add(t);
    }
  }

  // 4. Fallback if empty
  if (result.length === 0 && fallbackLang) {
    add(fallbackLang);
  }

  return result;
}

function getItemLanguages(item: TorrentItem, topicTitle?: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (lang: string) => {
    if (!lang) return;
    const formatted = lang.trim().charAt(0).toUpperCase() + lang.trim().slice(1).toLowerCase();
    const key = formatted.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(formatted);
    }
  };

  // 1. Extract from item title
  if (item.title) {
    extractLanguagesFromText(item.title).forEach(add);
  }
  // 2. Extract from item name
  if (item.name && item.name !== item.title) {
    extractLanguagesFromText(item.name).forEach(add);
  }

  // 3. If item mentions multi-audio or dual-audio, or has no specific languages,
  // check if topicTitle has languages
  const combinedText = `${item.title || ''} ${item.name || ''}`.toLowerCase();
  const isMultiOrDual = combinedText.includes('multi') || combinedText.includes('dual');

  if ((result.length === 0 || isMultiOrDual) && topicTitle) {
    extractLanguagesFromText(topicTitle).forEach(add);
  }

  // 4. Check item.language (only as a fallback if nothing detected yet)
  if (result.length === 0 && item.language) {
    const formatted = item.language.trim().charAt(0).toUpperCase() + item.language.trim().slice(1).toLowerCase();
    if (['Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English'].includes(formatted)) {
      add(formatted);
    }
  }

  return result;
}

function parseQualityMeta(title: string) {
  const is4K = /\b(4k|2160p|uhd)\b/i.test(title);
  const is1080p = /\b(1080p|fhd)\b/i.test(title);
  const is720p = /\b(720p|hd)\b/i.test(title);

  let resolution = '';
  if (is4K) resolution = '4K UHD';
  else if (is1080p) resolution = '1080p';
  else if (is720p) resolution = '720p';
  else {
    const resMatch = title.match(/\b(\d{3,4}p)\b/i);
    if (resMatch) resolution = resMatch[1];
  }

  const sizeMatch = title.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))\b/i);
  const fileSize = sizeMatch ? sizeMatch[1].toUpperCase() : null;

  const audioMatch = title.match(/\b(DDP\s*5\.1|DD\+?\s*5\.1|Atmos|AAC(?:\s*2\.0)?|AC3|5\.1)\b/i);
  const audio = audioMatch ? audioMatch[1] : null;

  const codecMatch = title.match(/\b(HEVC|x265|x264|AVC|10bit|HDR10\+?|HDR)\b/i);
  const codec = codecMatch ? codecMatch[1].toUpperCase() : null;

  const languages = extractLanguagesFromText(title);

  return {
    is4K,
    is1080p,
    is720p,
    resolution,
    fileSize,
    audio,
    codec,
    languages,
  };
}

const LANGUAGE_NAMES: Record<Language, string> = {
  tamil: 'Tamil',
  english: 'English',
  malayalam: 'Malayalam',
  hindi: 'Hindi',
  telugu: 'Telugu',
  kannada: 'Kannada',
};

// ─── Component ────────────────────────────────────────────────────────────────
const TorrentDetails = () => {
  const {
    title,
    poster,
    publishDate,
    type,
    allItems: allItemsRaw,
    topicUrl,
    groupid,
  } = useLocalSearchParams<{
    title: string;
    poster: string;
    publishDate?: string;
    type?: string;
    allItems?: string;
    topicUrl?: string;
    groupid?: string;
  }>();

  const { height, width } = useWindowDimensions();
  const isPortrait = height > width;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const { theme } = useTheme();

  // ── TMDB State ──
  const [tmdbData, setTmdbData] = useState<TmdbDetails | null>(null);
  const [isTmdbLoading, setIsTmdbLoading] = useState(true);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

  // ── File picker & Download state ──
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [downloadingGuid, setDownloadingGuid] = useState<string | null>(null);
  const [activeDownloadsMap, setActiveDownloadsMap] = useState<Record<string, DownloadItem>>({});
  const [pickerFiles, setPickerFiles] = useState<TorrentFile[]>([]);
  const [pendingItem, setPendingItem] = useState<TorrentItem | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState<'stream' | 'download'>('stream');
  const [qualityModalVisible, setQualityModalVisible] = useState(false);
  const [qualityModalMode, setQualityModalMode] = useState<'watch' | 'download'>('watch');

  // Fetch TMDB data for Cast, Crew, Trailer, Recommendations, Information
  useEffect(() => {
    let isMounted = true;
    setIsTmdbLoading(true);

    tmdbService.getMovieFullInfo(title, undefined, type)
      .then((info) => {
        if (isMounted) {
          setTmdbData(info);
        }
      })
      .catch((err) => {
        console.warn('[TorrentDetails] Failed to fetch TMDB info:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsTmdbLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [title, type]);

  // Subscribe to real-time download updates (speed, peers, progress)
  useEffect(() => {
    const unsubscribe = downloadService.addListener((items) => {
      const map: Record<string, DownloadItem> = {};
      items.forEach((d) => {
        map[d.infoHash] = d;
      });
      setActiveDownloadsMap(map);
    });
    return unsubscribe;
  }, []);

  const [items, setItems] = useState<TorrentItem[]>(() => {
    try {
      return allItemsRaw ? JSON.parse(allItemsRaw) : [];
    } catch {
      return [];
    }
  });
  const [isLoadingVariants, setIsLoadingVariants] = useState(false);

  // When items have no valid magnet URLs (e.g. from TamilMV website search, or Recommended movies),
  // fetch from topicUrl / groupid, OR auto-search TamilMV by title
  useEffect(() => {
    let isMounted = true;

    const rawParsed: TorrentItem[] = allItemsRaw ? (() => {
      try { return JSON.parse(allItemsRaw); } catch { return []; }
    })() : [];

    const hasRealMagnets = rawParsed.length > 0 && rawParsed.some(i => i.magnetUrl && i.magnetUrl.startsWith('magnet:?'));
    if (hasRealMagnets) {
      setItems(rawParsed);
      setIsLoadingVariants(false);
      return;
    }

    const targetUrl = topicUrl || (groupid?.startsWith('http') ? groupid : null) || (rawParsed[0]?.groupid?.startsWith('http') ? rawParsed[0].groupid : null);
    if (targetUrl) {
      setIsLoadingVariants(true);
      fetchTamilMVTopicMagnets(targetUrl)
        .then(res => {
          if (isMounted) {
            if (res.items.length > 0) {
              setItems(res.items);
            } else {
              setItems(rawParsed);
            }
          }
        })
        .catch(err => {
          console.warn('[TorrentDetails] Failed to fetch topic magnets:', err);
          if (isMounted) setItems(rawParsed);
        })
        .finally(() => {
          if (isMounted) setIsLoadingVariants(false);
        });
      return;
    }

    // Auto-search TamilMV when opened with just a title (e.g. Recommended or Similar movies)
    const searchTitle = getMovieSearchTitle(title);
    if (searchTitle) {
      setIsLoadingVariants(true);
      searchTamilMV(searchTitle, 'all')
        .then(async (groups) => {
          if (!isMounted) return;
          if (groups && groups.length > 0) {
            const targetYear = publishDate ? new Date(publishDate).getFullYear().toString() : null;
            let candidateGroup = targetYear
              ? groups.find(g => g.year === targetYear) || groups[0]
              : groups[0];

            const candidateGroups = [candidateGroup, ...groups.filter(g => g !== candidateGroup)].slice(0, 3);

            for (const grp of candidateGroups) {
              const bestCandidate = grp.items.find(i => i.groupid?.startsWith('http')) || grp.items[0];
              const topic = bestCandidate?.groupid || bestCandidate?.guid;
              if (topic && topic.startsWith('http')) {
                try {
                  const res = await fetchTamilMVTopicMagnets(topic);
                  if (isMounted && res.items.length > 0) {
                    setItems(res.items);
                    return;
                  }
                } catch (e) {
                  console.warn('[TorrentDetails] Error fetching topic magnets:', topic, e);
                }
              }
            }
          }
          if (isMounted) {
            setItems([]);
          }
        })
        .catch(err => {
          console.warn('[TorrentDetails] Auto-search failed for title:', searchTitle, err);
          if (isMounted) setItems([]);
        })
        .finally(() => {
          if (isMounted) setIsLoadingVariants(false);
        });
    } else {
      setItems(rawParsed);
      setIsLoadingVariants(false);
    }

    return () => {
      isMounted = false;
    };
  }, [allItemsRaw, topicUrl, groupid, title, publishDate]);

  const allItems = items;

  // ── My List status & toggle ──
  const [inMyList, setInMyList] = useState(() => myListService.isInMyList(title));

  useEffect(() => {
    setInMyList(myListService.isInMyList(title));
    const unsubscribe = myListService.subscribe(() => {
      setInMyList(myListService.isInMyList(title));
    });
    return unsubscribe;
  }, [title]);

  const handleToggleMyList = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const added = await myListService.toggleMyList({
      id: title,
      title,
      poster: poster ?? tmdbData?.posterUrl ?? '',
      publishDate,
      type,
      guid: allItems[0]?.guid,
      groupid: allItems[0]?.groupid,
      infoHash: allItems[0]?.infoHash,
      magnetUrl: allItems[0]?.magnetUrl,
      allItems,
    });
    setInMyList(added);
  };

  // Resolve the TamilMV web page URL for this movie
  const getMovieWebUrl = useCallback((): string => {
    const currentBase = getTamilMVBaseUrl();
    const candidate =
      topicUrl ||
      (groupid?.startsWith('http') ? groupid : null) ||
      allItems.find((i) => i.groupid && i.groupid.startsWith('http'))?.groupid ||
      allItems.find((i) => i.guid && i.guid.startsWith('http') && i.guid.includes('/forums/topic/'))?.guid;

    if (candidate) {
      try {
        const parsed = new URL(candidate);
        const baseParsed = new URL(currentBase);
        return `${baseParsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        if (candidate.startsWith('/')) {
          return `${currentBase.replace(/\/$/, '')}${candidate}`;
        }
        return candidate;
      }
    }

    // Fallback: search TamilMV for this movie title
    const searchName = getMovieSearchTitle(tmdbData?.title || title);
    return `${currentBase.replace(/\/$/, '')}/index.php?/search/&q=${encodeURIComponent(searchName)}&quick=1`;
  }, [topicUrl, groupid, allItems, tmdbData?.title, title]);

  const handleOpenWebPage = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const webUrl = getMovieWebUrl();
    router.push({
      pathname: '/browser',
      params: { url: webUrl },
    } as any);
  }, [getMovieWebUrl]);

  const handleOpenExternalWebPage = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const webUrl = getMovieWebUrl();
    try {
      const supported = await Linking.canOpenURL(webUrl);
      if (supported) {
        await Linking.openURL(webUrl);
        return;
      }
    } catch {}
    router.push({
      pathname: '/browser',
      params: { url: webUrl },
    } as any);
  }, [getMovieWebUrl]);

  // ── Language Detection & Category Feeds (matching index.tsx categories) ──
  const movieLanguage: Language = useMemo(() => {
    const rawParsed: TorrentItem[] = allItemsRaw ? (() => {
      try { return JSON.parse(allItemsRaw); } catch { return []; }
    })() : [];
    const firstLang = rawParsed[0]?.language?.toLowerCase() || items[0]?.language?.toLowerCase();
    if (firstLang && ['tamil', 'telugu', 'hindi', 'malayalam', 'kannada', 'english'].includes(firstLang)) {
      return firstLang as Language;
    }
    const code = detectLanguageCode(title);
    const codeMap: Record<string, Language> = {
      ta: 'tamil',
      te: 'telugu',
      hi: 'hindi',
      ml: 'malayalam',
      kn: 'kannada',
      en: 'english',
    };
    return codeMap[code] || 'tamil';
  }, [allItemsRaw, items, title]);

  const displayLanguage = LANGUAGE_NAMES[movieLanguage] || 'Tamil';
  const isSeries = type === 'series';

  // ── Available Languages (Detected from title, torrent items, and TMDB) ──
  const availableLanguages = useMemo(() => {
    if (items && items.length > 0) {
      const allVariantLangs = new Set<string>();
      items.forEach((it) => {
        getItemLanguages(it, title).forEach((l) => allVariantLangs.add(l));
      });
      if (allVariantLangs.size > 0) {
        return Array.from(allVariantLangs);
      }
    }
    return getAllMovieLanguages(title, items, tmdbData?.languages, displayLanguage);
  }, [title, items, tmdbData?.languages, displayLanguage]);

  // ── Modal Language Filter State ──
  const [selectedModalLanguage, setSelectedModalLanguage] = useState<string>('All');

  const languageCounts = useMemo(() => {
    const counts: Record<string, number> = { All: allItems.length };
    availableLanguages.forEach((lang) => {
      counts[lang] = allItems.filter((item) =>
        getItemLanguages(item, title).some((l) => l.toLowerCase() === lang.toLowerCase())
      ).length;
    });
    return counts;
  }, [allItems, availableLanguages, title]);

  const filteredModalItems = useMemo(() => {
    if (selectedModalLanguage === 'All') return allItems;
    return allItems.filter((item) => {
      const langs = getItemLanguages(item, title);
      return langs.some((l) => l.toLowerCase() === selectedModalLanguage.toLowerCase());
    });
  }, [allItems, selectedModalLanguage, title]);

  // ── Metadata Values for Hero Header ──
  const releaseYear = tmdbData?.year || (publishDate ? new Date(publishDate).getFullYear().toString() : '');
  const genresText = tmdbData?.genres
    ? tmdbData.genres.split(',').slice(0, 3).map((g) => g.trim()).join(', ')
    : '';
  const runtimeText = tmdbData?.runtimeFormatted || (isSeries ? 'Series' : '');
  const certificationText = tmdbData?.certification || '';

  const imdbRating = tmdbData?.imdbRating;
  const tmdbRating = tmdbData?.tmdbRating;
  const rtScore = tmdbData?.rtScore;
  const audienceScore = tmdbData?.audienceScore;

  // ── Trailer Press Handler ──
  const handleTrailerPress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await tmdbService.openYouTubeTrailer(tmdbData?.trailerKey, title);
  };

  // ── Watch Now Handler ──
  const handleWatchNow = async (preselectedLang?: string) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (isLoadingVariants) {
      showAlert('Loading Streams', 'Fetching available streaming qualities. Please wait a moment...');
      return;
    }

    if (allItems.length > 0) {
      setSelectedModalLanguage(preselectedLang || 'All');
      setQualityModalMode('watch');
      setQualityModalVisible(true);
    } else {
      showAlert(
        'No Streams Found',
        'No direct torrent streams were found for this title on TamilMV. You can search manually in the Search tab or open Web View.'
      );
    }
  };

  // ── Download Button Handler ──
  const handleDownloadPress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (isLoadingVariants) {
      showAlert('Loading Downloads', 'Fetching available download qualities. Please wait a moment...');
      return;
    }

    if (allItems.length > 0) {
      setSelectedModalLanguage('All');
      setQualityModalMode('download');
      setQualityModalVisible(true);
    } else {
      showAlert(
        'No Downloads Found',
        'No direct torrent files were found for this title on TamilMV. You can search manually in the Search tab or open Web View.'
      );
    }
  };

  const hasActiveDownload = allItems.some(
    (i) => activeDownloadsMap[i.infoHash]?.status === 'downloading'
  );
  const hasCompletedDownload = allItems.some(
    (i) => activeDownloadsMap[i.infoHash]?.status === 'completed'
  );

  const formattedDate = publishDate
    ? new Date(publishDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    : null;

  // ── Navigate to player ──
  const navigateToPlayer = (item: TorrentItem, fileIdx: number) => {
    const streamList = allItems.length > 0 ? allItems : [item];
    const itemIndex = streamList.findIndex(
      (i) => (i.guid && i.guid === item.guid) || (i.infoHash && i.infoHash === item.infoHash)
    );
    const selectedIdx = itemIndex >= 0 ? itemIndex : 0;

    const streams = JSON.stringify(
      streamList.map((it) => ({
        name: it.title,
        title: it.title,
        infoHash: it.infoHash,
        magnet: it.magnetUrl,
        magnetLink: it.magnetUrl,
        fileIdx: it.guid === item.guid || it.infoHash === item.infoHash ? fileIdx : -1,
      }))
    );

    router.push({
      pathname: '/stream/player',
      params: {
        streams,
        selectedStreamIndex: String(selectedIdx),
        title: tmdbData?.title || cleanTitle(title),
        poster: poster ?? tmdbData?.posterUrl ?? '',
        allItems: JSON.stringify(allItems),
      },
    });
  };

  // ── Handle stream: fetch files via /create, auto-select or show picker ──
  const handleStream = async (item: TorrentItem) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setLoadingItem(item.guid);
    try {
      // Warm up embedded streaming server
      ensureEmbeddedServerRunning().catch(() => {});

      const client = await resolveStreamingServerClient();
      const files = await client.getTorrentFiles(item.infoHash, 4000, item.magnetUrl).catch(() => []);

      if (files && files.length > 1) {
        // Filter out non-video files (txt, nfo, sample)
        const videoFiles = files.filter((f) => {
          const ext = f.name.split('.').pop()?.toLowerCase();
          return ['mkv', 'mp4', 'avi', 'mov', 'ts', 'webm', 'm4v'].includes(ext || '');
        });

        if (videoFiles.length === 1) {
          // Exactly 1 main video file
          setQualityModalVisible(false);
          navigateToPlayer(item, videoFiles[0].id);
        } else if (videoFiles.length > 1) {
          // Multiple video files (episodes or multi-part)
          setQualityModalVisible(false);
          setPendingItem(item);
          setPickerFiles(videoFiles);
          setPickerMode('stream');
          setPickerVisible(true);
        } else {
          // Fallback to largest file
          const sorted = [...files].sort((a, b) => b.length - a.length);
          setQualityModalVisible(false);
          navigateToPlayer(item, sorted[0]?.id ?? -1);
        }
      } else if (files && files.length === 1) {
        setQualityModalVisible(false);
        navigateToPlayer(item, files[0].id);
      } else {
        // fileIdx -1 lets the streaming server automatically guess the largest movie file
        setQualityModalVisible(false);
        navigateToPlayer(item, -1);
      }
    } catch (e) {
      console.warn('[TorrentDetails] Could not fetch file list from streaming server:', e);
      setQualityModalVisible(false);
      navigateToPlayer(item, -1);
    } finally {
      setLoadingItem(null);
    }
  };

  // ── Download handlers ──
  const executeDownload = async (item: TorrentItem, fileIdx: number, fileName?: string, fileLength?: number) => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const client = await resolveStreamingServerClient();
      const streamUrl = await client.getStreamingURL(item.infoHash, fileIdx, item.magnetUrl);
      const clean = cleanTitle(item.title);
      const finalFileName = fileName || `${clean}.mp4`;

      await downloadService.startDownload({
        infoHash: item.infoHash,
        fileIdx,
        title: clean,
        poster: poster ?? tmdbData?.posterUrl ?? '',
        fileName: finalFileName,
        streamUrl,
        fileLength,
      });
    } catch (err: any) {
      showAlert('Download Failed', err?.message || 'Could not start download');
    }
  };

  const handleDownload = async (item: TorrentItem) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setDownloadingGuid(item.guid);
    try {
      const clean = cleanTitle(item.title);
      const client = await resolveStreamingServerClient();
      const files = await client.getTorrentFiles(item.infoHash, 4000, item.magnetUrl).catch(() => []);

      if (files && files.length > 1) {
        setPendingItem(item);
        setPickerFiles(files);
        setPickerMode('download');
        setPickerVisible(true);
      } else {
        const fileIdx = files && files.length === 1 ? files[0].id : 0;
        const fileName = files && files.length === 1 ? files[0].name : `${clean}.mp4`;
        const fileLength = files && files.length === 1 ? files[0].length : undefined;
        await executeDownload(item, fileIdx, fileName, fileLength);
      }
    } catch {
      await executeDownload(item, 0);
    } finally {
      setDownloadingGuid(null);
    }
  };

  const handleFilePick = (file: TorrentFile) => {
    setPickerVisible(false);
    if (!pendingItem) return;
    if (pickerMode === 'download') {
      executeDownload(pendingItem, file.id, file.name, file.length);
    } else {
      navigateToPlayer(pendingItem, file.id);
    }
  };

  // Movie backdrop image or poster fallback
  const backdropUri = tmdbData?.backdropUrl || poster;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <StatusBar />

        {/* ── Cinematic Backdrop Banner with Back Button & Gradient Fade ── */}
        <View style={styles.backdropWrap}>
          {backdropUri ? (
            <Image
              source={{ uri: backdropUri }}
              style={styles.backdropImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.backdropImage, { backgroundColor: '#101010' }]} />
          )}

          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.85)', '#000000']}
            locations={[0, 0.4, 0.8, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Circular Back Button (top left) */}
          <TouchableOpacity
            style={[styles.backButton, { top: Math.max(insets.top + 6, 20) }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </TouchableOpacity>

          {/* Circular Web Page Button (top right, near My List) */}
          <TouchableOpacity
            style={[
              styles.webPageButton,
              { top: Math.max(insets.top + 6, 20) },
            ]}
            onPress={handleOpenWebPage}
            onLongPress={handleOpenExternalWebPage}
            activeOpacity={0.7}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            accessibilityRole="button"
            accessibilityLabel="Open Movie Web Page"
            accessibilityHint="Opens TamilMV movie page in built-in browser"
          >
            <Ionicons name="globe-outline" size={21} color="#ffffff" />
          </TouchableOpacity>

          {/* Circular My List Button (top right in front of poster image) */}
          <TouchableOpacity
            style={[
              styles.bookmarkButton,
              inMyList && {
                backgroundColor: theme.primary + '33',
                borderWidth: 1,
                borderColor: theme.primary,
              },
              { top: Math.max(insets.top + 6, 20) },
            ]}
            onPress={handleToggleMyList}
            activeOpacity={0.7}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            accessibilityRole="button"
            accessibilityLabel={inMyList ? 'Remove from My List' : 'Add to My List'}
          >
            <Ionicons
              name={inMyList ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={inMyList ? theme.primary : '#ffffff'}
            />
          </TouchableOpacity>
        </View>

        {/* ── Movie Title (Centered & Bold) ── */}
        <View style={styles.titleSection}>
          <Text style={styles.movieTitleMain}>{getMovieSearchTitle(tmdbData?.title || title)}</Text>

          {/* Metadata Row: 2024 · Adventure, Thriller · 2h 15m · PG-13 */}
          {(releaseYear || genresText || runtimeText) ? (
            <Text style={styles.metaRowText} numberOfLines={1}>
              {[releaseYear, genresText, runtimeText, certificationText].filter(Boolean).join('  ·  ')}
            </Text>
          ) : null}

          {/* Ratings Badges Row (IMDb, TMDB, RT, Popcorn) */}
          {(imdbRating || tmdbRating) && (
            <View style={styles.ratingsRow}>
              {imdbRating ? (
                <View style={styles.badgePill}>
                  <View style={styles.imdbLabel}>
                    <Text style={styles.imdbLabelText}>IMDb</Text>
                  </View>
                  <Text style={styles.badgeScoreText}>{imdbRating}</Text>
                </View>
              ) : null}

              {tmdbRating ? (
                <View style={styles.badgePill}>
                  <View style={styles.tmdbLabel}>
                    <Text style={styles.tmdbLabelText}>TMDB</Text>
                  </View>
                  <Text style={styles.badgeScoreText}>{tmdbRating}</Text>
                </View>
              ) : null}

              {rtScore ? (
                <View style={styles.badgePill}>
                  <View style={styles.rtLabel}>
                    <Text style={styles.rtLabelText}>RT</Text>
                  </View>
                  <Text style={styles.badgeScoreText}>{rtScore}</Text>
                </View>
              ) : null}

              {audienceScore ? (
                <View style={[styles.badgePill, styles.popcornPill]}>
                  <Text style={styles.popcornText}>🍿 {audienceScore}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Languages Badges Row: [ 🔊 Tamil ] [ 🔊 English ] ... */}
          {availableLanguages.length > 0 && (
            <View style={styles.languagesBadgeRow}>
              <View style={styles.languagesPillsWrap}>
                <View style={styles.languagesInlineHeader}>
                  <Ionicons name="volume-medium" size={13} color={theme.primary} style={{ marginRight: 4 }} />
                  <Text style={[styles.languagesHeaderLabel, { color: theme.primary }]}>
                    {availableLanguages.length > 1 ? 'Audio:' : 'Language:'}
                  </Text>
                </View>
                {availableLanguages.map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={styles.languagePill}
                    onPress={() => handleWatchNow(lang)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.languagePillText}>{lang}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── Action Row (Trailer on Left, Centered Play, Download on Right) ── */}
        <View style={styles.actionRowContainer}>
          {/* Left: Circular Trailer Button */}
          <TouchableOpacity
            style={styles.circularActionBtn}
            onPress={handleTrailerPress}
            activeOpacity={0.7}
          >
            <Ionicons name="film-outline" size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Center: Play Pill Button */}
          <TouchableOpacity
            style={styles.watchNowBtn}
            onPress={() => handleWatchNow()}
            activeOpacity={0.8}
            disabled={isLoadingVariants}
          >
            {isLoadingVariants ? (
              <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />
            ) : (
              <Ionicons name="play" size={20} color="#000000" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.watchNowBtnText}>
              {isLoadingVariants ? 'Loading...' : 'Play'}
            </Text>
          </TouchableOpacity>

          {/* Right: Circular Download Button */}
          <TouchableOpacity
            style={[
              styles.circularActionBtn,
              hasActiveDownload && {
                backgroundColor: theme.primary + '25',
                borderColor: theme.primary,
                borderWidth: 1,
              },
              hasCompletedDownload && styles.circularActionBtnCompleted,
            ]}
            onPress={handleDownloadPress}
            activeOpacity={0.7}
            disabled={isLoadingVariants}
          >
            {hasActiveDownload ? (
              <Ionicons name="arrow-down" size={22} color={theme.primary} />
            ) : hasCompletedDownload ? (
              <Ionicons name="checkmark-circle" size={22} color="#00e676" />
            ) : (
              <Ionicons name="download-outline" size={22} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Overview Description Paragraph ── */}
        {tmdbData?.overview ? (
          <View style={styles.overviewContainer}>
            <Text
              style={styles.overviewText}
              numberOfLines={isOverviewExpanded ? undefined : 3}
            >
              {tmdbData.overview}
            </Text>
            {tmdbData.overview.length > 120 && (
              <TouchableOpacity
                onPress={() => setIsOverviewExpanded(!isOverviewExpanded)}
                style={styles.moreButton}
                activeOpacity={0.7}
              >
                <Text style={styles.moreButtonText}>
                  {isOverviewExpanded ? 'LESS' : 'MORE'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* ── Section: Cast & Crew ── */}
        {tmdbData?.cast && tmdbData.cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast & Crew</Text>
            <FlatList
              data={tmdbData.cast}
              keyExtractor={(item) => `cast-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.castListContent}
              renderItem={({ item }) => (
                <View style={styles.castCard}>
                  <View style={styles.castAvatarWrap}>
                    {item.profileUrl ? (
                      <Image
                        source={{ uri: item.profileUrl }}
                        style={styles.castAvatar}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.castAvatarFallback}>
                        <Ionicons name="person" size={28} color="#555555" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.castName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.character ? (
                    <Text style={styles.castCharacter} numberOfLines={2}>
                      {item.character}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          </View>
        )}

        {/* ── Section: Information ── */}
        {(tmdbData || formattedDate || availableLanguages.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Information</Text>
            <View style={styles.infoTable}>
              {tmdbData?.releaseDateFormatted ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Released On:</Text>
                  <Text style={styles.infoValue}>{tmdbData.releaseDateFormatted}</Text>
                </View>
              ) : formattedDate ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Released On:</Text>
                  <Text style={styles.infoValue}>{formattedDate}</Text>
                </View>
              ) : null}

              {tmdbData?.imdbRating ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>IMDB Rating:</Text>
                  <View style={styles.ratingValueRow}>
                    <Text style={styles.infoValue}>{tmdbData.imdbRating}</Text>
                    <Ionicons name="star" size={13} color="#f5c518" style={{ marginLeft: 4 }} />
                  </View>
                </View>
              ) : null}

              {tmdbData?.genres ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Genre:</Text>
                  <Text style={styles.infoValue}>{tmdbData.genres}</Text>
                </View>
              ) : null}

              {tmdbData?.runtimeFormatted ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Runtime:</Text>
                  <Text style={styles.infoValue}>{tmdbData.runtimeFormatted}</Text>
                </View>
              ) : null}

              {tmdbData?.country ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Country:</Text>
                  <Text style={styles.infoValue}>{tmdbData.country}</Text>
                </View>
              ) : null}

              {availableLanguages.length > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Languages:</Text>
                  <Text style={styles.infoValue}>{availableLanguages.join(', ')}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <BottomSpacing space={60} />
      </ScrollView>

      {/* ── Choose Quality Modal (Watch Now / Download) ── */}
      <Modal
        visible={qualityModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setQualityModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setQualityModalVisible(false)}>
          <Pressable
            style={[styles.qualityModalSheet, { paddingBottom: Math.max(insets.bottom, 20) + 10 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.qualityModalHeader}>
              <View style={styles.modalHandle} />
              <View style={styles.qualityModalHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {qualityModalMode === 'watch' ? 'Choose Quality to Play' : 'Choose Quality to Download'}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {filteredModalItems.length} {filteredModalItems.length === 1 ? 'quality' : 'qualities'} available •{' '}
                    {qualityModalMode === 'watch' ? 'Tap to start playback' : 'Tap to start download'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setQualityModalVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color="#8E8E93" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Language Filter Chips in Modal */}
            {availableLanguages.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.modalFilterScrollView}
                contentContainerStyle={styles.modalFilterScroll}
              >
                {['All', ...availableLanguages].map((lang) => {
                  const isSelected = selectedModalLanguage === lang;
                  const count = languageCounts[lang] ?? 0;
                  return (
                    <TouchableOpacity
                      key={lang}
                      style={[
                        styles.modalFilterChip,
                        isSelected && [
                          styles.modalFilterChipActive,
                          { backgroundColor: theme.primary, borderColor: theme.primary },
                        ],
                      ]}
                      onPress={() => setSelectedModalLanguage(lang)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={lang === 'All' ? 'layers-outline' : 'volume-medium'}
                        size={13}
                        color={isSelected ? '#000000' : theme.primary}
                        style={{ marginRight: 2 }}
                      />
                      <Text
                        style={[
                          styles.modalFilterChipText,
                          isSelected && styles.modalFilterChipTextActive,
                        ]}
                      >
                        {lang}
                      </Text>
                      <View
                        style={[
                          styles.modalFilterChipCount,
                          isSelected && styles.modalFilterChipCountActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalFilterChipCountText,
                            isSelected && { color: '#000000' },
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {filteredModalItems.length === 0 ? (
              <View style={styles.emptyFilterContainer}>
                <Ionicons name="filter-outline" size={32} color="#8E8E93" />
                <Text style={styles.emptyFilterTitle}>No qualities found for {selectedModalLanguage}</Text>
                <Text style={styles.emptyFilterSubtitle}>
                  This title may only have other audio languages available.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyFilterBtn, { backgroundColor: theme.primary }]}
                  onPress={() => setSelectedModalLanguage('All')}
                >
                  <Text style={styles.emptyFilterBtnText}>Show All ({allItems.length})</Text>
                </TouchableOpacity>
              </View>
            ) : (
            <FlatList
              data={filteredModalItems}
              keyExtractor={(item, index) => item.guid || `${item.infoHash}-${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.qualityListContent}
              renderItem={({ item, index }) => {
                const clean = cleanTitle(item.title);
                const qualityTag = extractQualityTag(clean);
                const meta = parseQualityMeta(clean);
                const isLast = index === allItems.length - 1;
                const isLoadingStream = loadingItem === item.guid;
                const isStartingDownload = downloadingGuid === item.guid;
                const downloadInfo = activeDownloadsMap[item.infoHash];
                const isItemCompleted = downloadInfo?.status === 'completed';
                const isItemDownloading = downloadInfo?.status === 'downloading';
                const isItemPaused = downloadInfo?.status === 'paused';
                const isWatchMode = qualityModalMode === 'watch';

                return (
                  <TouchableOpacity
                    key={item.guid || item.infoHash}
                    style={[
                      styles.qualityOptionCard,
                      isLast && styles.qualityOptionCardLast,
                      isItemCompleted && styles.qualityOptionCardCompleted,
                    ]}
                    onPress={() => {
                      if (isWatchMode) {
                        setQualityModalVisible(false);
                        if (isItemCompleted && downloadInfo?.fileUri) {
                          router.push({
                            pathname: '/stream/player' as any,
                            params: {
                              videoUrl: downloadInfo.fileUri,
                              title: clean,
                              poster: poster ?? tmdbData?.posterUrl ?? '',
                            },
                          });
                        } else {
                          handleStream(item);
                        }
                      } else {
                        // Download Mode
                        if (isItemCompleted) {
                          setQualityModalVisible(false);
                          externalPlayerService.promptPlayerSelection({
                            fileUri: downloadInfo.fileUri,
                            title: clean,
                            poster: poster ?? tmdbData?.posterUrl ?? '',
                            fileLength: downloadInfo.totalBytes,
                            onPlayInternal: () => {
                              router.push({
                                pathname: '/stream/player' as any,
                                params: {
                                  videoUrl: downloadInfo.fileUri,
                                  title: clean,
                                  poster: poster ?? tmdbData?.posterUrl ?? '',
                                },
                              });
                            },
                          });
                        } else if (isItemDownloading) {
                          downloadService.pauseDownload(downloadInfo.id);
                        } else if (isItemPaused) {
                          downloadService.resumeDownload(downloadInfo.id);
                        } else {
                          setQualityModalVisible(false);
                          handleDownload(item);
                        }
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.qualityPillBadge,
                        meta.is4K && styles.qualityPillBadge4K,
                        meta.is1080p && styles.qualityPillBadge1080p,
                        meta.is720p && styles.qualityPillBadge720p,
                      ]}
                    >
                      <Text
                        style={[
                          styles.qualityPillText,
                          meta.is4K && styles.qualityPillText4K,
                          meta.is1080p && styles.qualityPillText1080p,
                          meta.is720p && styles.qualityPillText720p,
                        ]}
                      >
                        {meta.resolution || qualityTag || 'HD'}
                      </Text>
                    </View>

                    <View style={styles.qualityOptionBody}>
                      <Text style={styles.qualityOptionTitle} numberOfLines={2}>
                        {clean}
                      </Text>

                      <View style={styles.qualityOptionMetaRow}>
                        {meta.fileSize ? (
                          <View style={styles.qualityMetaBadge}>
                            <Ionicons name="folder-outline" size={10} color="#8E8E93" />
                            <Text style={styles.qualityMetaBadgeText}>{meta.fileSize}</Text>
                          </View>
                        ) : null}

                        {meta.audio ? (
                          <View style={styles.qualityMetaBadge}>
                            <Ionicons name="volume-medium-outline" size={10} color="#8E8E93" />
                            <Text style={styles.qualityMetaBadgeText}>{meta.audio}</Text>
                          </View>
                        ) : null}

                        {meta.codec ? (
                          <View style={styles.qualityMetaBadge}>
                            <Text style={styles.qualityMetaBadgeText}>{meta.codec}</Text>
                          </View>
                        ) : null}

                        {meta.languages && meta.languages.length > 0 && (
                          <View style={[styles.qualityMetaBadge, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}>
                            <Ionicons name="volume-medium" size={10} color={theme.primary} />
                            <Text style={[styles.qualityMetaBadgeText, { color: theme.primary, fontWeight: '700' }]}>
                              {meta.languages.join(' + ')}
                            </Text>
                          </View>
                        )}

                        {isItemCompleted && (
                          <View style={styles.qualityDownloadedBadge}>
                            <Ionicons name="checkmark-circle" size={10} color="#00e676" />
                            <Text style={styles.qualityDownloadedText}>Downloaded</Text>
                          </View>
                        )}

                        {isItemDownloading && (
                          <View style={styles.qualityDownloadingBadge}>
                            <Ionicons name="arrow-down" size={10} color="#00e676" />
                            <Text style={styles.qualityDownloadingText}>
                              {downloadInfo.progress}% • {downloadInfo.speedFormatted || '0 Mbps'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.qualityPlayActionWrap}>
                      {isWatchMode ? (
                        isLoadingStream ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : isItemCompleted ? (
                          <View style={[styles.qualityPlayBtn, styles.qualityPlayBtnOffline]}>
                            <Ionicons name="play" size={12} color="#00e676" />
                            <Text style={[styles.qualityPlayBtnText, { color: '#00e676' }]}>Play</Text>
                          </View>
                        ) : (
                          <View style={[styles.qualityPlayBtn, { backgroundColor: theme.primary }]}>
                            <Ionicons name="play" size={12} color="#000000" />
                            <Text style={[styles.qualityPlayBtnText, { color: '#000000' }]}>Play</Text>
                          </View>
                        )
                      ) : (
                        isStartingDownload ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : isItemCompleted ? (
                          <View style={[styles.qualityPlayBtn, styles.qualityDownloadBtnCompleted]}>
                            <Ionicons name="checkmark-circle" size={13} color="#00e676" />
                            <Text style={[styles.qualityPlayBtnText, { color: '#00e676' }]}>Done</Text>
                          </View>
                        ) : isItemDownloading ? (
                          <View style={[styles.qualityPlayBtn, styles.qualityDownloadBtnActive]}>
                            <Ionicons name="pause" size={12} color="#ff9800" />
                            <Text style={[styles.qualityPlayBtnText, { color: '#ff9800' }]}>Pause</Text>
                          </View>
                        ) : isItemPaused ? (
                          <View style={[styles.qualityPlayBtn, styles.qualityDownloadBtnPaused]}>
                            <Ionicons name="play" size={12} color="#7b82ff" />
                            <Text style={[styles.qualityPlayBtnText, { color: '#7b82ff' }]}>Resume</Text>
                          </View>
                        ) : (
                          <View style={[styles.qualityPlayBtn, { backgroundColor: theme.primary }]}>
                            <Ionicons name="download-outline" size={13} color="#000000" />
                            <Text style={[styles.qualityPlayBtnText, { color: '#000000' }]}>Download</Text>
                          </View>
                        )
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── File Picker Modal ── */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>
                {pickerMode === 'download' ? 'Select File to Download' : 'Select File to Watch'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {pickerFiles.length} files found • Tap to {pickerMode === 'download' ? 'download' : 'play'}
              </Text>
            </View>

            <FlatList
              data={pickerFiles}
              keyExtractor={(f, index) => `file-${f.id ?? index}`}
              style={styles.fileList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: file, index }) => {
                const isLast = index === pickerFiles.length - 1;
                const ext = file.name.split('.').pop()?.toUpperCase() ?? '';
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.fileRow,
                      isLast && styles.fileRowLast,
                      pressed && styles.fileRowPressed,
                    ]}
                    onPress={() => handleFilePick(file)}
                  >
                    <View style={styles.fileIconWrap}>
                      <Ionicons name="document-outline" size={22} color={theme.primary} />
                    </View>
                    <View style={styles.fileBody}>
                      <Text style={styles.fileName} numberOfLines={2}>
                        {file.name}
                      </Text>
                      <View style={styles.fileMeta}>
                        {ext ? (
                          <View style={styles.extBadge}>
                            <Text style={styles.extBadgeText}>{ext}</Text>
                          </View>
                        ) : null}
                        <Text style={styles.fileSize}>{formatFileSize(file.length)}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.fileDownloadBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (pendingItem) {
                          setPickerVisible(false);
                          executeDownload(pendingItem, file.id, file.name, file.length);
                        }
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="arrow-down-circle-outline" size={24} color={theme.primary} />
                    </TouchableOpacity>

                    <Ionicons name="play-circle-outline" size={26} color="#ffffff" />
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>


    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  contentContainer: { paddingBottom: 30 },

  /* Backdrop Banner */
  backdropWrap: {
    width: '100%',
    height: 380,
    backgroundColor: '#000000',
    position: 'relative',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    elevation: 12,
  },
  webPageButton: {
    position: 'absolute',
    right: 68,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    elevation: 12,
  },
  bookmarkButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    elevation: 12,
  },
  bookmarkButtonActive: {
    backgroundColor: 'rgba(83, 90, 255, 0.35)',
    borderWidth: 1,
    borderColor: '#535aff',
  },

  /* Title */
  titleSection: {
    paddingHorizontal: 20,
    marginTop: -20,
    marginBottom: 16,
    alignItems: 'center',
  },
  movieTitleMain: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 2,
    lineHeight: 38,
    textTransform: 'uppercase',
  },

  /* Action Row (Trailer on Left, Watch Now in Center, Download on Right) */
  actionRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  circularActionBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  circularActionBtnActive: {
    backgroundColor: 'rgba(83, 90, 255, 0.2)',
    borderColor: '#535aff',
  },
  circularActionBtnCompleted: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderColor: '#00e676',
  },
  watchNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 28,
    height: 50,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  watchNowBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.2,
  },

  /* Overview Paragraph */
  overviewContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  overviewText: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 0.1,
  },
  moreButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  moreButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },

  /* Sections */
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
    marginBottom: 14,
  },
  variantBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  variantBadgeText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },

  /* Cast & Crew */
  castListContent: {
    gap: 16,
    paddingRight: 20,
  },
  castCard: {
    width: 86,
    alignItems: 'center',
  },
  castAvatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  castAvatar: {
    width: '100%',
    height: '100%',
  },
  castAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  castName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 16,
  },
  castCharacter: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 14,
  },

  /* Information */
  infoTable: {
    backgroundColor: 'transparent',
    gap: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    width: '38%',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    flex: 1,
    textAlign: 'right',
  },
  ratingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },

  /* Torrent list */
  torrentList: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  torrentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c2e',
    gap: 14,
  },
  torrentRowLast: { borderBottomWidth: 0 },
  torrentRowPressed: { backgroundColor: '#535aff12' },
  torrentRowLoading: { opacity: 0.6 },
  torrentIconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  torrentBody: { flex: 1, gap: 5 },
  torrentTitle: { fontSize: 14, fontWeight: '500', color: '#ffffff', letterSpacing: -0.1, lineHeight: 20 },
  torrentMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  qualityBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#535aff22',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#535aff44',
  },
  qualityBadgeText: { fontSize: 11, fontWeight: '600', color: '#7b82ff', letterSpacing: 0.3 },

  rowSpeedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rowSpeedText: { fontSize: 10, fontWeight: '700', color: '#00e676' },

  rowPeersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(83, 90, 255, 0.2)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rowPeersText: { fontSize: 10, fontWeight: '600', color: '#7b82ff' },

  rowProgressContainer: { marginTop: 6, gap: 4 },
  rowProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  rowProgressFill: { height: '100%', borderRadius: 2 },
  rowProgressStatsText: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },

  downloadBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#535aff15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtnActive: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
  },
  downloadBtnCompleted: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
  },

  searchSourcesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(83, 90, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#535aff',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  searchSourcesBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  browserSourcesBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },

  noStreamsContainer: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  noStreamsText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  noStreamsSubtext: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  noStreamsBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 34,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 20 },
    }),
  },
  modalHeader: { alignItems: 'center', paddingTop: 12, paddingBottom: 16, paddingHorizontal: 20 },
  modalHandle: { width: 36, height: 4, backgroundColor: '#3a3a3c', borderRadius: 2, marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 4 },

  /* File list */
  fileList: { paddingHorizontal: 16 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c2e',
  },
  fileRowLast: { borderBottomWidth: 0 },
  fileRowPressed: { backgroundColor: '#535aff12', borderRadius: 10 },
  fileIconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#535aff18', borderRadius: 10 },
  fileBody: { flex: 1, gap: 5 },
  fileName: { fontSize: 13, fontWeight: '500', color: '#ffffff', lineHeight: 18 },
  fileMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  extBadge: { backgroundColor: '#2c2c2e', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  extBadgeText: { fontSize: 10, fontWeight: '700', color: '#8E8E93', letterSpacing: 0.5 },
  fileSize: { fontSize: 12, color: '#636366' },

  fileDownloadBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#535aff15',
    marginRight: 4,
  },

  /* Choose Quality Modal */
  qualityModalSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 20 },
    }),
  },
  qualityModalHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c2e',
    marginBottom: 8,
  },
  qualityModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityListContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  qualityOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252528',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  qualityOptionCardLast: {
    marginBottom: 4,
  },
  qualityOptionCardCompleted: {
    borderColor: 'rgba(0, 230, 118, 0.35)',
    backgroundColor: 'rgba(0, 230, 118, 0.05)',
  },
  qualityPillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  qualityPillBadge4K: {
    backgroundColor: 'rgba(255, 179, 0, 0.15)',
    borderColor: '#ffb300',
  },
  qualityPillBadge1080p: {
    backgroundColor: 'rgba(83, 90, 255, 0.18)',
    borderColor: '#535aff',
  },
  qualityPillBadge720p: {
    backgroundColor: 'rgba(0, 195, 255, 0.15)',
    borderColor: '#00c3ff',
  },
  qualityPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  qualityPillText4K: {
    color: '#ffb300',
  },
  qualityPillText1080p: {
    color: '#7b82ff',
  },
  qualityPillText720p: {
    color: '#00c3ff',
  },
  qualityOptionBody: {
    flex: 1,
    gap: 5,
  },
  qualityOptionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 18,
  },
  qualityOptionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  qualityMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityMetaBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
  },
  qualityDownloadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityDownloadedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#00e676',
  },
  qualityPlayActionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#535aff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  qualityPlayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  qualityPlayBtnOffline: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderWidth: 1,
    borderColor: '#00e676',
  },
  qualityDownloadBtn: {
    backgroundColor: '#535aff',
  },
  qualityDownloadBtnCompleted: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderWidth: 1,
    borderColor: '#00e676',
  },
  qualityDownloadBtnActive: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  qualityDownloadBtnPaused: {
    backgroundColor: 'rgba(123, 130, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#7b82ff',
  },
  qualityDownloadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityDownloadingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#00e676',
  },

  /* Metadata Row under title */
  metaRowText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#D1D1D6',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.2,
  },

  /* Ratings Row */
  ratingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  imdbLabel: {
    paddingVertical: 0,
  },
  imdbLabelText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#F5C518',
    letterSpacing: -0.2,
  },
  tmdbLabel: {
    paddingVertical: 0,
  },
  tmdbLabelText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#01B4E4',
    letterSpacing: -0.2,
  },
  rtLabel: {
    paddingVertical: 0,
  },
  rtLabelText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FA320A',
    letterSpacing: -0.2,
  },
  badgeScoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  popcornPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  popcornText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  /* Languages Badges Row */
  languagesBadgeRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    width: '100%',
  },
  languagesPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  languagesInlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  languagesHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  languagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  languagePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },

  /* Modal Language Filter Chips */
  modalFilterScrollView: {
    flexGrow: 0,
    marginBottom: 12,
  },
  modalFilterScroll: {
    paddingHorizontal: 16,
    paddingBottom: 2,
    gap: 8,
    alignItems: 'center',
  },
  modalFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#252528',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 5,
  },
  modalFilterChipActive: {
    backgroundColor: '#535aff',
    borderColor: '#535aff',
  },
  modalFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  modalFilterChipTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  modalFilterChipCount: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFilterChipCountActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  modalFilterChipCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
  },
  emptyFilterContainer: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyFilterTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 6,
  },
  emptyFilterSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyFilterBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 16,
  },
  emptyFilterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
});

export default TorrentDetails;

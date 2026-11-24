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
  normalizeTamilMvUrl,
} from '@/hooks/useTamilMv';
import { StreamingServerClient, TorrentFile, resolveStreamingServerClient } from '@/clients/stremio';
import { StorageKeys, storageService } from '@/utils/StorageService';
import { downloadService, DownloadItem } from '@/services/DownloadService';
import { myListService } from '@/services/MyListService';
import { tmdbService, TmdbDetails, TmdbEpisode, TmdbSeason, detectLanguageCode, cleanMovieQuery } from '@/services/TmdbService';
import { DEFAULT_TRACKERS } from '@/clients/stremio';
import { addonService, StremioStream } from '@/services/AddonService';
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

function getResolutionWeight(title: string): number {
  if (/\b(4k|2160p|uhd)\b/i.test(title)) return 4000;
  if (/\b(1080p|fhd)\b/i.test(title)) return 1080;
  if (/\b(720p)\b/i.test(title)) return 720;
  if (/\b(480p|sdtv|dvdrip|sd)\b/i.test(title)) return 480;
  if (/\b(360p|240p)\b/i.test(title)) return 360;
  return 500;
}

function parseFileSizeInBytes(title: string): number {
  const match = title.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'GB') return num * 1024 * 1024 * 1024;
  if (unit === 'MB') return num * 1024 * 1024;
  return num;
}

function parseQualityMeta(title: string) {
  const is4K = /\b(4k|2160p|uhd)\b/i.test(title);
  const is1080p = /\b(1080p|fhd)\b/i.test(title);
  const is720p = /\b(720p)\b/i.test(title);
  const is480p = /\b(480p|sdtv|dvdrip|sd)\b/i.test(title);

  let resolution = '';
  if (is4K) resolution = '4K UHD';
  else if (is1080p) resolution = '1080p';
  else if (is720p) resolution = '720p';
  else if (is480p) resolution = '480p';
  else {
    const resMatch = title.match(/\b(\d{3,4}p)\b/i);
    if (resMatch) resolution = resMatch[1];
    else if (/\b(dvd9)\b/i.test(title)) resolution = 'DVD9';
    else if (/\b(dvd5)\b/i.test(title)) resolution = 'DVD5';
    else if (/\b(hdrip)\b/i.test(title)) resolution = 'HDRip';
    else if (/\b(web-?dl|webrip)\b/i.test(title)) resolution = 'WEB-DL';
    else if (/\b(x264|hevc|x265|avc)\b/i.test(title)) resolution = 'HDRip';
    else resolution = 'HD';
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
    is480p,
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

function resolveTopicWebUrl(
  topicUrl?: string,
  groupid?: string,
  paramGuid?: string,
  items?: TorrentItem[]
): string | null {
  const currentBase = normalizeTamilMvUrl(getTamilMVBaseUrl());

  const candidates: (string | undefined)[] = [
    topicUrl,
    groupid,
    paramGuid,
    items?.[0]?.groupid,
    items?.[0]?.guid,
  ];

  // 1. Direct full HTTP URL with /forums/topic/
  for (const cand of candidates) {
    if (!cand) continue;
    if (cand.startsWith('http') && cand.includes('/forums/topic/')) {
      try {
        const parsed = new URL(cand);
        const baseParsed = new URL(currentBase);
        return `${baseParsed.origin}${parsed.pathname}${parsed.search}`;
      } catch {
        return cand;
      }
    }
  }

  // 2. Relative topic path
  for (const cand of candidates) {
    if (!cand) continue;
    if (cand.startsWith('/forums/topic/') || cand.startsWith('index.php?/forums/topic/')) {
      return `${currentBase.replace(/\/$/, '')}/${cand.replace(/^\//, '')}`;
    }
  }

  // 3. Topic ID embedded in string (e.g. "201024", "201024-magnet-0", "topic/201024")
  for (const cand of candidates) {
    if (!cand) continue;
    const match = cand.match(/\b(\d{4,8})\b/);
    if (match) {
      return `${currentBase.replace(/\/$/, '')}/index.php?/forums/topic/${match[1]}-view/`;
    }
  }

  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
const TorrentDetails = () => {
  const {
    title,
    poster,
    publishDate,
    year: paramYear,
    type,
    allItems: allItemsRaw,
    topicUrl,
    groupid,
    magnetUrl: paramMagnetUrl,
    infoHash: paramInfoHash,
    guid: paramGuid,
    imdbId,
  } = useLocalSearchParams<{
    title: string;
    poster: string;
    publishDate?: string;
    year?: string;
    type?: string;
    allItems?: string;
    topicUrl?: string;
    groupid?: string;
    magnetUrl?: string;
    infoHash?: string;
    guid?: string;
    imdbId?: string;
  }>();

  const { height, width } = useWindowDimensions();
  const isPortrait = height > width;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);
  const { theme } = useTheme();

  // ── TMDB State ──
  const [tmdbData, setTmdbData] = useState<TmdbDetails | null>(null);
  const [isTmdbLoading, setIsTmdbLoading] = useState(true);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

  // Series Season & Episode State
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState<TmdbEpisode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [seasonModalVisible, setSeasonModalVisible] = useState(false);
  const [loadingEpisodeNumber, setLoadingEpisodeNumber] = useState<number | null>(null);

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
  const [isLaunchingPlayer, setIsLaunchingPlayer] = useState(false);
  const [launchingQuality, setLaunchingQuality] = useState<string>('');

  // Fetch TMDB data for Cast, Crew, Trailer, Recommendations, Information
  useEffect(() => {
    let isMounted = true;
    setIsTmdbLoading(true);

    const targetYear =
      paramYear ||
      cleanMovieQuery(title).year ||
      cleanTopicTitle(title).year ||
      (publishDate ? new Date(publishDate).getFullYear().toString() : undefined);

    tmdbService.getMovieFullInfo(title, targetYear, type)
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
  }, [title, type, publishDate, paramYear]);

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
      const parsed = allItemsRaw ? JSON.parse(allItemsRaw) : [];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // ignore
    }
    if (paramMagnetUrl) {
      return [{
        guid: paramGuid || topicUrl || groupid || title,
        groupid: groupid || topicUrl || '',
        name: title,
        title: title,
        year: paramYear,
        language: 'tamil',
        poster,
        magnetUrl: paramMagnetUrl,
        infoHash: paramInfoHash || '',
        publishDate: publishDate || new Date().toISOString(),
      }];
    }
    return [];
  });
  const [isLoadingVariants, setIsLoadingVariants] = useState(false);

  // Always load full resolutions from the topic webpage, merging with any initial preloaded variants
  useEffect(() => {
    let isMounted = true;

    const rawParsed: TorrentItem[] = (() => {
      try {
        const parsed = allItemsRaw ? JSON.parse(allItemsRaw) : [];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
      if (paramMagnetUrl) {
        return [{
          guid: paramGuid || topicUrl || groupid || title,
          groupid: groupid || topicUrl || '',
          name: title,
          title: title,
          year: paramYear,
          language: 'tamil',
          poster,
          magnetUrl: paramMagnetUrl,
          infoHash: paramInfoHash || '',
          publishDate: publishDate || new Date().toISOString(),
        }];
      }
      return [];
    })();

    // Immediately display preloaded items with zero waiting delay
    if (rawParsed.length > 0) {
      setItems(rawParsed);
    }

    const targetUrl = resolveTopicWebUrl(topicUrl, groupid, paramGuid, rawParsed);

    if (targetUrl) {
      setIsLoadingVariants(true);
      fetchTamilMVTopicMagnets(targetUrl)
        .then((res) => {
          if (isMounted && res.items.length > 0) {
            // Merge all resolutions from the webpage and deduplicate by infoHash or magnetUrl
            const map = new Map<string, TorrentItem>();
            res.items.forEach((it) => {
              const key = (it.infoHash || it.magnetUrl || it.title).toLowerCase();
              map.set(key, it);
            });
            rawParsed.forEach((it) => {
              const key = (it.infoHash || it.magnetUrl || it.title).toLowerCase();
              if (!map.has(key)) {
                map.set(key, it);
              }
            });
            setItems(Array.from(map.values()));
          }
        })
        .catch((err) => {
          console.warn('[TorrentDetails] Failed to fetch topic magnets from web view:', err);
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
              ? groups.find((g) => g.year === targetYear) || groups[0]
              : groups[0];

            const candidateGroups = [candidateGroup, ...groups.filter((g) => g !== candidateGroup)].slice(0, 3);

            for (const grp of candidateGroups) {
              const bestCandidate = grp.items.find((i) => i.groupid?.startsWith('http')) || grp.items[0];
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
          if (isMounted && rawParsed.length === 0) {
            setItems([]);
          }
        })
        .catch((err) => {
          console.warn('[TorrentDetails] Auto-search failed for title:', searchTitle, err);
          if (isMounted && rawParsed.length === 0) setItems([]);
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
  }, [allItemsRaw, topicUrl, groupid, title, publishDate, paramMagnetUrl, paramInfoHash, paramGuid, paramYear, poster]);

  // ── Query installed Stremio stream addons for matching streams ──
  useEffect(() => {
    let isMounted = true;
    const mediaId =
      imdbId ||
      (paramGuid?.startsWith('tt') ? paramGuid : null) ||
      (groupid?.startsWith('tt') ? groupid : null) ||
      tmdbData?.imdbId;

    if (!mediaId) return;

    addonService
      .fetchStreamsForMedia(type || 'movie', mediaId)
      .then((streams) => {
        if (!isMounted || !streams || streams.length === 0) return;

        const converted: TorrentItem[] = streams.map((st, idx) => {
          const streamName = st.name ? `[${st.name.replace(/\n/g, ' ')}] ` : '';
          const displayTitle = st.title
            ? `${streamName}${st.title.replace(/\n/g, ' • ')}`
            : (st.name || 'Stream');
          const trackers = [
            ...(st.sources || []).filter((s: string) => s.startsWith('tracker:')).map((s: string) => s.replace(/^tracker:/, '')),
            ...DEFAULT_TRACKERS,
          ];
          const trackerParams = trackers.map((t) => `tr=${encodeURIComponent(t)}`).join('&');
          const magnetUrl = st.infoHash
            ? `magnet:?xt=urn:btih:${st.infoHash}&dn=${encodeURIComponent(st.title || title || 'stream')}&${trackerParams}`
            : (st.url || '');

          return {
            name: title || null,
            year: paramYear || null,
            language: 'All',
            groupid: `addon-${st.addonName || 'stream'}`,
            guid: `addon-${mediaId}-${idx}-${st.infoHash || st.url || idx}`,
            poster: poster || null,
            title: displayTitle,
            magnetUrl,
            infoHash: st.infoHash || '',
            publishDate: new Date().toISOString(),
            url: st.url,
            fileIdx: st.fileIdx,
          } as TorrentItem;
        });

        setItems((prev) => {
          const existingHashes = new Set(
            prev.map((i) => (i.infoHash || (i as any).url || i.guid).toLowerCase())
          );
          const newItems = converted.filter(
            (c) => !existingHashes.has((c.infoHash || (c as any).url || c.guid).toLowerCase())
          );
          return [...prev, ...newItems];
        });
      })
      .catch((e) => {
        console.warn('[TorrentDetails] Failed to fetch addon streams:', e);
      });

    return () => {
      isMounted = false;
    };
  }, [imdbId, paramGuid, groupid, tmdbData?.imdbId, type, title, paramYear, poster]);

  const allItems = items;

  const isSeries = Boolean(
    type === 'series' ||
    tmdbData?.mediaType === 'tv' ||
    (tmdbData?.numberOfSeasons && tmdbData.numberOfSeasons > 0)
  );

  const isAddonMedia = Boolean(
    groupid?.startsWith('addon-') ||
    paramGuid?.startsWith('addon-') ||
    imdbId ||
    (!topicUrl && !groupid?.startsWith('http'))
  );

  // Fetch TV episodes when series detected and season changes
  useEffect(() => {
    if (!isSeries || !tmdbData?.id) return;
    let isMounted = true;
    setIsLoadingEpisodes(true);
    tmdbService
      .getTvSeasonEpisodes(tmdbData.id, selectedSeason)
      .then((eps) => {
        if (isMounted) {
          setSeasonEpisodes(eps);
          setIsLoadingEpisodes(false);
        }
      })
      .catch((e) => {
        console.warn('[TorrentDetails] Failed to fetch TV episodes:', e);
        if (isMounted) setIsLoadingEpisodes(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isSeries, tmdbData?.id, selectedSeason]);

  // Handle Episode selection: fetch addon streams for that specific episode
  const handleEpisodePress = async (ep: TmdbEpisode) => {
    const mediaId =
      imdbId ||
      (paramGuid?.startsWith('tt') ? paramGuid : null) ||
      (groupid?.startsWith('tt') ? groupid : null) ||
      tmdbData?.imdbId;

    if (!mediaId) {
      showAlert('Episodes', 'No IMDb ID found for this series to query episode streams.');
      return;
    }

    setLoadingEpisodeNumber(ep.episodeNumber);
    try {
      // Query addon streams for this specific episode: e.g. tt4574334:1:1
      const epId = `${mediaId}:${selectedSeason}:${ep.episodeNumber}`;
      const streams = await addonService.fetchStreamsForMedia('series', epId);

      if (!streams || streams.length === 0) {
        showAlert('No Streams', `No streams found for Season ${selectedSeason} Episode ${ep.episodeNumber}.`);
        setLoadingEpisodeNumber(null);
        return;
      }

      const converted: TorrentItem[] = streams.map((st, idx) => {
        const streamName = st.name ? `[${st.name.replace(/\n/g, ' ')}] ` : '';
        const displayTitle = st.title
          ? `${streamName}${st.title.replace(/\n/g, ' • ')}`
          : (st.name || 'Stream');
        const trackers = [
          ...(st.sources || []).filter((s: string) => s.startsWith('tracker:')).map((s: string) => s.replace(/^tracker:/, '')),
          ...DEFAULT_TRACKERS,
        ];
        const trackerParams = trackers.map((t) => `tr=${encodeURIComponent(t)}`).join('&');
        const magnetUrl = st.infoHash
          ? `magnet:?xt=urn:btih:${st.infoHash}&dn=${encodeURIComponent(st.title || `${title} S${selectedSeason}E${ep.episodeNumber}`)}&${trackerParams}`
          : (st.url || '');

        return {
          name: `${title} S${selectedSeason}E${ep.episodeNumber}`,
          year: paramYear || null,
          language: 'All',
          groupid: `addon-${st.addonName || 'stream'}`,
          guid: `addon-${mediaId}-s${selectedSeason}e${ep.episodeNumber}-${idx}`,
          poster: ep.stillUrl || (ep.stillPath ? `https://image.tmdb.org/t/p/w500${ep.stillPath}` : poster || null),
          title: displayTitle,
          magnetUrl,
          infoHash: st.infoHash || '',
          publishDate: new Date().toISOString(),
          url: st.url,
          fileIdx: st.fileIdx,
        } as TorrentItem;
      });

      // Update items with this episode's streams and open quality picker
      setItems(converted);
      setQualityModalMode('watch');
      setQualityModalVisible(true);
    } catch (err: any) {
      console.warn('[handleEpisodePress] Error:', err);
      showAlert('Error', 'Failed to fetch episode streams: ' + (err.message || String(err)));
    } finally {
      setLoadingEpisodeNumber(null);
    }
  };

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
    const resolved = resolveTopicWebUrl(topicUrl, groupid, paramGuid, allItems);
    if (resolved) return resolved;

    // Fallback: search TamilMV for this movie title
    const searchName = getMovieSearchTitle(tmdbData?.title || title);
    return `${currentBase.replace(/\/$/, '')}/index.php?/search/&q=${encodeURIComponent(searchName)}&quick=1`;
  }, [topicUrl, groupid, paramGuid, allItems, tmdbData?.title, title]);

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
    let list = allItems;
    if (selectedModalLanguage !== 'All') {
      const filtered = allItems.filter((item) => {
        const langs = getItemLanguages(item, title);
        return langs.some((l) => l.toLowerCase() === selectedModalLanguage.toLowerCase());
      });
      list = filtered.length > 0 ? filtered : allItems;
    }

    return [...list].sort((a, b) => {
      const wA = getResolutionWeight(a.title);
      const wB = getResolutionWeight(b.title);
      if (wA !== wB) return wB - wA; // Highest resolution first
      const sA = parseFileSizeInBytes(a.title);
      const sB = parseFileSizeInBytes(b.title);
      return sB - sA; // Highest file size first
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

    if (allItems.length > 0 || isLoadingVariants) {
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

    if (allItems.length > 0 || isLoadingVariants) {
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
  const navigateToPlayer = (item: TorrentItem, fileIdx: number, streamUrl?: string) => {
    const streamList = allItems.length > 0 ? allItems : [item];
    const itemIndex = streamList.findIndex(
      (i) => (i.guid && i.guid === item.guid) || (i.infoHash && i.infoHash === item.infoHash)
    );
    const selectedIdx = itemIndex >= 0 ? itemIndex : 0;
    const safeIdx = typeof fileIdx === 'number' && fileIdx >= 0 ? fileIdx : 0;

    const streams = JSON.stringify(
      streamList.map((it) => ({
        name: it.title,
        title: it.title,
        infoHash: it.infoHash,
        magnet: it.magnetUrl,
        magnetLink: it.magnetUrl,
        url: (it as any).url || (it.magnetUrl?.startsWith('http') ? it.magnetUrl : (it.guid === item.guid || it.infoHash === item.infoHash ? streamUrl : undefined)),
        fileIdx: (it as any).fileIdx !== undefined && (it as any).fileIdx >= 0
          ? (it as any).fileIdx
          : ((it.guid === item.guid || it.infoHash === item.infoHash) ? safeIdx : safeIdx),
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

    const clean = cleanTitle(item.title);
    const meta = parseQualityMeta(clean);
    const qualityLabel = meta.resolution || extractQualityTag(clean) || 'HD';

    const itemKey = item.guid || item.infoHash;
    setLoadingItem(itemKey);
    setLaunchingQuality(qualityLabel);
    setIsLaunchingPlayer(true);

    try {
      // Validate that the item has a streamable link or hash
      if (!item.infoHash && !item.magnetUrl && !((item as any).url)) {
        if (isLoadingVariants) {
          showAlert('Loading Streams', 'Fetching torrent resolutions from TamilMV. Please wait a moment...');
          return;
        }
        showAlert('No Stream Found', 'Please select a quality with an active magnet link.');
        return;
      }

      // Warm up embedded streaming server
      ensureEmbeddedServerRunning().catch(() => {});

      // If direct URL without infoHash, play immediately
      if (!item.infoHash && ((item as any).url || item.magnetUrl?.startsWith('http'))) {
        setQualityModalVisible(false);
        navigateToPlayer(item, -1, (item as any).url || item.magnetUrl);
        return;
      }

      // If item already specifies file index from addon
      if ((item as any).fileIdx !== undefined && (item as any).fileIdx >= 0) {
        setQualityModalVisible(false);
        navigateToPlayer(item, (item as any).fileIdx);
        return;
      }

      if (!isSeries) {
        // For movies on TamilMV, torrents contain 1 main video file (fileIdx = 0).
        // Navigate to player immediately without blocking on network getTorrentFiles!
        setQualityModalVisible(false);
        navigateToPlayer(item, 0);
        return;
      }

      // For TV series, check if multiple episodes exist
      const client = await resolveStreamingServerClient();
      const files = await Promise.race([
        client.getTorrentFiles(item.infoHash, 2500, item.magnetUrl),
        new Promise<TorrentFile[]>((r) => setTimeout(() => r([]), 2500)),
      ]).catch(() => []);

      if (files && files.length > 1) {
        const videoFiles = files.filter((f) => {
          const ext = f.name.split('.').pop()?.toLowerCase();
          return ['mkv', 'mp4', 'avi', 'mov', 'ts', 'webm', 'm4v'].includes(ext || '');
        });

        if (videoFiles.length > 1) {
          // Multiple episode files -> show episode picker
          setQualityModalVisible(false);
          setIsLaunchingPlayer(false);
          setPendingItem(item);
          setPickerFiles(videoFiles);
          setPickerMode('stream');
          setPickerVisible(true);
          return;
        }

        const chosenFile = videoFiles.length === 1 ? videoFiles[0] : [...files].sort((a, b) => b.length - a.length)[0];
        const safeIdx = typeof chosenFile?.id === 'number' && chosenFile.id >= 0 ? chosenFile.id : 0;
        setQualityModalVisible(false);
        navigateToPlayer(item, safeIdx);
      } else {
        setQualityModalVisible(false);
        navigateToPlayer(item, 0);
      }
    } catch (e) {
      console.warn('[TorrentDetails] Error starting stream:', e);
      setQualityModalVisible(false);
      navigateToPlayer(item, 0);
    } finally {
      setLoadingItem(null);
      setTimeout(() => setIsLaunchingPlayer(false), 400);
    }
  };

  // ── Download handlers ──
  const executeDownload = async (item: TorrentItem, fileIdx: number, fileName?: string, fileLength?: number) => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      let streamUrl = '';
      const validFileIdx = fileIdx >= 0 ? fileIdx : (((item as any).fileIdx !== undefined && (item as any).fileIdx >= 0) ? (item as any).fileIdx : 0);
      if (!item.infoHash && ((item as any).url || item.magnetUrl?.startsWith('http'))) {
        streamUrl = (item as any).url || item.magnetUrl;
      } else {
        const client = await resolveStreamingServerClient();
        streamUrl = await client.getStreamingURL(item.infoHash, validFileIdx, item.magnetUrl);
      }
      const clean = cleanTitle(item.title);
      const finalFileName = fileName || `${clean}.mkv`;

      await downloadService.startDownload({
        infoHash: item.infoHash || item.guid,
        fileIdx: validFileIdx,
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

    const clean = cleanTitle(item.title);
    const itemKey = item.guid || item.infoHash;
    setDownloadingGuid(itemKey);
    try {
      const client = await resolveStreamingServerClient();
      const files = await Promise.race([
        client.getTorrentFiles(item.infoHash, 2500, item.magnetUrl),
        new Promise<TorrentFile[]>((r) => setTimeout(() => r([]), 2500)),
      ]).catch(() => []);

      if (files && files.length > 1) {
        const videoFiles = files.filter((f) => ['mkv', 'mp4', 'avi', 'mov', 'ts', 'webm', 'm4v'].includes(f.name.split('.').pop()?.toLowerCase() || ''));
        if (videoFiles.length === 1) {
          setQualityModalVisible(false);
          await executeDownload(item, videoFiles[0].id, videoFiles[0].name, videoFiles[0].length);
          return;
        }
        setQualityModalVisible(false);
        setPendingItem(item);
        setPickerFiles(videoFiles.length > 0 ? videoFiles : files);
        setPickerMode('download');
        setPickerVisible(true);
      } else {
        const fileIdx = files && files.length === 1 ? files[0].id : -1;
        const fileName = files && files.length === 1 ? files[0].name : `${clean}.mkv`;
        const fileLength = files && files.length === 1 ? files[0].length : undefined;
        setQualityModalVisible(false);
        await executeDownload(item, fileIdx, fileName, fileLength);
      }
    } catch {
      setQualityModalVisible(false);
      await executeDownload(item, -1, `${clean}.mkv`);
    } finally {
      setDownloadingGuid(null);
    }
  };

  const handleFilePick = async (file: TorrentFile) => {
    setPickerVisible(false);
    if (!pendingItem) return;
    const safeIdx = typeof file.id === 'number' && file.id >= 0 ? file.id : 0;
    if (pickerMode === 'download') {
      executeDownload(pendingItem, safeIdx, file.name, file.length);
    } else {
      try {
        const client = await resolveStreamingServerClient();
        const streamUrl = await client.getStreamingURL(pendingItem.infoHash, safeIdx);
        navigateToPlayer(pendingItem, safeIdx, streamUrl);
      } catch {
        navigateToPlayer(pendingItem, safeIdx);
      }
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

          {/* Circular Web Page Button (top right, near My List - hidden for addon media) */}
          {!isAddonMedia && topicUrl ? (
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
          ) : null}

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
          >
            <Ionicons name="play" size={20} color="#000000" style={{ marginRight: 8 }} />
            <Text style={styles.watchNowBtnText}>Play</Text>
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

        {/* ── Section: Episodes (Season-wise thumbnails for series) ── */}
        {isSeries && (
          <View style={styles.episodesSection}>
            <View style={styles.episodesHeaderRow}>
              <Text style={styles.episodesCountTitle}>
                Episodes: {seasonEpisodes.length}/{tmdbData?.seasons?.find((s) => s.seasonNumber === selectedSeason)?.episodeCount || seasonEpisodes.length}
              </Text>
              {tmdbData?.seasons && tmdbData.seasons.length > 0 && (
                <TouchableOpacity
                  style={styles.seasonPickerPill}
                  onPress={() => setSeasonModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.seasonPickerPillText}>Season {selectedSeason}</Text>
                  <Ionicons name="chevron-down" size={14} color="#ffffff" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
            </View>

            {isLoadingEpisodes ? (
              <View style={styles.episodesLoadingWrap}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={styles.episodesLoadingText}>Loading episodes...</Text>
              </View>
            ) : seasonEpisodes.length > 0 ? (
              <FlatList
                data={seasonEpisodes}
                keyExtractor={(item) => `ep-${item.seasonNumber}-${item.episodeNumber}-${item.id}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.episodesListContent}
                renderItem={({ item: ep }) => {
                  const isCurrentLoading = loadingEpisodeNumber === ep.episodeNumber;
                  return (
                    <TouchableOpacity
                      style={styles.episodeCard}
                      onPress={() => handleEpisodePress(ep)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.episodeThumbnailWrap}>
                        <Image
                          source={{ uri: ep.stillUrl || (ep.stillPath ? `https://image.tmdb.org/t/p/w500${ep.stillPath}` : undefined) || backdropUri || poster }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                        <View style={styles.episodePlayOverlay}>
                          {isCurrentLoading ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Ionicons name="play" size={20} color="#ffffff" style={{ marginLeft: 2 }} />
                          )}
                        </View>
                      </View>
                      <Text style={styles.episodeCardTitle} numberOfLines={1}>
                        {ep.episodeNumber}. {ep.name}
                      </Text>
                      {ep.airDate ? (
                        <Text style={styles.episodeCardAirDate}>{ep.airDate}</Text>
                      ) : null}
                      {ep.overview ? (
                        <Text style={styles.episodeCardOverview} numberOfLines={2}>
                          {ep.overview}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <Text style={styles.noEpisodesText}>No episodes available for Season {selectedSeason}.</Text>
            )}
          </View>
        )}

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

      {/* ── Season Selector Modal ── */}
      <Modal
        visible={seasonModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSeasonModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSeasonModalVisible(false)}>
          <Pressable style={styles.seasonModalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.seasonModalHeader}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Select Season</Text>
            </View>
            <ScrollView style={styles.seasonScroll} showsVerticalScrollIndicator={false}>
              {(tmdbData?.seasons || []).map((s) => {
                const isSelected = selectedSeason === s.seasonNumber;
                return (
                  <TouchableOpacity
                    key={`season-${s.seasonNumber}`}
                    style={[styles.seasonOptionRow, isSelected && styles.seasonOptionRowSelected]}
                    onPress={() => {
                      setSelectedSeason(s.seasonNumber);
                      setSeasonModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.seasonOptionText, isSelected && { color: theme.primary, fontWeight: '700' }]}>
                        {s.name}
                      </Text>
                      <Text style={styles.seasonOptionSub}>{s.episodeCount} Episodes</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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
                    {isLoadingVariants && allItems.length === 0
                      ? 'Fetching streaming qualities...'
                      : `${filteredModalItems.length} ${filteredModalItems.length === 1 ? 'quality' : 'qualities'} available${isLoadingVariants ? ' (loading more...)' : ''} • ${
                          qualityModalMode === 'watch' ? 'Tap to start playback' : 'Tap to start download'
                        }`}
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
              <View style={styles.modalFilterContainer}>
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
              </View>
            )}

            {isLoadingVariants && allItems.length === 0 ? (
              <View style={styles.emptyFilterContainer}>
                <ActivityIndicator size="large" color={theme.primary} style={{ marginBottom: 16 }} />
                <Text style={styles.emptyFilterTitle}>Fetching Available Qualities...</Text>
                <Text style={styles.emptyFilterSubtitle}>
                  Loading all resolutions and audio streams from TamilMV.
                </Text>
              </View>
            ) : filteredModalItems.length === 0 ? (
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
                const itemKey = item.guid || item.infoHash;
                const isLoadingStream = loadingItem === itemKey;
                const isStartingDownload = downloadingGuid === itemKey;
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
                        if (isItemCompleted && downloadInfo?.fileUri) {
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

      {/* ── Stream Launching Spinner Overlay ── */}
      {isLaunchingPlayer && (
        <Modal transparent animationType="fade" visible={isLaunchingPlayer}>
          <View style={styles.launchingPlayerOverlay}>
            <View style={styles.launchingPlayerCard}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.launchingPlayerTitle}>
                {launchingQuality ? `Starting ${launchingQuality}...` : 'Starting Stream...'}
              </Text>
              <Text style={styles.launchingPlayerSubtitle}>
                Launching video player...
              </Text>
            </View>
          </View>
        </Modal>
      )}

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

  /* Episodes Section (Series Season-wise thumbnails) */
  episodesSection: {
    marginBottom: 26,
    paddingLeft: 20,
  },
  episodesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
    marginBottom: 14,
  },
  episodesCountTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  seasonPickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  seasonPickerPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  episodesLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  episodesLoadingText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  episodesListContent: {
    gap: 14,
    paddingRight: 20,
  },
  episodeCard: {
    width: 250,
  },
  episodeThumbnailWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: '#252528',
    overflow: 'hidden',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodePlayOverlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  episodeCardAirDate: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
    marginBottom: 4,
  },
  episodeCardOverview: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 16,
  },
  noEpisodesText: {
    fontSize: 13,
    color: '#8E8E93',
    paddingVertical: 10,
  },

  /* Season Modal */
  seasonModalSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '60%',
  },
  seasonModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  seasonScroll: {
    maxHeight: 320,
  },
  seasonOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  seasonOptionRowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  seasonOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  seasonOptionSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },

  /* Modal Language Filter Chips */
  modalFilterContainer: {
    flexShrink: 0,
    paddingVertical: 4,
    marginBottom: 8,
  },
  modalFilterScrollView: {
    flexGrow: 0,
    flexShrink: 0,
    height: 38,
  },
  modalFilterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 2,
    gap: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  modalFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#252528',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 6,
  },
  modalFilterChipActive: {
    backgroundColor: '#535aff',
    borderColor: '#535aff',
  },
  modalFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  modalFilterChipTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  modalFilterChipCount: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFilterChipCountActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  modalFilterChipCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    lineHeight: 12,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  modalFilterChipCountTextActive: {
    color: '#000000',
    fontWeight: '800',
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
  launchingPlayerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  launchingPlayerCard: {
    backgroundColor: '#18181c',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
    maxWidth: 320,
    width: '100%',
  },
  launchingPlayerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  launchingPlayerSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});

export default TorrentDetails;

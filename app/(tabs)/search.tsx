import { Text, ActivityIndicator, TextInput, View, StatusBar } from '@/components/Themed';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { SafeAreaView } from 'react-native-safe-area-context';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { useTheme } from '@/contexts/ThemeContext';
import {
  fetchTamilMVRecentlyAdded,
  searchTamilMV,
  GroupedItem,
  TorrentItem,
} from '@/hooks/useTamilMv';
import { tmdbService } from '@/services/TmdbService';
import { addonService, AddonCatalogOption } from '@/services/AddonService';
import { storageService } from '@/utils/StorageService';
import { useLocalSearchParams, router } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { DefaultPosterImgXml } from '@/utils/Svg';

// ─── Utility: Clean Movie Title ───────────────────────────────────────────────

export type MovieCategoryKey =
  | 'all'
  | 'kollywood'
  | 'hollywood'
  | 'series'
  | 'tollywood'
  | 'bollywood'
  | 'mollywood';

export const CATEGORY_CONFIG: {
  key: MovieCategoryKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'kollywood', label: 'Kollywood', icon: 'film-outline' },
  { key: 'hollywood', label: 'Hollywood', icon: 'videocam-outline' },
  { key: 'series', label: 'Web Series', icon: 'tv-outline' },
  { key: 'tollywood', label: 'Tollywood', icon: 'film-outline' },
  { key: 'bollywood', label: 'Bollywood', icon: 'film-outline' },
  { key: 'mollywood', label: 'Mollywood', icon: 'film-outline' },
];

// ─── OTT Platforms Configuration ─────────────────────────────────────────────

const NETFLIX_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#000000"/>
  <path fill="#B1060F" d="M17 11h6.5v32H17z"/>
  <path fill="#E50914" d="M30.5 11h6.5v32h-6.5z"/>
  <path fill="#E50914" d="M17 11h6.5l13.5 32H30.5z"/>
</svg>`;

const YOUTUBE_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#1F1F1F"/>
  <rect x="10" y="16" width="34" height="22" rx="7" fill="#FF0000"/>
  <polygon points="23,21 33,27 23,33" fill="#FFFFFF"/>
</svg>`;

const PRIME_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#00A8E1"/>
  <text x="27" y="23" font-family="-apple-system, Roboto, sans-serif" font-size="11.5" font-weight="900" fill="#ffffff" text-anchor="middle">prime</text>
  <text x="27" y="33" font-family="-apple-system, Roboto, sans-serif" font-size="8.5" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">video</text>
  <path d="M15 38c7 3.5 17 3.5 24 0" stroke="#FF9900" stroke-width="2.5" stroke-linecap="round" fill="none"/>
</svg>`;

const DISNEY_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <defs>
    <linearGradient id="disneyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E1B40"/>
      <stop offset="100%" stop-color="#040714"/>
    </linearGradient>
  </defs>
  <rect width="54" height="54" rx="15" fill="url(#disneyGrad)"/>
  <path d="M10 26c9-13 24-13 34 0" stroke="#00A8FF" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <text x="23" y="30" font-family="Georgia, serif" font-size="14" font-style="italic" font-weight="bold" fill="#ffffff" text-anchor="middle">Disn<tspan font-style="normal">ey</tspan></text>
  <text x="39" y="28" font-family="-apple-system, sans-serif" font-size="15" font-weight="900" fill="#00B5FF" text-anchor="middle">+</text>
</svg>`;

const ZEE5_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#1B0733"/>
  <circle cx="27" cy="27" r="17" fill="none" stroke="#A855F7" stroke-width="2.5"/>
  <circle cx="27" cy="27" r="17" fill="none" stroke="#EC4899" stroke-width="2.5" stroke-dasharray="28 85"/>
  <text x="27" y="31.5" font-family="-apple-system, Roboto, sans-serif" font-size="12" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">ZEE5</text>
</svg>`;

const SONYLIV_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#141416"/>
  <circle cx="18" cy="18" r="3.5" fill="#00A3FF"/>
  <circle cx="27" cy="18" r="3.5" fill="#FF007A"/>
  <circle cx="36" cy="18" r="3.5" fill="#FFA800"/>
  <text x="27" y="36" font-family="-apple-system, Roboto, sans-serif" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">LIV</text>
</svg>`;

const AHA_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#FF3E1D"/>
  <text x="27" y="34" font-family="-apple-system, Roboto, sans-serif" font-size="17" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-0.5">aha</text>
</svg>`;

const JIOCINEMA_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#0E0E12"/>
  <rect x="9" y="13" width="36" height="28" rx="10" fill="#E11D48"/>
  <text x="27" y="32" font-family="-apple-system, Roboto, sans-serif" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">Jio</text>
</svg>`;

const SUNNXT_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#111111"/>
  <circle cx="27" cy="19" r="7" fill="#FBBF24"/>
  <text x="27" y="36" font-family="-apple-system, Roboto, sans-serif" font-size="8.5" font-weight="900" fill="#FBBF24" text-anchor="middle" letter-spacing="0.5">SUN NXT</text>
</svg>`;

const APPLETV_SVG = `<svg viewBox="0 0 54 54" width="100%" height="100%">
  <rect width="54" height="54" rx="15" fill="#000000"/>
  <path fill="#ffffff" d="M21 27.5c-.8.9-2 1.5-3 1.5-1.1 0-2.1-.6-2.9-1.5-1.6-1.8-2.6-5.1-1.2-7.5.7-1.2 2-2 3.4-2 1 0 1.9.7 2.6.7.7 0 1.8-.7 3-.7 1.2 0 2.3.6 3 1.6-2.7 1.6-2.2 5.2.1 6.2-.6 1.4-1.3 2.7-2.4 3.7-.7.6-1.4 1.2-2.3 1.2-.9 0-1.5-.6-2.3-1.2zM20.2 16.5c.5-.6.8-1.4.7-2.3-.8.1-1.7.5-2.2 1.2-.5.5-.8 1.4-.7 2.2.9 0 1.7-.5 2.2-1.1z"/>
  <text x="33" y="27" font-family="-apple-system, sans-serif" font-size="12" font-weight="800" fill="#ffffff" text-anchor="middle">tv+</text>
</svg>`;

export interface OttPlatform {
  id: string;
  name: string;
  short: string;
  searchQuery: string;
  brandColor: string;
  tag: string;
  svgXml?: string;
  glyphType?: 'icon' | 'text';
  iconName?: keyof typeof Ionicons.glyphMap;
  glyphText?: string;
  regex: RegExp;
}

export const OTT_PLATFORMS: OttPlatform[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    short: 'Netflix',
    searchQuery: 'netflix',
    brandColor: '#E50914',
    tag: 'NF',
    svgXml: NETFLIX_SVG,
    regex: /\b(netflix|nflx)\b|\[\s*nf\s*[-–\]]|\[\s*netflix\s*[-–\]]|\bnf\s*[-_:]/i,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    short: 'YouTube',
    searchQuery: 'youtube',
    brandColor: '#FF0000',
    tag: 'YOUTUBE',
    svgXml: YOUTUBE_SVG,
    regex: /\b(youtube|yt)\b|\[\s*yt\s*[-–\]]|\[\s*youtube\s*[-–\]]/i,
  },
  {
    id: 'prime',
    name: 'Prime Video',
    short: 'Prime',
    searchQuery: 'prime',
    brandColor: '#00A8E1',
    tag: 'PRIME',
    svgXml: PRIME_SVG,
    regex: /\b(prime\s*video|amazon\s*prime|amzn|prime)\b|\[\s*amzn\s*|\[\s*prime\s*/i,
  },
  {
    id: 'hotstar',
    name: 'Disney+ Hotstar',
    short: 'Disney+',
    searchQuery: 'hotstar',
    brandColor: '#1455FF',
    tag: 'HOTSTAR',
    svgXml: DISNEY_SVG,
    regex: /\b(hotstar|jiohotstar|disney\+?|dsnp)\b|\[\s*hotstar\s*|\[\s*dsnp\s*/i,
  },
  {
    id: 'zee5',
    name: 'Zee5',
    short: 'Zee5',
    searchQuery: 'zee5',
    brandColor: '#A855F7',
    tag: 'ZEE5',
    svgXml: ZEE5_SVG,
    regex: /\b(zee5|zee\s*5)\b|\[\s*zee5\s*/i,
  },
  {
    id: 'sonyliv',
    name: 'SonyLIV',
    short: 'SonyLIV',
    searchQuery: 'sonyliv',
    brandColor: '#FF6900',
    tag: 'SONY LIV',
    svgXml: SONYLIV_SVG,
    regex: /\b(sonyliv|sony\s*liv)\b|\[\s*sonyliv\s*|\[\s*sony\s*/i,
  },
  {
    id: 'aha',
    name: 'Aha Video',
    short: 'Aha',
    searchQuery: 'aha',
    brandColor: '#FF3E1D',
    tag: 'AHA',
    svgXml: AHA_SVG,
    regex: /\b(aha|ahavideo)\b|\[\s*aha\s*/i,
  },
  {
    id: 'jiocinema',
    name: 'JioCinema',
    short: 'JioCinema',
    searchQuery: 'jiocinema',
    brandColor: '#E11D48',
    tag: 'JIOCINEMA',
    svgXml: JIOCINEMA_SVG,
    regex: /\b(jiocinema|jio\s*cinema)\b|\[\s*jiocinema\s*|\[\s*jio\s*/i,
  },
  {
    id: 'sunnxt',
    name: 'Sun NXT',
    short: 'Sun NXT',
    searchQuery: 'sunnxt',
    brandColor: '#EF4444',
    tag: 'SUN NXT',
    svgXml: SUNNXT_SVG,
    regex: /\b(sunnxt|sun\s*nxt)\b|\[\s*sunnxt\s*/i,
  },
  {
    id: 'appletv',
    name: 'Apple TV+',
    short: 'Apple TV',
    searchQuery: 'apple tv',
    brandColor: '#A1A1AA',
    tag: 'APPLE TV',
    svgXml: APPLETV_SVG,
    regex: /\b(apple\s*tv\+?|atvp)\b|\[\s*atvp\s*/i,
  },
];

const ottCache = new WeakMap<GroupedItem, OttPlatform | null>();

export function getGroupOtt(group: GroupedItem): OttPlatform | null {
  if (ottCache.has(group)) {
    return ottCache.get(group)!;
  }
  for (const item of group.items) {
    const raw = `${item.title || ''} ${group.name || ''} ${item.guid || ''} ${item.groupid || ''}`;
    for (const ott of OTT_PLATFORMS) {
      if (ott.regex.test(raw)) {
        ottCache.set(group, ott);
        return ott;
      }
    }
  }
  ottCache.set(group, null);
  return null;
}

// Caches for maximum performance & zero re-computation
const categoryCache = new WeakMap<GroupedItem, MovieCategoryKey>();
const titleCache = new Map<string, string>();
const globalPosterCache = new Map<string, string | null>();

// Concurrency-limited poster loader (max 3 concurrent)
class PosterQueue {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private maxConcurrent = 3;

  enqueue(fn: () => Promise<void>) {
    this.queue.push(fn);
    this.processNext();
  }

  private processNext() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;
    const task = this.queue.shift();
    if (!task) return;
    this.activeCount++;
    task().finally(() => {
      this.activeCount--;
      this.processNext();
    });
  }
}

const posterQueue = new PosterQueue();

export function getGroupCategory(group: GroupedItem): MovieCategoryKey {
  const cached = categoryCache.get(group);
  if (cached) return cached;

  let result: MovieCategoryKey = 'kollywood';

  const isSeries =
    (group as any).type === 'series' ||
    group.items.some((i) => {
      const t = (i.title || '').toLowerCase();
      const url = (i.guid || i.groupid || '').toLowerCase();
      return (
        /series|season|episode|s\d{2}|e\d{2}|ep\s*\(/i.test(t) ||
        url.includes('/19-web-series') ||
        url.includes('series')
      );
    });

  if (isSeries) {
    result = 'series';
  } else {
    const best = group.items.find((i) => i.poster) ?? group.items[0];
    const lang = (best?.language || '').toLowerCase();
    const allTitles = group.items.map((i) => (i.title || '').toLowerCase()).join(' ');
    const allUrls = group.items.map((i) => (i.guid || i.groupid || '').toLowerCase()).join(' ');

    // 1. Hollywood (English, forum 17 multi-audio Hollywood, or Hollywood in title/url)
    if (
      lang === 'english' ||
      allTitles.includes('hollywood') ||
      allUrls.includes('17-hollywood') ||
      allUrls.includes('/forums/forum/46-') ||
      allUrls.includes('/forums/forum/49-') ||
      allUrls.includes('/forums/forum/50-')
    ) {
      result = 'hollywood';
    } else if (lang === 'telugu' || allTitles.includes('telugu') || allUrls.includes('telugu')) {
      result = 'tollywood';
    } else if (lang === 'hindi' || allTitles.includes('hindi') || allUrls.includes('hindi')) {
      result = 'bollywood';
    } else if (lang === 'malayalam' || allTitles.includes('malayalam') || allUrls.includes('malayalam')) {
      result = 'mollywood';
    } else {
      result = 'kollywood';
    }
  }

  categoryCache.set(group, result);
  return result;
}

const cleanMovieTitle = (title: string): string => {
  if (!title) return '';
  const cached = titleCache.get(title);
  if (cached !== undefined) return cached;

  const cleaned = title
    .replace(/^(?:https?:\/\/)?(?:www\.)?[\w\.-]+\.(?:com|org|net|cz|win|pm|re|to|yt|wf|ws|me|solar|mx|cards|pizza|fi|live)\s*[-_:]\s*/gi, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:1tamilmv|tamilmv)[\w\.-]*\s*[-_:]\s*/gi, '')
    .replace(/^\[?\b(?:1tamilmv|tamilmv)\b\]?\s*[-_:]?\s*/gi, '')
    .replace(/\b(?:1tamilmv|tamilmv)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  titleCache.set(title, cleaned);
  return cleaned;
};

// ─── Search Movie Card Component ─────────────────────────────────────────────

const SearchMovieCard = React.memo(({
  group,
  cardWidth,
  posterHeight,
  onPress,
}: {
  group: GroupedItem;
  cardWidth: number;
  posterHeight: number;
  onPress: (group: GroupedItem) => void;
}) => {
  const [imgError, setImgError] = useState(false);
  const best: TorrentItem = group.items.find((i) => i.poster) ?? group.items[0];
  const type = (group as any).type || 'movie';
  const releasesCount = group.items.length;
  const ottInfo = useMemo(() => getGroupOtt(group), [group]);

  const titleKey = useMemo(() => {
    return `${(group.name || best?.title || '').toLowerCase().trim()}_${group.year || ''}_${type}`;
  }, [group.name, group.year, best?.title, type]);

  const [posterUri, setPosterUri] = useState<string | null>(() => {
    if (best?.poster) return best.poster;
    return globalPosterCache.get(titleKey) || null;
  });

  const cleanedTitle = useMemo(() => {
    return cleanMovieTitle(group.name ?? best?.title ?? '');
  }, [group.name, best?.title]);

  useEffect(() => {
    if (best?.poster) {
      setPosterUri(best.poster);
      globalPosterCache.set(titleKey, best.poster);
      return;
    }

    if (globalPosterCache.has(titleKey)) {
      const cached = globalPosterCache.get(titleKey);
      if (cached) setPosterUri(cached);
      return;
    }

    let isMounted = true;
    posterQueue.enqueue(async () => {
      if (!isMounted) return;
      try {
        const poster = await tmdbService.getMoviePoster(
          group.name || best?.title || '',
          group.year || undefined,
          type
        );
        if (poster) {
          globalPosterCache.set(titleKey, poster);
          if (isMounted) {
            setPosterUri(poster);
          }
        } else {
          globalPosterCache.set(titleKey, null);
        }
      } catch {}
    });

    return () => {
      isMounted = false;
    };
  }, [best?.poster, group.name, group.year, type, titleKey]);

  const handlePress = useCallback(() => {
    onPress(group);
  }, [onPress, group]);

  return (
    <Pressable
      style={[styles.cardContainer, { width: cardWidth }]}
      onPress={handlePress}
    >
      <View style={[styles.posterWrap, { width: cardWidth, height: posterHeight }]}>
        {posterUri && !imgError ? (
          <Image
            source={{ uri: posterUri }}
            onError={() => setImgError(true)}
            style={styles.posterImage}
            resizeMode="cover"
            fadeDuration={150}
          />
        ) : (
          <View style={[styles.posterImage, styles.posterFallback]}>
            <SvgXml xml={DefaultPosterImgXml} width={cardWidth * 0.5} height={posterHeight * 0.4} />
          </View>
        )}
        {ottInfo && (
          <View style={[styles.cardOttBadge, { backgroundColor: ottInfo.brandColor }]}>
            <Text style={styles.cardOttBadgeText}>{ottInfo.short}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.cardTitle, { width: cardWidth }]} numberOfLines={2}>
        {cleanedTitle}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={styles.cardSub}>
          {type === 'series' ? 'Series' : 'Movie'}{group.year ? ` • ${group.year}` : ''} • {releasesCount} {releasesCount === 1 ? 'source' : 'sources'}
        </Text>
      </View>
    </Pressable>
  );
});

// ─── Search Screen ────────────────────────────────────────────────────────────

const SearchScreen = () => {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ query?: string; ott?: string }>();
  const initialOtt = useMemo(() => {
    return (
      OTT_PLATFORMS.find(
        (p) =>
          p.id === params.ott ||
          (params.query && p.searchQuery.toLowerCase() === params.query.trim().toLowerCase())
      ) || null
    );
  }, [params.ott, params.query]);

  const [query, setQuery]                         = useState(params.query || initialOtt?.searchQuery || '');
  const [selectedOttId, setSelectedOttId]         = useState<string | null>(initialOtt?.id || null);
  const [showRecentlyAdded, setShowRecentlyAdded] = useState(false);
  const [recentlyAddedMovies, setRecentlyAddedMovies] = useState<GroupedItem[]>(() => {
    try {
      const raw = storageService.getItem('tamilmv:recently_added');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed?.data && Array.isArray(parsed.data)) return parsed.data;
      }
    } catch {}
    return [];
  });
  const [isLoadingRecent, setIsLoadingRecent]     = useState(false);
  const [selectedCategory, setSelectedCategory]   = useState<MovieCategoryKey>('all');

  const [liveSearchResults, setLiveSearchResults] = useState<GroupedItem[]>([]);
  const [isSearchingLive, setIsSearchingLive]     = useState(false);

  // ── Addon State ──
  const [showAddons, setShowAddons]                 = useState(false);
  const [addonMovies, setAddonMovies]               = useState<GroupedItem[]>([]);
  const [isLoadingAddons, setIsLoadingAddons]       = useState(false);
  const [availableCatalogs, setAvailableCatalogs]   = useState<AddonCatalogOption[]>([]);
  const [selectedCatalogIdx, setSelectedCatalogIdx] = useState(0);
  const [addonPage, setAddonPage]                   = useState(1);

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { width } = useWindowDimensions();
  const numColumns = width < 580 ? 3 : width < 1024 ? 5 : 7;
  const cardSpacing = 12;
  const totalHorizontalPadding = 32;
  const cardWidth = (width - totalHorizontalPadding - (numColumns - 1) * cardSpacing) / numColumns;
  const posterHeight = cardWidth * 1.5;

  const selectedOtt = useMemo(
    () => OTT_PLATFORMS.find((p) => p.id === selectedOttId) || null,
    [selectedOttId]
  );

  const handleOttPress = useCallback(
    async (ott: OttPlatform) => {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (selectedOttId === ott.id) {
        setSelectedOttId(null);
        setSelectedCategory('all');
      } else {
        setSelectedOttId(ott.id);
        setSelectedCategory('all');

        // If no search query typed, load and filter Recently Added
        if (!query.trim()) {
          setShowRecentlyAdded(true);
          if (recentlyAddedMovies.length === 0) {
            setIsLoadingRecent(true);
            try {
              const items = await fetchTamilMVRecentlyAdded(false);
              setRecentlyAddedMovies(items || []);
            } catch (e) {
              console.warn('[Search] Failed to fetch recently added for OTT:', e);
            } finally {
              setIsLoadingRecent(false);
            }
          }
        }
      }
    },
    [selectedOttId, query, recentlyAddedMovies.length]
  );

  const handleRecentlyAddedPress = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowRecentlyAdded(true);
    setShowAddons(false);
    setSelectedOttId(null);
    setQuery('');
    setSelectedCategory('all');
    if (recentlyAddedMovies.length === 0) {
      setIsLoadingRecent(true);
      try {
        const items = await fetchTamilMVRecentlyAdded(false);
        setRecentlyAddedMovies(items || []);
      } catch (e) {
        console.warn('[Search] Failed to fetch recently added:', e);
      } finally {
        setIsLoadingRecent(false);
      }
    }
  }, [recentlyAddedMovies.length]);

  const handleClearRecentlyAdded = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowRecentlyAdded(false);
    setShowAddons(false);
    setSelectedCategory('all');
  }, []);

  const handleRefreshRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const items = await fetchTamilMVRecentlyAdded(true);
      setRecentlyAddedMovies(items || []);
    } catch (e) {
      console.warn('[Search] Failed to refresh recently added:', e);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  const handleCategorySelect = useCallback(async (key: MovieCategoryKey) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedCategory(key);
  }, []);

  // If a query parameter was passed on mount, handle it
  useEffect(() => {
    if (params.query && params.query !== query) {
      setQuery(params.query);
      const match = OTT_PLATFORMS.find(
        (p) => p.searchQuery.toLowerCase() === params.query!.trim().toLowerCase()
      );
      if (match) {
        setSelectedOttId(match.id);
      }
    }
  }, [params.query]);

  const loadAddonCatalog = useCallback(async (catalogIdx = 0, page = 1) => {
    setIsLoadingAddons(true);
    try {
      let catalogs = addonService.getAvailableCatalogs();
      if (catalogs.length === 0) {
        await addonService.installAddon('https://v3-cinemeta.strem.io/manifest.json', true);
        await addonService.installAddon('https://torrentio.strem.fun/manifest.json', true);
        catalogs = addonService.getAvailableCatalogs();
      }
      setAvailableCatalogs(catalogs);
      if (catalogs.length > 0) {
        const safeIdx = Math.min(catalogIdx, catalogs.length - 1);
        const targetCat = catalogs[safeIdx];
        const enabled = addonService.getEnabledAddons();
        const addon = enabled.find((a) => a.transportUrl === targetCat.transportUrl);
        if (addon) {
          const skip = (page - 1) * 50;
          const metas = await addonService.fetchCatalogMetas(
            addon,
            targetCat.type,
            targetCat.catalogId,
            skip
          );
          const grouped = metas.map((m) => addonService.metaToGroupedItem(m, targetCat.addonName));
          setAddonMovies(grouped);
        }
      } else {
        setAddonMovies([]);
      }
    } catch (e) {
      console.warn('[Search] Failed to load addon catalog:', e);
      setAddonMovies([]);
    } finally {
      setIsLoadingAddons(false);
    }
  }, []);

  const handleAddonsPress = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowAddons(true);
    setShowRecentlyAdded(false);
    setSelectedCategory('all');
    setAddonPage(1);
    loadAddonCatalog(selectedCatalogIdx, 1);
  }, [loadAddonCatalog, selectedCatalogIdx]);

  const handleClearAddons = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowAddons(false);
  }, []);

  const handleCatalogSelect = useCallback(
    (idx: number) => {
      setSelectedCatalogIdx(idx);
      setAddonPage(1);
      loadAddonCatalog(idx, 1);
    },
    [loadAddonCatalog]
  );

  const handleAddonPageChange = useCallback(
    (newPage: number) => {
      setAddonPage(newPage);
      loadAddonCatalog(selectedCatalogIdx, newPage);
    },
    [loadAddonCatalog, selectedCatalogIdx]
  );

  // Live web search when user types query
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(async () => {
      setIsSearchingLive(true);
      try {
        const [liveItems, addonItems] = await Promise.all([
          searchTamilMV(q, 'all').catch(() => []),
          addonService.searchAllCatalogs(q).catch(() => []),
        ]);
        setLiveSearchResults([...liveItems, ...addonItems]);
      } catch {
        // Fallback
      } finally {
        setIsSearchingLive(false);
      }
    }, 600);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [query]);

  const handleClearQuery = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setQuery('');
    setSelectedOttId(null);
    setLiveSearchResults([]);
    setSelectedCategory('all');
    setShowAddons(false);
  }, []);

  const handleSearchTextChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (selectedOttId) {
        const active = OTT_PLATFORMS.find((p) => p.id === selectedOttId);
        if (active && text.trim().toLowerCase() !== active.searchQuery.toLowerCase()) {
          setSelectedOttId(null);
        }
      }
    },
    [selectedOttId]
  );

  const handleOpenWebView = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/browser' as any);
  }, []);

  const handleCardPress = useCallback(async (group: GroupedItem) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const best = group.items.find((i) => i.poster) ?? group.items[0];
    const type = (group as any).type || 'movie';

    router.push({
      pathname: '/torrent/details',
      params: {
        guid: best.guid,
        groupid: best.groupid,
        title: cleanMovieTitle(group.name ?? best.title),
        magnetUrl: best.magnetUrl,
        infoHash: best.infoHash,
        poster: best.poster ?? '',
        year: group.year || (best.publishDate ? new Date(best.publishDate).getFullYear().toString() : ''),
        type: (group as any).type || type,
        publishDate: best.publishDate,
        allItems: JSON.stringify(group.items),
        topicUrl: best.groupid?.startsWith('http') ? best.groupid : undefined,
        imdbId: (group as any).imdbId || (best.guid?.startsWith('tt') ? best.guid : undefined),
      },
    });
  }, []);

  // Filter movies by query (single deduplicated pass)
  const filteredMovies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    if (liveSearchResults.length === 0) return [];

    const activeOtt = OTT_PLATFORMS.find((p) => p.id === selectedOttId);

    const movieMap = new Map<string, GroupedItem>();
    for (const g of liveSearchResults) {
      if (activeOtt) {
        const ott = getGroupOtt(g);
        const matchesOtt =
          ott?.id === selectedOttId ||
          g.items.some((i) =>
            activeOtt.regex.test(`${i.title || ''} ${g.name || ''} ${i.guid || ''} ${i.groupid || ''}`)
          );
        if (!matchesOtt) continue;
      }

      const nameMatch = g.name?.toLowerCase().includes(q);
      const yearMatch = g.year ? g.year.toString().includes(q) : false;
      const titleMatch = g.items.some((i) => i.title.toLowerCase().includes(q));
      const langMatch = g.items.some((i) => i.language?.toLowerCase().includes(q));

      if (nameMatch || yearMatch || titleMatch || langMatch || activeOtt) {
        const key = `${(g.name || '').toLowerCase()}|||${g.year || ''}`;
        if (!movieMap.has(key)) {
          movieMap.set(key, g);
        }
      }
    }

    return Array.from(movieMap.values());
  }, [query, liveSearchResults, selectedOttId]);

  // If an OTT shortcut is selected, filter Recently Added by that OTT platform
  const ottFilteredRecentMovies = useMemo(() => {
    if (!selectedOttId) return recentlyAddedMovies;
    const activeOtt = OTT_PLATFORMS.find((p) => p.id === selectedOttId);
    if (!activeOtt) return recentlyAddedMovies;

    return recentlyAddedMovies.filter((g) => {
      const ott = getGroupOtt(g);
      if (ott?.id === selectedOttId) return true;
      return g.items.some((i) =>
        activeOtt.regex.test(`${i.title || ''} ${g.name || ''} ${i.guid || ''} ${i.groupid || ''}`)
      );
    });
  }, [recentlyAddedMovies, selectedOttId]);

  // Category statistics & grouped sections for Recently Added (single-pass O(N))
  const { recentCategoryCounts, recentGroupedByCategory } = useMemo(() => {
    const counts: Record<MovieCategoryKey, number> = {
      all: ottFilteredRecentMovies.length,
      kollywood: 0,
      hollywood: 0,
      series: 0,
      tollywood: 0,
      bollywood: 0,
      mollywood: 0,
    };
    const map = new Map<MovieCategoryKey, GroupedItem[]>();

    for (const g of ottFilteredRecentMovies) {
      const cat = getGroupCategory(g);
      counts[cat] = (counts[cat] || 0) + 1;
      let list = map.get(cat);
      if (!list) {
        list = [];
        map.set(cat, list);
      }
      list.push(g);
    }

    const sections: { key: MovieCategoryKey; label: string; items: GroupedItem[] }[] = [];
    for (const cfg of CATEGORY_CONFIG) {
      if (cfg.key === 'all') continue;
      const items = map.get(cfg.key);
      if (items && items.length > 0) {
        sections.push({
          key: cfg.key,
          label: cfg.label,
          items,
        });
      }
    }

    return { recentCategoryCounts: counts, recentGroupedByCategory: sections };
  }, [ottFilteredRecentMovies]);

  const displayedRecentMovies = useMemo(() => {
    if (selectedCategory === 'all') return ottFilteredRecentMovies;
    return ottFilteredRecentMovies.filter((g) => getGroupCategory(g) === selectedCategory);
  }, [ottFilteredRecentMovies, selectedCategory]);

  const recentCategoryFilterOptions = useMemo(() => {
    return CATEGORY_CONFIG.filter((cfg) => {
      if (cfg.key === 'all') return true;
      return (recentCategoryCounts[cfg.key] || 0) > 0;
    }).map((cfg) => ({
      ...cfg,
      count: recentCategoryCounts[cfg.key] || 0,
    }));
  }, [recentCategoryCounts]);

  // Category statistics & grouped sections for Search Results (single-pass O(N))
  const { searchCategoryCounts, searchGroupedByCategory } = useMemo(() => {
    const counts: Record<MovieCategoryKey, number> = {
      all: filteredMovies.length,
      kollywood: 0,
      hollywood: 0,
      series: 0,
      tollywood: 0,
      bollywood: 0,
      mollywood: 0,
    };
    const map = new Map<MovieCategoryKey, GroupedItem[]>();

    for (const g of filteredMovies) {
      const cat = getGroupCategory(g);
      counts[cat] = (counts[cat] || 0) + 1;
      let list = map.get(cat);
      if (!list) {
        list = [];
        map.set(cat, list);
      }
      list.push(g);
    }

    const sections: { key: MovieCategoryKey; label: string; items: GroupedItem[] }[] = [];
    for (const cfg of CATEGORY_CONFIG) {
      if (cfg.key === 'all') continue;
      const items = map.get(cfg.key);
      if (items && items.length > 0) {
        sections.push({
          key: cfg.key,
          label: cfg.label,
          items,
        });
      }
    }

    return { searchCategoryCounts: counts, searchGroupedByCategory: sections };
  }, [filteredMovies]);

  const displayedSearchMovies = useMemo(() => {
    if (selectedCategory === 'all') return filteredMovies;
    return filteredMovies.filter((g) => getGroupCategory(g) === selectedCategory);
  }, [filteredMovies, selectedCategory]);

  const searchCategoryFilterOptions = useMemo(() => {
    return CATEGORY_CONFIG.filter((cfg) => {
      if (cfg.key === 'all') return true;
      return (searchCategoryCounts[cfg.key] || 0) > 0;
    }).map((cfg) => ({
      ...cfg,
      count: searchCategoryCounts[cfg.key] || 0,
    }));
  }, [searchCategoryCounts]);

  const renderCategoryFilterChips = (
    options: { key: MovieCategoryKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[]
  ) => {
    if (options.length <= 1) return null;
    return (
      <View style={styles.filtersContainer}>
        <FlatList
          data={options}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item.key;
            return (
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  isSelected && styles.filterButtonActive,
                ]}
                onPress={() => handleCategorySelect(item.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.icon as any}
                  size={18}
                  color={isSelected ? '#000000' : '#8E8E93'}
                  style={styles.filterIcon}
                />
                <Text
                  style={[
                    styles.filterButtonText,
                    isSelected && styles.filterButtonTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar />
      <BlurGradientBackground />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Explore</Text>
        </View>
      </View>

      {/* Search Input Section */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputContainer}>
          <View style={styles.searchIconContainer}>
            <Ionicons name="search-outline" size={20} color="#6E6E73" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder={
              selectedOtt
                ? `Filter ${selectedOtt.name} or type search…`
                : "Search movie title..."
            }
            placeholderTextColor="#6E6E73"
            value={query}
            onChangeText={handleSearchTextChange}
            returnKeyType="search"
            submitBehavior="blurAndSubmit"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {isSearchingLive && (
            <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 6 }} />
          )}
          {query.length > 0 && (
            <Pressable onPress={handleClearQuery} style={styles.clearButton} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="#ff453a" />
            </Pressable>
          )}
        </View>

        {/* OTT Platform Shortcuts Bar (TV Remote Style App Buttons) */}
        <View style={styles.ottBarContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.ottBarScroll}
            keyboardShouldPersistTaps="handled"
          >
            {OTT_PLATFORMS.map((ott) => {
              const isSelected = selectedOttId === ott.id;
              return (
                <TouchableOpacity
                  key={`ott-remote-btn-${ott.id}`}
                  style={styles.ottShortcutItem}
                  onPress={() => handleOttPress(ott)}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={ott.name}
                >
                  <View
                    style={[
                      styles.ottTileButton,
                      isSelected && [
                        styles.ottTileButtonActive,
                        {
                          borderColor: ott.brandColor,
                          shadowColor: ott.brandColor,
                        },
                      ],
                    ]}
                  >
                    {ott.svgXml ? (
                      <SvgXml xml={ott.svgXml} width={50} height={50} />
                    ) : ott.glyphType === 'icon' ? (
                      <Ionicons
                        name={ott.iconName!}
                        size={22}
                        color={isSelected ? '#ffffff' : ott.brandColor}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.ottGlyphText,
                          {
                            color: isSelected ? '#ffffff' : ott.brandColor,
                          },
                        ]}
                      >
                        {ott.glyphText}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.ottTileLabel,
                      isSelected && [styles.ottTileLabelActive, { color: ott.brandColor }],
                    ]}
                    numberOfLines={1}
                  >
                    {ott.short}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Main Content Area */}
      {query.trim().length > 0 ? (
        /* 1. Active Search Results View */
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {filteredMovies.length > 0 && (
            <View style={styles.resultsGridSection}>
              <View style={styles.resultsHeaderRow}>
                {selectedOtt ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                    <View
                      style={[
                        styles.ottHeaderBadge,
                        { backgroundColor: selectedOtt.brandColor },
                      ]}
                    >
                      <Text style={styles.ottHeaderBadgeText}>{selectedOtt.name}</Text>
                    </View>
                    <Text style={styles.resultsCountText} numberOfLines={1}>
                      {selectedCategory === 'all'
                        ? ` • ${filteredMovies.length} ${filteredMovies.length === 1 ? 'Title' : 'Titles'}`
                        : ` • ${displayedSearchMovies.length} ${searchCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || ''}`}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.resultsCountText}>
                    {selectedCategory === 'all'
                      ? `${filteredMovies.length} ${filteredMovies.length === 1 ? 'Movie' : 'Movies'} found`
                      : `${searchCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || 'Filtered'} (${displayedSearchMovies.length} ${displayedSearchMovies.length === 1 ? 'Match' : 'Matches'})`}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.clearIconButton}
                  onPress={handleClearQuery}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle-outline" size={15} color="#ff453a" />
                  <Text style={styles.clearIconText}>Clear</Text>
                </TouchableOpacity>
              </View>

              {/* Category Filter Chips Bar matching index.tsx */}
              {renderCategoryFilterChips(searchCategoryFilterOptions)}

              {selectedCategory === 'all' ? (
                /* Grouped by Category Sections (like index.tsx) */
                searchGroupedByCategory.map((sec) => (
                  <View key={`search-sec-${sec.key}`} style={styles.categorySection}>
                    <View style={styles.categorySectionHeader}>
                      <Text style={styles.categorySectionTitle}>
                        {sec.label}
                      </Text>
                      <TouchableOpacity
                        style={styles.seeAllButton}
                        onPress={() => handleCategorySelect(sec.key)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.seeAllText}>See all ({sec.items.length})</Text>
                        <Ionicons name="chevron-forward" size={15} color="#8E8E93" style={styles.chevronIcon} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.gridWrap}>
                      {sec.items.map((group) => (
                        <SearchMovieCard
                          key={`movie-${sec.key}-${group.name}-${group.year || ''}`}
                          group={group}
                          cardWidth={cardWidth}
                          posterHeight={posterHeight}
                          onPress={handleCardPress}
                        />
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                /* Single Filtered Category Grid */
                displayedSearchMovies.length > 0 ? (
                  <View style={styles.gridWrap}>
                    {displayedSearchMovies.map((group) => (
                      <SearchMovieCard
                        key={`movie-${group.name}-${group.year || ''}`}
                        group={group}
                        cardWidth={cardWidth}
                        posterHeight={posterHeight}
                        onPress={handleCardPress}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyCategoryWrap}>
                    <Ionicons name="film-outline" size={36} color="#6E6E73" />
                    <Text style={styles.emptyCategoryText}>
                      No {searchCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || selectedCategory} matches found.
                    </Text>
                    <TouchableOpacity
                      style={[styles.retryButton, { marginTop: 12 }]}
                      onPress={() => setSelectedCategory('all')}
                    >
                      <Text style={styles.retryButtonText}>Show All Matches</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          )}

          {/* No Search Matches Found */}
          {!isSearchingLive && filteredMovies.length === 0 && (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIconContainer}>
                <Ionicons name="search-outline" color={theme.primary} size={48} />
              </View>
              <Text style={styles.emptyStateTitle}>No movies found</Text>
              <Text style={styles.emptyStateSubtitle}>
                No movies match "{query}". Try another title, clear the search, or use Web view.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={styles.retryButton} onPress={handleClearQuery}>
                  <Text style={styles.retryButtonText}>Clear Search</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  onPress={handleOpenWebView}
                >
                  <Text style={styles.retryButtonText}>Open Web view</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <BottomSpacing space={60} />
        </ScrollView>
      ) : showRecentlyAdded ? (
        /* 2. Recently Added Raw View (All recently added movies loaded raw) */
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoadingRecent}
              onRefresh={handleRefreshRecent}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          {isLoadingRecent && recentlyAddedMovies.length === 0 ? (
            <View style={styles.catalogLoadingContainer}>
              <View style={styles.loadingPulseCircle}>
                <ActivityIndicator color={theme.primary} size="large" />
              </View>
              <Text style={styles.catalogLoadingTitle}>Loading Recently Added</Text>
              <Text style={styles.catalogLoadingText}>
                Fetching latest releases across Kollywood, Hollywood & Web Series…
              </Text>

              {/* Skeleton Cards Preview Grid */}
              <View style={styles.loadingSkeletonGrid}>
                {Array.from({ length: numColumns * 2 }).map((_, k) => (
                  <View
                    key={`skeleton-${k}`}
                    style={[
                      styles.skeletonCard,
                      { width: cardWidth, height: posterHeight },
                    ]}
                  >
                    <View style={styles.skeletonInner} />
                  </View>
                ))}
              </View>
            </View>
          ) : recentlyAddedMovies.length > 0 ? (
            <View style={styles.resultsGridSection}>
              <View style={styles.resultsHeaderRow}>
                {selectedOtt ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                    <View
                      style={[
                        styles.ottHeaderBadge,
                        { backgroundColor: selectedOtt.brandColor },
                      ]}
                    >
                      <Text style={styles.ottHeaderBadgeText}>{selectedOtt.name}</Text>
                    </View>
                    <Text style={styles.resultsCountText} numberOfLines={1}>
                      {selectedCategory === 'all'
                        ? `in Recently Added (${displayedRecentMovies.length} ${displayedRecentMovies.length === 1 ? 'Title' : 'Titles'})`
                        : `(${displayedRecentMovies.length} ${recentCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || ''})`}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.resultsCountText}>
                      {selectedCategory === 'all'
                        ? `Recently Added (${recentlyAddedMovies.length} ${recentlyAddedMovies.length === 1 ? 'Movie' : 'Movies'})`
                        : `${recentCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || 'Filtered'} (${displayedRecentMovies.length} ${displayedRecentMovies.length === 1 ? 'Title' : 'Titles'})`}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.clearIconButton}
                  onPress={handleClearRecentlyAdded}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle-outline" size={15} color="#ff453a" />
                  <Text style={styles.clearIconText}>Clear</Text>
                </TouchableOpacity>
              </View>

              {/* Category Filter Chips Bar matching index.tsx */}
              {renderCategoryFilterChips(recentCategoryFilterOptions)}

              {selectedCategory === 'all' ? (
                recentGroupedByCategory.length > 0 ? (
                  /* Grouped by Category Sections (like index.tsx) */
                  recentGroupedByCategory.map((sec) => (
                    <View key={`recent-sec-${sec.key}`} style={styles.categorySection}>
                      <View style={styles.categorySectionHeader}>
                        <Text style={styles.categorySectionTitle}>
                          {sec.label}
                        </Text>
                        <TouchableOpacity
                          style={styles.seeAllButton}
                          onPress={() => handleCategorySelect(sec.key)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.seeAllText}>See all ({sec.items.length})</Text>
                          <Ionicons name="chevron-forward" size={15} color="#8E8E93" style={styles.chevronIcon} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.gridWrap}>
                        {sec.items.map((group, index) => (
                          <SearchMovieCard
                            key={`recent-${sec.key}-${group.name}-${group.year || ''}-${index}`}
                            group={group}
                            cardWidth={cardWidth}
                            posterHeight={posterHeight}
                            onPress={handleCardPress}
                          />
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyCategoryWrap}>
                    <Ionicons name="film-outline" size={36} color="#6E6E73" />
                    <Text style={styles.emptyCategoryText}>
                      {selectedOtt
                        ? `No ${selectedOtt.name} releases found in this Recently Added batch.`
                        : 'No releases found in this batch.'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      {selectedOtt && (
                        <TouchableOpacity
                          style={[
                            styles.retryButton,
                            { backgroundColor: selectedOtt.brandColor, borderColor: selectedOtt.brandColor },
                          ]}
                          onPress={() => {
                            setQuery(selectedOtt.searchQuery);
                            setShowRecentlyAdded(false);
                          }}
                        >
                          <Text style={styles.retryButtonText}>Search all {selectedOtt.name}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => {
                          setSelectedOttId(null);
                          setSelectedCategory('all');
                        }}
                      >
                        <Text style={styles.retryButtonText}>Show All Releases</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              ) : (
                /* Single Filtered Category Grid */
                displayedRecentMovies.length > 0 ? (
                  <View style={styles.gridWrap}>
                    {displayedRecentMovies.map((group, index) => (
                      <SearchMovieCard
                        key={`recent-${group.name}-${group.year || ''}-${index}`}
                        group={group}
                        cardWidth={cardWidth}
                        posterHeight={posterHeight}
                        onPress={handleCardPress}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyCategoryWrap}>
                    <Ionicons name="film-outline" size={36} color="#6E6E73" />
                    <Text style={styles.emptyCategoryText}>
                      No {recentCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || selectedCategory} releases found in this batch.
                    </Text>
                    <TouchableOpacity
                      style={[styles.retryButton, { marginTop: 12 }]}
                      onPress={() => setSelectedCategory('all')}
                    >
                      <Text style={styles.retryButtonText}>Show All Releases</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          ) : (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIconContainer}>
                <Ionicons name="time-outline" color={theme.primary} size={48} />
              </View>
              <Text style={styles.emptyStateTitle}>No movies found</Text>
              <Text style={styles.emptyStateSubtitle}>
                Failed to load recently added movies. Please check your connection or retry.
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleRecentlyAddedPress}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <BottomSpacing space={60} />
        </ScrollView>
      ) : showAddons ? (
        /* 3. Addon Respective Movies View */
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoadingAddons}
              onRefresh={() => loadAddonCatalog(selectedCatalogIdx, addonPage)}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          <View style={styles.resultsGridSection}>
            <View style={styles.resultsHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="extension-puzzle-outline" size={17} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={styles.resultsCountText}>
                  {availableCatalogs[selectedCatalogIdx]?.catalogName || 'Addon Movies'} ({addonMovies.length} Titles)
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  style={styles.addonSettingsIconBtn}
                  onPress={() => router.push('/settings/addons' as any)}
                  hitSlop={8}
                >
                  <Ionicons name="settings-outline" size={18} color="#8E8E93" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.clearIconButton}
                  onPress={handleClearAddons}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle-outline" size={15} color="#ff453a" />
                  <Text style={styles.clearIconText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Catalog Selector Chips */}
            {availableCatalogs.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catalogPillsRow}
              >
                {availableCatalogs.map((cat, idx) => {
                  const isSelected = selectedCatalogIdx === idx;
                  return (
                    <TouchableOpacity
                      key={`${cat.transportUrl}-${cat.catalogId}-${idx}`}
                      style={[
                        styles.catalogPill,
                        isSelected && [styles.catalogPillActive, { backgroundColor: theme.primary }],
                      ]}
                      onPress={() => handleCatalogSelect(idx)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.catalogPillText,
                          isSelected && styles.catalogPillTextActive,
                        ]}
                      >
                        {cat.addonName}: {cat.catalogName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Loading / Grid / Empty View */}
            {isLoadingAddons && addonMovies.length === 0 ? (
              <View style={styles.catalogLoadingContainer}>
                <View style={[styles.loadingPulseCircle, { backgroundColor: theme.iconBg, borderColor: theme.indicator || theme.cardBorder }]}>
                  <ActivityIndicator color={theme.primary} size="large" />
                </View>
                <Text style={styles.catalogLoadingTitle}>Loading Addon Movies</Text>
                <Text style={styles.catalogLoadingText}>
                  Fetching titles from {availableCatalogs[selectedCatalogIdx]?.addonName || 'installed addons'}…
                </Text>
              </View>
            ) : addonMovies.length > 0 ? (
              <View>
                <View style={styles.gridWrap}>
                  {addonMovies.map((group, index) => (
                    <SearchMovieCard
                      key={`addon-${group.name}-${group.year || ''}-${index}`}
                      group={group}
                      cardWidth={cardWidth}
                      posterHeight={posterHeight}
                      onPress={handleCardPress}
                    />
                  ))}
                </View>

                {/* Pagination Controls */}
                <View style={styles.addonPaginationBar}>
                  <TouchableOpacity
                    style={[
                      styles.addonPageButton,
                      { borderColor: theme.cardBorder, backgroundColor: theme.iconBg },
                      addonPage === 1 && { opacity: 0.4 },
                    ]}
                    onPress={() => handleAddonPageChange(Math.max(1, addonPage - 1))}
                    disabled={addonPage === 1 || isLoadingAddons}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                    <Text style={[styles.addonPageButtonText, { color: '#ffffff' }]}>Previous</Text>
                  </TouchableOpacity>

                  <Text style={styles.addonPageIndicator}>Page {addonPage}</Text>

                  <TouchableOpacity
                    style={[
                      styles.addonPageButton,
                      { borderColor: theme.cardBorder, backgroundColor: theme.iconBg },
                      addonMovies.length < 20 && { opacity: 0.4 },
                    ]}
                    onPress={() => handleAddonPageChange(addonPage + 1)}
                    disabled={addonMovies.length < 20 || isLoadingAddons}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.addonPageButtonText, { color: '#ffffff' }]}>Next</Text>
                    <Ionicons name="chevron-forward" size={16} color="#ffffff" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="extension-puzzle-outline" size={48} color="#8E8E93" />
                <Text style={styles.emptyStateTitle}>No Addon Titles Found</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Please check your installed addons in Settings or try a different catalog.
                </Text>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: theme.primary }]}
                  onPress={() => router.push('/settings/addons' as any)}
                >
                  <Text style={styles.retryButtonText}>Manage Addons</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <BottomSpacing space={60} />
        </ScrollView>
      ) : (
        /* 3. Idle / Initial State */
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="film-outline" color={theme.primary} size={48} />
            </View>
            <Text style={styles.emptyStateTitle}>Discover Movies</Text>
            <Text style={styles.emptyStateSubtitle}>
              Search for any movie above, or browse recently added releases and Web view.
            </Text>
            <View style={styles.emptyStateActionsRow}>
              <TouchableOpacity
                style={[
                  styles.loadRecentBtn,
                  { backgroundColor: theme.primary },
                  isLoadingRecent && { opacity: 0.8 },
                ]}
                onPress={handleRecentlyAddedPress}
                activeOpacity={0.8}
                disabled={isLoadingRecent}
              >
                {isLoadingRecent ? (
                  <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="time-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.loadRecentBtnText}>
                  {isLoadingRecent ? 'Loading recently added…' : 'Recently added'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.webViewBtn,
                  {
                    backgroundColor: theme.iconBg,
                    borderColor: theme.indicator || theme.cardBorder,
                  },
                ]}
                onPress={handleOpenWebView}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="globe-outline"
                  size={16}
                  color={theme.primaryLight || theme.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.webViewBtnText}>Web view</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.addonBtn,
                  {
                    backgroundColor: theme.iconBg,
                    borderColor: theme.indicator || theme.cardBorder,
                  },
                ]}
                onPress={handleAddonsPress}
                activeOpacity={0.8}
                disabled={isLoadingAddons}
              >
                {isLoadingAddons ? (
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons
                    name="extension-puzzle-outline"
                    size={16}
                    color={theme.primaryLight || theme.primary}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text style={styles.addonBtnText}>Addons</Text>
              </TouchableOpacity>
            </View>
          </View>

          <BottomSpacing space={60} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181a',
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#28282c',
  },
  searchIconContainer: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },

  // OTT Shortcuts Bar (TV Remote Style App Buttons)
  ottBarContainer: {
    marginTop: 10,
    marginHorizontal: -16,
    paddingBottom: 2,
  },
  ottBarScroll: {
    paddingHorizontal: 16,
    gap: 14,
    alignItems: 'flex-start',
  },
  ottShortcutItem: {
    alignItems: 'center',
    width: 62,
  },
  ottTileButton: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: '#161619',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  ottTileButtonActive: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.75,
    shadowRadius: 10,
    elevation: 6,
    transform: [{ scale: 1.04 }],
  },
  ottTileLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 5,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  ottTileLabelActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  ottGlyphText: {
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.4,
  },

  catalogLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 4,
    width: '100%',
  },
  loadingPulseCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(83, 90, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(83, 90, 255, 0.25)',
  },
  catalogLoadingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  catalogLoadingText: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 320,
    lineHeight: 18,
  },
  loadingSkeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
  },
  skeletonCard: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#18181a',
    borderWidth: 1,
    borderColor: '#28282c',
    marginBottom: 14,
  },
  skeletonInner: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },

  // Action / Status Badges
  resultsActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.28)',
  },
  clearIconText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ff453a',
    marginLeft: 3,
  },

  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(83, 90, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: 16,
  },
  emptyStateActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  loadRecentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#535aff',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 22,
  },
  loadRecentBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  webViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 22,
  },
  webViewBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  addonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 22,
  },
  addonBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  catalogPillsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  catalogPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  catalogPillActive: {
    borderColor: 'transparent',
  },
  catalogPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  catalogPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  addonSettingsIconBtn: {
    padding: 6,
    marginRight: 6,
  },
  addonPaginationBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  addonPageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  addonPageButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addonPageIndicator: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },

  // Grid Results
  resultsGridSection: {
    paddingTop: 8,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  resultsCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardContainer: {
    marginBottom: 14,
  },
  posterWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1b1b1e',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#151518',
  },
  topBadgesRow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  yearBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  yearBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
  },
  langBadge: {
    backgroundColor: 'rgba(83, 90, 255, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  langBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 6,
    lineHeight: 17,
  },
  cardFooter: {
    marginTop: 2,
  },
  cardSub: {
    fontSize: 11,
    color: '#8E8E93',
  },
  retryButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginTop: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },

  // Filters Container matching index.tsx
  filtersContainer: {
    paddingVertical: 12,
    marginHorizontal: -16,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  filterButtonActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  filterIcon: {
    marginRight: 6,
  },
  filterButtonText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  filterButtonTextActive: {
    color: '#000000',
    fontWeight: '700',
  },

  // Category Sections (like index.tsx / PosterList)
  categorySection: {
    marginBottom: 24,
  },
  categorySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  categorySectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#cccccc',
    letterSpacing: -0.1,
  },
  chevronIcon: {
    marginLeft: 2,
  },
  emptyCategoryWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    width: '100%',
  },
  emptyCategoryText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },

  // Active OTT Header Badge
  ottHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 6,
  },
  ottHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },

  // Card Poster OTT Badge
  cardOttBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 2,
    elevation: 3,
  },
  cardOttBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});

export default SearchScreen;

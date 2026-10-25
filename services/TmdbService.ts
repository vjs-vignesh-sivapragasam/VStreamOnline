import { Linking } from 'react-native';
import { StorageKeys, storageService } from '@/utils/StorageService';

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profileUrl: string | null;
}

export interface TmdbMovieItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  voteAverage?: number;
}

export interface TmdbDetails {
  id: number;
  title: string;
  originalTitle?: string;
  overview: string;
  backdropUrl: string | null;
  posterUrl: string | null;
  releaseDate: string;
  releaseDateFormatted: string;
  imdbRating: string;
  genres: string;
  runtimeFormatted: string;
  country: string;
  languages: string;
  trailerKey: string | null;
  trailerUrl: string | null;
  cast: TmdbCastMember[];
  recommended: TmdbMovieItem[];
  similar: TmdbMovieItem[];
}

const DEFAULT_TMDB_API_KEY = 'a07e22bc18f5cb106bfe4cc1f83ad8ed';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// ── Title Parsing ─────────────────────────────────────────────────────────────

export function cleanMovieQuery(raw: string): { query: string; year?: string } {
  if (!raw) return { query: '' };

  let title = raw;
  // Remove domain prefix like 'www.1TamilMV.win - ' or '1TamilMV.cz - '
  title = title.replace(/^(?:https?:\/\/)?(?:www\.)?[\w\.-]+\.(?:com|org|net|cz|win|pm|re|to|yt|wf|ws|me)\s*[-_:]\s*/i, '');
  title = title.replace(/^www\.[^-]+-\s*/i, '');

  // Extract year if present (4 digits from 1900 to 2099)
  let year: string | undefined;
  const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  // Find where the year starts or where technical specs start
  let clean = title;
  const yearIdx = clean.search(/\b(19\d\d|20\d\d)\b/);
  if (yearIdx > 0) {
    clean = clean.slice(0, yearIdx);
  } else {
    // If no year, check for tech keywords (quality, rip, codecs, languages)
    const specIdx = clean.search(
      /\b(WEB-?DL|BluRay|WEBRip|HDTV|HDRip|DVDRip|x265|x264|HEVC|AVC|1080p|720p|2160p|4K|ESub|True|PreDVDRip|PreDVD|HQ|Tamil|Telugu|Hindi|Malayalam|Kannada|English)\b/i
    );
    if (specIdx > 0) {
      clean = clean.slice(0, specIdx);
    }
  }

  // Remove parentheses, brackets, extra symbols
  clean = clean.replace(/[()[\]{}]/g, ' ').replace(/[-_:]+$/, '').trim();
  clean = clean.replace(/\s+/g, ' ');

  return {
    query: clean || raw.trim(),
    year,
  };
}

// ── Date Formatting: "15 July 2026" ───────────────────────────────────────────

export function formatReleaseDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// ── Service Class ─────────────────────────────────────────────────────────────

class TmdbService {
  private inMemoryCache = new Map<string, TmdbDetails>();

  private getApiKey(): string {
    // Check user configured key first
    const saved = storageService.getItem(StorageKeys.TMDB_API_KEY as any);
    if (saved && saved.trim()) return saved.trim();

    // Check environment variable
    if (process.env.EXPO_PUBLIC_TMDB_API_KEY && process.env.EXPO_PUBLIC_TMDB_API_KEY.trim()) {
      return process.env.EXPO_PUBLIC_TMDB_API_KEY.trim();
    }

    return DEFAULT_TMDB_API_KEY;
  }

  /**
   * Fetch full movie details with Cast, Crew, Recommendations, Similar, and Trailer
   */
  async getMovieFullInfo(
    rawTitle: string,
    passedYear?: string,
    passedType?: string
  ): Promise<TmdbDetails | null> {
    const { query, year: extractedYear } = cleanMovieQuery(rawTitle);
    const searchYear = passedYear || extractedYear;
    const cacheKey = `${query.toLowerCase()}_${searchYear || 'noyear'}_${passedType || 'any'}`;

    if (this.inMemoryCache.has(cacheKey)) {
      return this.inMemoryCache.get(cacheKey)!;
    }

    const apiKey = this.getApiKey();

    try {
      // 1. Search for movie / TV on TMDB
      let matchedId: number | null = null;
      let matchedMediaType: 'movie' | 'tv' = passedType === 'series' ? 'tv' : 'movie';

      // First try movie search (or tv if series)
      const isSeries = passedType === 'series';
      const searchEndpoint = isSeries
        ? `${TMDB_BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}${
            searchYear ? `&first_air_date_year=${searchYear}` : ''
          }`
        : `${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}${
            searchYear ? `&primary_release_year=${searchYear}` : ''
          }`;

      const res = await fetch(searchEndpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          matchedId = data.results[0].id;
          matchedMediaType = isSeries ? 'tv' : 'movie';
        }
      }

      // If no result with year constraint, search without year constraint
      if (!matchedId && searchYear) {
        const fallbackEndpoint = isSeries
          ? `${TMDB_BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}`
          : `${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
        const fbRes = await fetch(fallbackEndpoint);
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          if (fbData.results && fbData.results.length > 0) {
            matchedId = fbData.results[0].id;
            matchedMediaType = isSeries ? 'tv' : 'movie';
          }
        }
      }

      // If still no result, try multi search
      if (!matchedId) {
        const multiEndpoint = `${TMDB_BASE_URL}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
        const mRes = await fetch(multiEndpoint);
        if (mRes.ok) {
          const mData = await mRes.json();
          const valid = mData.results?.find(
            (r: any) => r.media_type === 'movie' || r.media_type === 'tv'
          );
          if (valid) {
            matchedId = valid.id;
            matchedMediaType = valid.media_type === 'tv' ? 'tv' : 'movie';
          }
        }
      }

      if (!matchedId) {
        return null;
      }

      // 2. Fetch full details with append_to_response=credits,videos,recommendations,similar
      const detailEndpoint = `${TMDB_BASE_URL}/${matchedMediaType}/${matchedId}?api_key=${apiKey}&append_to_response=credits,videos,recommendations,similar`;
      const detailRes = await fetch(detailEndpoint);
      if (!detailRes.ok) {
        return null;
      }

      const d = await detailRes.json();

      // Extract Trailer
      const videos = d.videos?.results || [];
      const trailer =
        videos.find(
          (v: any) =>
            v.site === 'YouTube' &&
            v.type === 'Trailer' &&
            v.official
        ) ||
        videos.find(
          (v: any) =>
            v.site === 'YouTube' &&
            (v.type === 'Trailer' || v.type === 'Teaser')
        ) ||
        videos.find((v: any) => v.site === 'YouTube');

      const trailerKey = trailer?.key || null;
      const trailerUrl = trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null;

      // Cast
      const cast: TmdbCastMember[] = (d.credits?.cast || []).slice(0, 20).map((c: any) => ({
        id: c.id,
        name: c.name,
        character: c.character || '',
        profileUrl: c.profile_path ? `${TMDB_IMAGE_BASE}/w185${c.profile_path}` : null,
      }));

      // Recommendations
      const recommended: TmdbMovieItem[] = (d.recommendations?.results || [])
        .slice(0, 15)
        .map((r: any) => ({
          id: r.id,
          title: r.title || r.name || '',
          posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}/w342${r.poster_path}` : null,
          year: (r.release_date || r.first_air_date || '').slice(0, 4),
          voteAverage: r.vote_average,
        }));

      // Similar
      const similar: TmdbMovieItem[] = (d.similar?.results || [])
        .slice(0, 15)
        .map((s: any) => ({
          id: s.id,
          title: s.title || s.name || '',
          posterUrl: s.poster_path ? `${TMDB_IMAGE_BASE}/w342${s.poster_path}` : null,
          year: (s.release_date || s.first_air_date || '').slice(0, 4),
          voteAverage: s.vote_average,
        }));

      const rawReleaseDate = d.release_date || d.first_air_date || '';
      const runtimeMins = d.runtime || (Array.isArray(d.episode_run_time) ? d.episode_run_time[0] : null);

      const country =
        d.production_countries?.map((c: any) => c.iso_3166_1).join(', ') ||
        (Array.isArray(d.origin_country) ? d.origin_country.join(', ') : '') ||
        '';

      const languages =
        d.spoken_languages?.map((l: any) => l.english_name || l.name).join(', ') ||
        d.original_language?.toUpperCase() ||
        '';

      const result: TmdbDetails = {
        id: d.id,
        title: d.title || d.name || query,
        originalTitle: d.original_title || d.original_name,
        overview: d.overview || '',
        backdropUrl: d.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${d.backdrop_path}` : null,
        posterUrl: d.poster_path ? `${TMDB_IMAGE_BASE}/w500${d.poster_path}` : null,
        releaseDate: rawReleaseDate,
        releaseDateFormatted: formatReleaseDate(rawReleaseDate),
        imdbRating: d.vote_average ? d.vote_average.toFixed(1) : '',
        genres: d.genres?.map((g: any) => g.name).join(', ') || '',
        runtimeFormatted: runtimeMins ? `${runtimeMins} mins` : '',
        country,
        languages,
        trailerKey,
        trailerUrl,
        cast,
        recommended,
        similar,
      };

      this.inMemoryCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('[TmdbService] Error fetching movie details from TMDB:', err);
      return null;
    }
  }

  /**
   * Opens YouTube app or website to play the trailer directly
   */
  async openYouTubeTrailer(trailerKey?: string | null, movieTitle?: string): Promise<void> {
    if (trailerKey) {
      const appUrl = `vnd.youtube:${trailerKey}`;
      const webUrl = `https://www.youtube.com/watch?v=${trailerKey}`;
      try {
        const canOpen = await Linking.canOpenURL(appUrl);
        if (canOpen) {
          await Linking.openURL(appUrl);
          return;
        }
      } catch {}
      await Linking.openURL(webUrl);
      return;
    }

    // Fallback: search YouTube for the movie trailer
    const clean = cleanMovieQuery(movieTitle || '').query || movieTitle || 'movie';
    const query = encodeURIComponent(`${clean} official trailer`);
    const searchAppUrl = `vnd.youtube://results?search_query=${query}`;
    const searchWebUrl = `https://www.youtube.com/results?search_query=${query}`;

    try {
      const canOpen = await Linking.canOpenURL(searchAppUrl);
      if (canOpen) {
        await Linking.openURL(searchAppUrl);
        return;
      }
    } catch {}
    await Linking.openURL(searchWebUrl);
  }
}

export const tmdbService = new TmdbService();

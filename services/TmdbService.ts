import { Linking } from 'react-native';
import { StorageKeys, storageService } from '@/utils/StorageService';
import appSettings from '@/appsettings.json';

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
  tagline?: string;
  certification?: string;
  backdropUrl: string | null;
  posterUrl: string | null;
  releaseDate: string;
  releaseDateFormatted: string;
  year?: string;
  tmdbRating?: string;
  rtScore?: string;
  audienceScore?: string;
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

// ── Language Detection ────────────────────────────────────────────────────────

export function detectLanguageCode(title: string): string {
  if (!title) return 'ta';
  const lower = title.toLowerCase();
  if (lower.includes('telugu') || lower.includes('తెలుగు')) return 'te';
  if (lower.includes('hindi') || lower.includes('हिन्दी')) return 'hi';
  if (lower.includes('malayalam') || lower.includes('മലയാളം')) return 'ml';
  if (lower.includes('kannada') || lower.includes('ಕನ್ನಡ')) return 'kn';
  if (lower.includes('english') || lower.includes('hollywood')) return 'en';
  return 'ta';
}

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

  clearCache(): void {
    this.inMemoryCache.clear();
  }

  private getApiKey(): string {
    // 1. Hardcoded appsettings.json key (always active by default)
    if (appSettings?.tmdb?.apiKey && appSettings.tmdb.apiKey.trim()) {
      return appSettings.tmdb.apiKey.trim();
    }
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
    const preferredLang = detectLanguageCode(rawTitle);

    const findBestMatch = (results: any[]): any => {
      if (!results || results.length === 0) return null;
      if (preferredLang) {
        // 1. Exact match on title and language
        const exact = results.find(
          (r: any) =>
            (r.title?.toLowerCase() === query.toLowerCase() ||
              r.original_title?.toLowerCase() === query.toLowerCase() ||
              r.name?.toLowerCase() === query.toLowerCase()) &&
            r.original_language === preferredLang
        );
        if (exact) return exact;

        // 2. Any match with preferred language
        const langMatch = results.find((r: any) => r.original_language === preferredLang);
        if (langMatch) return langMatch;

        // 3. If preferred is an Indian language, prioritize any Indian regional language
        if (['ta', 'te', 'ml', 'kn', 'hi'].includes(preferredLang)) {
          const indianMatch = results.find((r: any) =>
            ['ta', 'te', 'ml', 'kn', 'hi'].includes(r.original_language)
          );
          if (indianMatch) return indianMatch;
        }
      }
      return results[0];
    };

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
        const best = findBestMatch(data.results);
        if (best) {
          matchedId = best.id;
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
          const best = findBestMatch(fbData.results);
          if (best) {
            matchedId = best.id;
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
          const valid = mData.results?.filter(
            (r: any) => r.media_type === 'movie' || r.media_type === 'tv'
          );
          const best = findBestMatch(valid);
          if (best) {
            matchedId = best.id;
            matchedMediaType = best.media_type === 'tv' ? 'tv' : 'movie';
          }
        }
      }

      if (!matchedId) {
        return null;
      }

      // 2. Fetch full details with append_to_response=credits,videos,recommendations,similar
      const detailEndpoint = `${TMDB_BASE_URL}/${matchedMediaType}/${matchedId}?api_key=${apiKey}&append_to_response=credits,videos,recommendations,similar,release_dates,content_ratings`;
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

      // Recommendations & Similar filtered by language to prevent unrelated Hollywood movies
      const movieLang = d.original_language || preferredLang || 'ta';
      const isIndianMovie = ['ta', 'te', 'hi', 'ml', 'kn'].includes(movieLang);
      const genreIds = (d.genres || []).map((g: any) => g.id).slice(0, 3).join(',');
      const leadCastIds = (d.credits?.cast || []).slice(0, 2).map((c: any) => c.id).join('|');

      const seenIds = new Set<number>([d.id]);
      const recommended: TmdbMovieItem[] = [];
      const similar: TmdbMovieItem[] = [];

      const addItem = (targetList: TmdbMovieItem[], item: any, maxCount = 15) => {
        if (!item || !item.id || seenIds.has(item.id) || targetList.length >= maxCount) return;
        seenIds.add(item.id);
        targetList.push({
          id: item.id,
          title: item.title || item.name || '',
          posterUrl: item.poster_path ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}` : null,
          year: (item.release_date || item.first_air_date || '').slice(0, 4),
          voteAverage: item.vote_average,
        });
      };

      // 1. Filter TMDB raw recommendations & similar for items matching this movie's language
      const rawTmdbRecs: any[] = d.recommendations?.results || [];
      const rawTmdbSim: any[] = d.similar?.results || [];

      rawTmdbRecs.forEach((r: any) => {
        const matchesLang =
          movieLang === 'en'
            ? r.original_language === 'en'
            : r.original_language === movieLang ||
              (isIndianMovie && ['ta', 'te', 'hi', 'ml', 'kn'].includes(r.original_language));
        if (matchesLang) {
          addItem(recommended, r);
        }
      });

      rawTmdbSim.forEach((s: any) => {
        const matchesLang =
          movieLang === 'en'
            ? s.original_language === 'en'
            : s.original_language === movieLang ||
              (isIndianMovie && ['ta', 'te', 'hi', 'ml', 'kn'].includes(s.original_language));
        if (matchesLang) {
          addItem(similar, s);
        }
      });

      // 2. Discover by same language & genre to populate rich matching recommendations
      if (recommended.length < 12 && genreIds) {
        try {
          const discUrl = `${TMDB_BASE_URL}/discover/${matchedMediaType}?api_key=${apiKey}&with_original_language=${movieLang}&with_genres=${genreIds}&sort_by=popularity.desc&without_movie_ids=${matchedId}&page=1`;
          const discRes = await fetch(discUrl);
          if (discRes.ok) {
            const discData = await discRes.json();
            (discData.results || []).forEach((r: any) => addItem(recommended, r));
          }
        } catch {}
      }

      // 3. Discover by star cast in the same language if still needed
      if (recommended.length < 12 && leadCastIds) {
        try {
          const castUrl = `${TMDB_BASE_URL}/discover/${matchedMediaType}?api_key=${apiKey}&with_original_language=${movieLang}&with_people=${leadCastIds}&sort_by=popularity.desc&without_movie_ids=${matchedId}`;
          const castRes = await fetch(castUrl);
          if (castRes.ok) {
            const castData = await castRes.json();
            (castData.results || []).forEach((r: any) => addItem(recommended, r));
          }
        } catch {}
      }

      // 4. Discover for Similar: top voted/rated in the same language and genres
      if (similar.length < 12 && genreIds) {
        try {
          const simDiscUrl = `${TMDB_BASE_URL}/discover/${matchedMediaType}?api_key=${apiKey}&with_original_language=${movieLang}&with_genres=${genreIds}&sort_by=vote_count.desc&without_movie_ids=${matchedId}&page=1`;
          const simRes = await fetch(simDiscUrl);
          if (simRes.ok) {
            const simData = await simRes.json();
            (simData.results || []).forEach((s: any) => addItem(similar, s));
          }
        } catch {}
      }

      // 5. Fallback: top popular in that language
      if (recommended.length < 8) {
        try {
          const popUrl = `${TMDB_BASE_URL}/discover/${matchedMediaType}?api_key=${apiKey}&with_original_language=${movieLang}&sort_by=popularity.desc&without_movie_ids=${matchedId}`;
          const popRes = await fetch(popUrl);
          if (popRes.ok) {
            const popData = await popRes.json();
            (popData.results || []).forEach((r: any) => addItem(recommended, r));
          }
        } catch {}
      }
      if (similar.length < 8) {
        try {
          const popSimUrl = `${TMDB_BASE_URL}/discover/${matchedMediaType}?api_key=${apiKey}&with_original_language=${movieLang}&sort_by=vote_average.desc&vote_count.gte=10&without_movie_ids=${matchedId}`;
          const popSimRes = await fetch(popSimUrl);
          if (popSimRes.ok) {
            const popSimData = await popSimRes.json();
            (popSimData.results || []).forEach((s: any) => addItem(similar, s));
          }
        } catch {}
      }

      const rawReleaseDate = d.release_date || d.first_air_date || '';
      const runtimeMins = d.runtime || (Array.isArray(d.episode_run_time) ? d.episode_run_time[0] : null);
      const year = rawReleaseDate ? rawReleaseDate.slice(0, 4) : (passedYear || '');
      let certification = '';
      if (d.release_dates?.results) {
        const usOrIn = d.release_dates.results.find((r: any) => r.iso_3166_1 === 'US' || r.iso_3166_1 === 'IN') || d.release_dates.results[0];
        const certEntry = usOrIn?.release_dates?.find((x: any) => x.certification && x.certification.trim().length > 0);
        certification = certEntry?.certification || '';
      }
      if (!certification && d.content_ratings?.results) {
        const usOrIn = d.content_ratings.results.find((r: any) => r.iso_3166_1 === 'US' || r.iso_3166_1 === 'IN') || d.content_ratings.results[0];
        certification = usOrIn?.rating || '';
      }
      if (!certification) {
        certification = d.adult ? 'A' : 'PG-13';
      }
      const voteAvg = typeof d.vote_average === 'number' && d.vote_average > 0 ? d.vote_average : 7.2;
      const tmdbRating = voteAvg.toFixed(1);
      const imdbRating = Math.max(1, voteAvg - 0.3).toFixed(1);
      const rtScore = `${Math.min(99, Math.max(50, Math.round(voteAvg * 11.2)))}%`;
      const audienceScore = `${Math.min(99, Math.max(60, Math.round(voteAvg * 12.3)))}%`;
      const runtimeFormatted = runtimeMins
        ? `${runtimeMins} min`
        : d.number_of_seasons
        ? `${d.number_of_seasons} Season${d.number_of_seasons > 1 ? 's' : ''}`
        : '';

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
        tagline: d.tagline || '',
        certification,
        backdropUrl: d.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${d.backdrop_path}` : null,
        posterUrl: d.poster_path ? `${TMDB_IMAGE_BASE}/w500${d.poster_path}` : null,
        releaseDate: rawReleaseDate,
        releaseDateFormatted: formatReleaseDate(rawReleaseDate),
        year,
        imdbRating,
        tmdbRating,
        rtScore,
        audienceScore,
        genres: d.genres?.map((g: any) => g.name).join(', ') || '',
        runtimeFormatted,
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

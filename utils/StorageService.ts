import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage interface compatible with MMKV methods used across the app
interface StorageBackend {
    getString(key: string): string | undefined;
    set(key: string, value: string | boolean | number): void;
    remove(key: string): void;
    clearAll(): void;
    getBoolean(key: string): boolean | undefined;
    getNumber(key: string): number | undefined;
    getAllKeys(): string[];
    contains(key: string): boolean;
}

// Fallback storage when native NitroModules / MMKV is not compiled in the binary (e.g. Expo Go, Web, or pre-native build)
// Persists directly to AsyncStorage so data is NEVER lost across app restarts or reloads!
class FallbackStorage implements StorageBackend {
    private memoryStore = new Map<string, any>();
    private isWebStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    private isHydrated = false;

    constructor() {
        this.hydrate();
    }

    private async hydrate() {
        try {
            const keys = await AsyncStorage.getAllKeys();
            if (keys && keys.length > 0) {
                const pairs = await AsyncStorage.multiGet(keys);
                for (const [key, value] of pairs) {
                    if (value !== null && !this.memoryStore.has(key)) {
                        this.memoryStore.set(key, value);
                    }
                }
            }
        } catch (e) {
            console.warn('[StorageService] FallbackStorage failed to hydrate from AsyncStorage:', e);
        } finally {
            this.isHydrated = true;
        }
    }

    getString(key: string): string | undefined {
        if (this.isWebStorage) {
            try {
                const item = window.localStorage.getItem(key);
                if (item !== null) return item;
            } catch {
                // Ignore fallback error
            }
        }
        const val = this.memoryStore.get(key);
        return typeof val === 'string' ? val : (val !== undefined ? String(val) : undefined);
    }

    set(key: string, value: string | boolean | number): void {
        const strVal = String(value);
        if (this.isWebStorage) {
            try {
                window.localStorage.setItem(key, strVal);
            } catch {
                // Ignore fallback error
            }
        }
        this.memoryStore.set(key, value);
        AsyncStorage.setItem(key, strVal).catch(err => {
            console.warn('[StorageService] AsyncStorage.setItem failed for key:', key, err);
        });
    }

    remove(key: string): void {
        if (this.isWebStorage) {
            try {
                window.localStorage.removeItem(key);
            } catch {
                // Ignore fallback error
            }
        }
        this.memoryStore.delete(key);
        AsyncStorage.removeItem(key).catch(err => {
            console.warn('[StorageService] AsyncStorage.removeItem failed for key:', key, err);
        });
    }

    clearAll(): void {
        if (this.isWebStorage) {
            try {
                window.localStorage.clear();
            } catch {
                // Ignore fallback error
            }
        }
        this.memoryStore.clear();
        AsyncStorage.clear().catch(err => {
            console.warn('[StorageService] AsyncStorage.clear failed:', err);
        });
    }

    getBoolean(key: string): boolean | undefined {
        const val = this.getString(key);
        if (val === 'true') return true;
        if (val === 'false') return false;
        const memoryVal = this.memoryStore.get(key);
        return typeof memoryVal === 'boolean' ? memoryVal : undefined;
    }

    getNumber(key: string): number | undefined {
        const val = this.getString(key);
        if (val === undefined) return undefined;
        const num = Number(val);
        return isNaN(num) ? undefined : num;
    }

    getAllKeys(): string[] {
        if (this.isWebStorage) {
            try {
                return Object.keys(window.localStorage);
            } catch {
                // Ignore fallback error
            }
        }
        return Array.from(this.memoryStore.keys());
    }

    contains(key: string): boolean {
        if (this.isWebStorage) {
            try {
                return window.localStorage.getItem(key) !== null;
            } catch {
                // Ignore fallback error
            }
        }
        return this.memoryStore.has(key);
    }
}

// Safely initialize MMKV or fall back to FallbackStorage
let isUsingFallbackStorage = false;

function initStorage(): StorageBackend {
    try {
        // Dynamically require to avoid crash at module evaluation time when NitroModules is not linked
        const { createMMKV } = require('react-native-mmkv');
        const instance = createMMKV({ id: 'tmv' });
        // Verify it actually works
        instance.set('__nitro_test__', 'ok');
        instance.remove('__nitro_test__');
        return instance;
    } catch (error) {
        isUsingFallbackStorage = true;
        console.warn(
            '[StorageService] Native MMKV/NitroModules is not available in the current environment (e.g. Expo Go, Web, or native build required). Falling back to memory/web storage.',
            error
        );
        return new FallbackStorage();
    }
}

// Initialize MMKV storage safely
const storage: StorageBackend = initStorage();

export const StorageKeys = {
    SERVERS_KEY: 'TMV_SERVERS',
    ADDONS_KEY: 'TMV_ADDONS',
    DEFAULT_MEDIA_PLAYER_KEY: 'TMV_DEFAULT_MEDIA_PLAYER',
    OPENSUBTITLES_API_KEY: 'TMV_OPENSUBTITLES_API_KEY',
    OPENSUBTITLES_USER_AGENT: 'TMV_OPENSUBTITLES_USER_AGENT',
    WATCH_HISTORY_KEY: 'TMV_WATCH_HISTORY_KEY',
    SUBTITLE_LANGUAGES_KEY: 'TMV_SUBTITLE_LANGUAGES_KEY',
    LIBRARY_KEY: 'TMV_LIBRARY_KEY',
    TAMILMV_BASE_URL_KEY: 'TMV_TAMILMV_BASE_URL',
    DOWNLOADS_KEY: 'TMV_DOWNLOADS_KEY'
} as const;

export const storageService = {
    getItem(key: string): string | undefined {
        try {
            return storage.getString(key);
        } catch (error) {
            console.error('Error reading from storage:', error);
            return undefined;
        }
    },

    async getItemAsync(key: string): Promise<string | undefined> {
        const val = this.getItem(key);
        if (val !== undefined) return val;
        try {
            const asyncVal = await AsyncStorage.getItem(key);
            if (asyncVal !== null) {
                try { storage.set(key, asyncVal); } catch {}
                return asyncVal;
            }
        } catch (error) {
            console.error('Error reading from AsyncStorage:', error);
        }
        return undefined;
    },

    setItem(key: string, value: string): void {
        try {
            storage.set(key, value);
        } catch (error) {
            console.error('Error writing to storage:', error);
            throw error;
        }
        AsyncStorage.setItem(key, value).catch(err => {
            console.warn('[StorageService] AsyncStorage.setItem failed for key:', key, err);
        });
    },

    async setItemAsync(key: string, value: string): Promise<void> {
        this.setItem(key, value);
        await AsyncStorage.setItem(key, value);
    },

    removeItem(key: string): void {
        try {
            storage.remove(key);
        } catch (error) {
            console.error('Error removing from storage:', error);
            throw error;
        }
        AsyncStorage.removeItem(key).catch(err => {
            console.warn('[StorageService] AsyncStorage.removeItem failed for key:', key, err);
        });
    },

    async removeItemAsync(key: string): Promise<void> {
        this.removeItem(key);
        await AsyncStorage.removeItem(key);
    },

    clear(): void {
        try {
            storage.clearAll();
            console.log('MMKV cleared successfully');
        } catch (error) {
            console.error('Error clearing MMKV:', error);
            throw error;
        }
    },

    isAvailable(): boolean {
        try {
            // Test if MMKV is available by attempting a simple operation
            storage.set('__test__', 'test');
            storage.remove('__test__');
            return true;
        } catch (error) {
            console.error('Error checking MMKV availability:', error);
            return false;
        }
    },

    // Additional helper methods for working with objects
    getObject<T>(key: string): T | undefined {
        try {
            const value = storage.getString(key);
            return value ? JSON.parse(value) : undefined;
        } catch (error) {
            console.error('Error parsing object from MMKV:', error);
            return undefined;
        }
    },

    setObject(key: string, value: any): void {
        try {
            storage.set(key, JSON.stringify(value));
        } catch (error) {
            console.error('Error setting object to MMKV:', error);
            throw error;
        }
    },

    // Type-specific getters for better type safety
    getBoolean(key: string): boolean | undefined {
        try {
            return storage.getBoolean(key);
        } catch (error) {
            console.error('Error reading boolean from MMKV:', error);
            return undefined;
        }
    },

    setBoolean(key: string, value: boolean): void {
        try {
            storage.set(key, value);
        } catch (error) {
            console.error('Error setting boolean to MMKV:', error);
            throw error;
        }
    },

    getNumber(key: string): number | undefined {
        try {
            return storage.getNumber(key);
        } catch (error) {
            console.error('Error reading number from MMKV:', error);
            return undefined;
        }
    },

    setNumber(key: string, value: number): void {
        try {
            storage.set(key, value);
        } catch (error) {
            console.error('Error setting number to MMKV:', error);
            throw error;
        }
    },

    // Get all keys
    getAllKeys(): string[] {
        try {
            return storage.getAllKeys();
        } catch (error) {
            console.error('Error getting all keys from MMKV:', error);
            return [];
        }
    },

    // Check if running on native MMKV vs fallback
    isNativeMMKV(): boolean {
        return !isUsingFallbackStorage;
    },

    // Check if key exists
    contains(key: string): boolean {
        try {
            return storage.contains(key);
        } catch (error) {
            console.error('Error checking key existence in MMKV:', error);
            return false;
        }
    }
};

// Export the storage instance if direct access is needed
export { storage };
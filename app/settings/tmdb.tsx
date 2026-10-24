import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StorageKeys, storageService } from '@/utils/StorageService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isHapticsSupported, showAlert } from '@/utils/platform';
import * as Haptics from 'expo-haptics';
import BottomSpacing from '@/components/BottomSpacing';
import { router } from 'expo-router';

const DEFAULT_KEY = 'a07e22bc18f5cb106bfe4cc1f83ad8ed';

const TmdbConfigScreen: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [useDefaultKey, setUseDefaultKey] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadSavedConfig();
  }, []);

  const loadSavedConfig = () => {
    setIsLoading(true);
    try {
      const savedApiKey = storageService.getItem(StorageKeys.TMDB_API_KEY);
      if (!savedApiKey) {
        setUseDefaultKey(true);
        setApiKey(DEFAULT_KEY);
      } else {
        setUseDefaultKey(false);
        setApiKey(savedApiKey);
      }
    } catch (e) {
      console.warn('Error loading TMDB config:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      if (useDefaultKey || !apiKey.trim() || apiKey.trim() === DEFAULT_KEY) {
        storageService.removeItem(StorageKeys.TMDB_API_KEY);
        setUseDefaultKey(true);
        setApiKey(DEFAULT_KEY);
        showAlert('Success', 'TMDB configured to use default verified key.');
      } else {
        storageService.setItem(StorageKeys.TMDB_API_KEY, apiKey.trim());
        setUseDefaultKey(false);
        showAlert('Success', 'Custom TMDB API Key saved successfully.');
      }
    } catch {
      showAlert('Error', 'Failed to save TMDB settings.');
    }
  };

  const handleTestConnection = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const keyToTest = apiKey.trim() || DEFAULT_KEY;
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`https://api.themoviedb.org/3/movie/550?api_key=${keyToTest}`);
      if (res.ok) {
        setTestResult('success');
        showAlert('Connected', 'TMDB connection successful! Cast, trailers, and movie info are ready.');
      } else {
        setTestResult('error');
        showAlert('Error', `Invalid API key. Status code: ${res.status}`);
      }
    } catch (err: any) {
      setTestResult('error');
      showAlert('Connection Failed', err?.message || 'Could not reach TMDB server.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.title}>TMDB Integration</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Feature Highlight Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="film" size={24} color="#535aff" />
              <Text style={styles.cardTitle}>The Movie Database (TMDB)</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              Powers movie information, cast & crew with character names, YouTube trailers, recommendations, and cinematic backdrops.
            </Text>
          </View>

          {/* Config Card */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>API KEY</Text>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={(text) => {
                setApiKey(text);
                setUseDefaultKey(false);
              }}
              placeholder="Enter TMDB API Key"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.testBtn, isTesting && styles.disabledBtn]}
                onPress={handleTestConnection}
                disabled={isTesting}
                activeOpacity={0.7}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color="#535aff" />
                ) : (
                  <>
                    <Ionicons
                      name={
                        testResult === 'success'
                          ? 'checkmark-circle'
                          : testResult === 'error'
                          ? 'alert-circle'
                          : 'flash-outline'
                      }
                      size={16}
                      color={testResult === 'success' ? '#00e676' : '#535aff'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.testBtnText}>Test Connection</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => {
                  setApiKey(DEFAULT_KEY);
                  setUseDefaultKey(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.resetBtnText}>Default</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </TouchableOpacity>

          <BottomSpacing space={60} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  keyboardAvoid: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },

  card: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222222',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 12,
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(83, 90, 255, 0.15)',
    borderRadius: 10,
    paddingVertical: 10,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#535aff',
  },
  resetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  disabledBtn: {
    opacity: 0.6,
  },

  saveBtn: {
    backgroundColor: '#535aff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default TmdbConfigScreen;

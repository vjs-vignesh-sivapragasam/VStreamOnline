import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isHapticsSupported, showAlert, confirmAction } from '@/utils/platform';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import BottomSpacing from '@/components/BottomSpacing';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import {
  addonService,
  InstalledAddon,
  POPULAR_ADDONS,
} from '@/services/AddonService';
import { pingEmbeddedServer } from '@/utils/StremioServerManager';

export default function AddonSettingsScreen() {
  const { theme } = useTheme();
  const [manifestUrl, setManifestUrl] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installedAddons, setInstalledAddons] = useState<InstalledAddon[]>([]);
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);

  const loadData = useCallback(() => {
    const raw = addonService.getInstalledAddons();
    const deduped = addonService.deduplicateAddons(raw);
    setInstalledAddons(deduped);
  }, []);

  useEffect(() => {
    loadData();
    const unsub = addonService.subscribe(loadData);
    pingEmbeddedServer().then((online) => setIsServerOnline(online));
    return unsub;
  }, [loadData]);

  const handlePaste = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setManifestUrl(text.trim());
      }
    } catch {}
  };

  const handleInstallCustom = async (urlToInstall?: string) => {
    const targetUrl = (urlToInstall || manifestUrl).trim();
    if (!targetUrl) {
      showAlert('Error', 'Please enter or paste a valid Stremio addon manifest URL.');
      return;
    }

    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsInstalling(true);
    try {
      const installed = await addonService.installAddon(targetUrl);
      setManifestUrl('');
      showAlert(
        'Addon Installed',
        `Successfully installed "${installed.manifest.name}" (v${installed.manifest.version || '1.0.0'}).`
      );
    } catch (err: any) {
      showAlert(
        'Installation Failed',
        err.message || 'Could not fetch or validate the addon manifest. Please check the URL and internet connection.'
      );
    } finally {
      setIsInstalling(false);
    }
  };

  const handleToggle = async (addon: InstalledAddon, val: boolean) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    addonService.toggleAddon(addon.transportUrl, val);
  };

  const handleDelete = async (addon: InstalledAddon) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const confirmed = await confirmAction(
      'Uninstall Addon',
      `Are you sure you want to remove "${addon.manifest.name}"?`,
      'Uninstall'
    );
    if (confirmed) {
      addonService.removeAddon(addon.transportUrl);
    }
  };

  const isAddonInstalled = (manifestUrl: string, presetId?: string) => {
    const clean = addonService.cleanManifestUrl(manifestUrl);
    return installedAddons.some(
      (a) => a.transportUrl === clean || (presetId && a.manifest.id === presetId)
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <BlurGradientBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.iconBg }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Stremio Addons</Text>
          <Text style={styles.headerSubtitle}>
            Catalogs, torrent streams & community extensions
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Engine Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: theme.cardBorder }]}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isServerOnline ? '#30d158' : '#ffd60a' },
              ]}
            />
            <Text style={styles.statusTitle}>Streaming Engine (Port 11470)</Text>
          </View>
          <Text style={styles.statusDescription}>
            {isServerOnline
              ? 'Local torrent streaming engine is active and ready to stream addon media.'
              : 'Streaming engine will start automatically when playback begins.'}
          </Text>
        </View>

        {/* Custom Addon Installer */}
        <View style={[styles.card, { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: theme.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="link-outline" size={20} color={theme.primary} />
            <Text style={styles.cardTitle}>Install Custom Addon</Text>
          </View>
          <Text style={styles.cardDescription}>
            Enter or paste any HTTPS or stremio:// manifest URL to install a community addon.
          </Text>

          <View style={[styles.inputRow, { borderColor: theme.indicator || theme.cardBorder }]}>
            <TextInput
              style={styles.input}
              placeholder="https://.../manifest.json"
              placeholderTextColor="#6E6E73"
              value={manifestUrl}
              onChangeText={setManifestUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.pasteButton} onPress={handlePaste} hitSlop={6}>
              <Ionicons name="clipboard-outline" size={18} color={theme.primary} />
              <Text style={[styles.pasteButtonText, { color: theme.primary }]}>Paste</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.installButton,
              { backgroundColor: theme.primary },
              isInstalling && { opacity: 0.8 },
            ]}
            onPress={() => handleInstallCustom()}
            disabled={isInstalling}
            activeOpacity={0.8}
          >
            {isInstalling ? (
              <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
            ) : (
              <Ionicons name="download-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.installButtonText}>
              {isInstalling ? 'Validating Addon…' : 'Install Addon'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Popular / Recommended Addons */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Featured Addons</Text>
          <Text style={styles.sectionSubtitle}>1-tap install community presets</Text>
        </View>

        <View style={styles.popularGrid}>
          {POPULAR_ADDONS.map((preset) => {
            const installed = isAddonInstalled(preset.manifestUrl, preset.id);
            return (
              <View
                key={preset.id}
                style={[
                  styles.presetCard,
                  { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: theme.cardBorder },
                ]}
              >
                <View style={styles.presetTopRow}>
                  <View style={[styles.presetIconWrap, { backgroundColor: theme.iconBg }]}>
                    <Ionicons name={preset.icon as any} size={22} color={theme.primary} />
                  </View>
                  <View style={styles.presetBadge}>
                    <Text style={[styles.presetBadgeText, { color: theme.primaryLight || theme.primary }]}>
                      {preset.badge}
                    </Text>
                  </View>
                </View>

                <Text style={styles.presetTitle}>{preset.name}</Text>
                <Text style={styles.presetDesc} numberOfLines={2}>
                  {preset.description}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.presetActionBtn,
                    installed
                      ? { backgroundColor: 'rgba(48, 209, 88, 0.12)', borderColor: 'rgba(48, 209, 88, 0.3)' }
                      : { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  onPress={() => {
                    if (!installed) {
                      handleInstallCustom(preset.manifestUrl);
                    }
                  }}
                  disabled={installed}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={installed ? 'checkmark-circle' : 'add-outline'}
                    size={16}
                    color={installed ? '#30d158' : '#ffffff'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.presetActionBtnText,
                      { color: installed ? '#30d158' : '#ffffff' },
                    ]}
                  >
                    {installed ? 'Installed' : 'Install'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Installed Addons List */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            Installed Addons ({installedAddons.length})
          </Text>
          <Text style={styles.sectionSubtitle}>Manage active catalogs & streams</Text>
        </View>

        {installedAddons.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: theme.cardBorder }]}>
            <Ionicons name="cube-outline" size={40} color="#6E6E73" />
            <Text style={styles.emptyTitle}>No Addons Installed</Text>
            <Text style={styles.emptySubtitle}>
              Install Cinemeta or Torrentio above to browse movie catalogs and streams.
            </Text>
          </View>
        ) : (
          installedAddons.map((addon) => {
            const hasCatalogs = addonService.hasResource(addon, 'catalog');
            const hasStreams = addonService.hasResource(addon, 'stream');
            const hasMeta = addonService.hasResource(addon, 'meta');
            const hasSubtitles = addonService.hasResource(addon, 'subtitles');

            return (
              <View
                key={`${addon.manifest.id || addon.transportUrl}`}
                style={[
                  styles.addonItemCard,
                  !addon.enabled && { opacity: 0.6 },
                ]}
              >
                <View style={styles.addonItemHeader}>
                  <View style={styles.addonItemLeft}>
                    <View style={[styles.addonIconBadge, { backgroundColor: hasStreams ? 'rgba(255, 214, 10, 0.12)' : 'rgba(83, 90, 255, 0.15)' }]}>
                      <Ionicons
                        name={hasStreams ? 'flash' : hasCatalogs ? 'film' : 'extension-puzzle'}
                        size={22}
                        color={hasStreams ? '#ffd60a' : theme.primary}
                      />
                    </View>
                    <View style={styles.addonItemTitleWrap}>
                      <View style={styles.addonNameRow}>
                        <Text style={styles.addonItemTitle} numberOfLines={1}>{addon.manifest.name}</Text>
                        <View style={[styles.statusChip, { backgroundColor: addon.enabled ? 'rgba(48, 209, 88, 0.15)' : 'rgba(142, 142, 147, 0.15)' }]}>
                          <View style={[styles.statusDotSmall, { backgroundColor: addon.enabled ? '#30d158' : '#8E8E93' }]} />
                          <Text style={[styles.statusChipText, { color: addon.enabled ? '#30d158' : '#8E8E93' }]}>
                            {addon.enabled ? 'Active' : 'Disabled'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.addonItemVersion}>
                        v{addon.manifest.version || '1.0.0'} • {addon.manifest.id || 'stremio-addon'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.addonItemActions}>
                    <Switch
                      value={addon.enabled}
                      onValueChange={(val) => handleToggle(addon, val)}
                      trackColor={{ false: '#39393d', true: theme.primary }}
                      thumbColor="#ffffff"
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                    />
                    <TouchableOpacity
                      onPress={() => handleDelete(addon)}
                      style={styles.deleteButton}
                      hitSlop={8}
                      accessibilityLabel="Delete Addon"
                    >
                      <Ionicons name="trash-outline" size={17} color="#ff453a" />
                    </TouchableOpacity>
                  </View>
                </View>

                {addon.manifest.description ? (
                  <Text style={styles.addonItemDesc} numberOfLines={2}>
                    {addon.manifest.description}
                  </Text>
                ) : null}

                {/* Capability Badges */}
                <View style={styles.addonBadgesRow}>
                  {hasCatalogs && (
                    <View style={[styles.capabilityBadge, { borderColor: 'rgba(100, 210, 255, 0.3)', backgroundColor: 'rgba(100, 210, 255, 0.1)' }]}>
                      <Ionicons name="film-outline" size={11} color="#64d2ff" style={{ marginRight: 3 }} />
                      <Text style={[styles.capabilityText, { color: '#64d2ff' }]}>Catalogs</Text>
                    </View>
                  )}
                  {hasStreams && (
                    <View style={[styles.capabilityBadge, { borderColor: 'rgba(255, 214, 10, 0.3)', backgroundColor: 'rgba(255, 214, 10, 0.1)' }]}>
                      <Ionicons name="flash-outline" size={11} color="#ffd60a" style={{ marginRight: 3 }} />
                      <Text style={[styles.capabilityText, { color: '#ffd60a' }]}>Streams</Text>
                    </View>
                  )}
                  {hasMeta && (
                    <View style={[styles.capabilityBadge, { borderColor: 'rgba(191, 90, 242, 0.3)', backgroundColor: 'rgba(191, 90, 242, 0.1)' }]}>
                      <Ionicons name="information-circle-outline" size={11} color="#bf5af2" style={{ marginRight: 3 }} />
                      <Text style={[styles.capabilityText, { color: '#bf5af2' }]}>Metadata</Text>
                    </View>
                  )}
                  {hasSubtitles && (
                    <View style={[styles.capabilityBadge, { borderColor: 'rgba(255, 55, 95, 0.3)', backgroundColor: 'rgba(255, 55, 95, 0.1)' }]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={11} color="#ff375f" style={{ marginRight: 3 }} />
                      <Text style={[styles.capabilityText, { color: '#ff375f' }]}>Subtitles</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}

        <BottomSpacing space={60} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  statusBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  statusDescription: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 17,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 8,
  },
  cardDescription: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 14,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    height: 44,
    color: '#ffffff',
    fontSize: 14,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  pasteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  installButton: {
    flexDirection: 'row',
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  installButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  sectionHeaderRow: {
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  popularGrid: {
    marginBottom: 20,
  },
  presetCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  presetTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  presetIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  presetBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  presetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  presetDesc: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
    marginBottom: 12,
  },
  presetActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  addonItemCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(28, 28, 30, 0.75)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  addonItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addonItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  addonIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addonItemTitleWrap: {
    flex: 1,
  },
  addonNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  addonItemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  addonItemVersion: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 3,
  },
  addonItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addonItemDesc: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 18,
    marginTop: 10,
  },
  addonBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 6,
  },
  capabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  capabilityText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

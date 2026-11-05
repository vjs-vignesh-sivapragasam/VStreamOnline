import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  FlatList,
  Modal,
  Platform,
  Share,
  StatusBar,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { useYouTubePlayer, ActiveYouTubeVideo } from '@/contexts/YouTubePlayerContext';
import { youTubeService } from '@/services/YouTubeService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const INJECTED_SHORTS_JS = `
  (function() {
    try {
      var css = 'html, body { margin: 0 !important; padding: 0 !important; background: #000000 !important; overflow: hidden !important; width: 100% !important; height: 100% !important; } ' +
        'video, .html5-main-video { width: 100% !important; height: 100% !important; object-fit: cover !important; position: absolute !important; top: 0 !important; left: 0 !important; } ' +
        '.ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-top, .ytp-gradient-bottom, .ytp-watermark, .ytp-pause-overlay, .ytp-spinner { display: none !important; }';
      var style = document.createElement('style');
      style.type = 'text/css';
      style.appendChild(document.createTextNode(css));
      (document.head || document.documentElement).appendChild(style);

      // Auto un-mute & play
      var v = document.querySelector('video');
      if (v) {
        v.muted = false;
        v.loop = true;
        v.play().catch(function() {});
      }
    } catch(e) {}
  })();
  true;
`;

interface ShortPageProps {
  item: ActiveYouTubeVideo;
  isActive: boolean;
  onClose: () => void;
  insets: any;
  height: number;
}

const ShortPage: React.FC<ShortPageProps> = ({ item, isActive, onClose, insets, height }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.setValue(0);
    }
  }, [isActive]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleToggleLike = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsLiked((prev) => !prev);
    if (isDisliked) setIsDisliked(false);
  };

  const handleToggleDislike = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsDisliked((prev) => !prev);
    if (isLiked) setIsLiked(false);
  };

  const handleToggleSubscribe = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsSubscribed((prev) => !prev);
  };

  const handleShare = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Share.share({
      title: item.title,
      message: `https://youtube.com/shorts/${item.id}`,
    });
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      if (webViewRef.current) {
        if (next) {
          webViewRef.current.injectJavaScript(`
            var v = document.querySelector('video');
            if (v) v.pause();
            true;
          `);
        } else {
          webViewRef.current.injectJavaScript(`
            var v = document.querySelector('video');
            if (v) v.play().catch(function() {});
            true;
          `);
        }
      }
      return next;
    });
  };

  return (
    <View style={[styles.shortPageContainer, { height }]}>
      {/* 1. Fullscreen Video (Active) or High-Res Poster (Inactive) */}
      {isActive ? (
        <WebView
          ref={webViewRef}
          key={`short_web_${item.id}`}
          source={{
            uri: `https://www.youtube.com/embed/${item.id}?autoplay=1&playsinline=1&controls=0&loop=1&rel=0&modestbranding=1&enablejsapi=1`,
          }}
          style={StyleSheet.absoluteFill}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          scrollEnabled={false}
          bounces={false}
          injectedJavaScript={INJECTED_SHORTS_JS}
          userAgent={
            Platform.OS === 'ios'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
          }
        />
      ) : (
        <Image
          source={{ uri: item.thumbnail }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}

      {/* Tap layer to toggle pause / play */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTogglePause}
      />

      {/* Pause indicator icon */}
      {isPaused && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Ionicons name="play" size={54} color="rgba(255, 255, 255, 0.85)" />
        </View>
      )}

      {/* Top subtle vignette */}
      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'transparent']}
        style={[styles.topGradient, { paddingTop: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <View style={styles.topBarRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.shortsHeaderTitle}>Shorts</Text>
          <View style={styles.topRightIcons}>
            <TouchableOpacity style={styles.topRightBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="camera-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topRightBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="search" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Bottom dark vignette */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)']}
        style={[styles.bottomGradient, { paddingBottom: Math.max(insets.bottom, 16) }]}
        pointerEvents="box-none"
      >
        <View style={styles.bottomContentRow} pointerEvents="box-none">
          {/* Bottom Left: Channel Info, Subscribe, Video Title & Audio Pill */}
          <View style={styles.bottomLeftWrap} pointerEvents="box-none">
            {/* Channel Row */}
            <View style={styles.channelRow}>
              <View style={styles.channelAvatar}>
                <Ionicons name="person" size={14} color="#ffffff" />
              </View>
              <Text style={styles.channelName} numberOfLines={1}>
                @{item.channel.replace(/[^a-zA-Z0-9_]/g, '') || 'YouTube'}
              </Text>
              <TouchableOpacity
                style={[styles.subscribeBtn, isSubscribed && styles.subscribeBtnActive]}
                onPress={handleToggleSubscribe}
                activeOpacity={0.8}
              >
                <Text style={[styles.subscribeBtnText, isSubscribed && styles.subscribeBtnTextActive]}>
                  {isSubscribed ? 'Subscribed' : 'Subscribe'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Video Title */}
            <Text style={styles.videoTitle} numberOfLines={2}>
              {item.title}
            </Text>

            {/* Audio Track Pill */}
            <View style={styles.audioPill}>
              <Ionicons name="musical-notes" size={12} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.audioPillText} numberOfLines={1}>
                Original Sound • {item.channel}
              </Text>
            </View>
          </View>

          {/* Right Action Column: Like, Dislike, Comments, Share, Remix, Rotating Disc */}
          <View style={styles.rightActionColumn} pointerEvents="box-none">
            {/* Like Button */}
            <TouchableOpacity style={styles.actionBtn} onPress={handleToggleLike} activeOpacity={0.7}>
              <Ionicons
                name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                size={28}
                color={isLiked ? '#535aff' : '#ffffff'}
              />
              <Text style={styles.actionBtnLabel}>
                {item.views ? item.views.split(' ')[0] : '142K'}
              </Text>
            </TouchableOpacity>

            {/* Dislike Button */}
            <TouchableOpacity style={styles.actionBtn} onPress={handleToggleDislike} activeOpacity={0.7}>
              <Ionicons
                name={isDisliked ? 'thumbs-down' : 'thumbs-down-outline'}
                size={28}
                color={isDisliked ? '#ff3b30' : '#ffffff'}
              />
              <Text style={styles.actionBtnLabel}>Dislike</Text>
            </TouchableOpacity>

            {/* Comments Button */}
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Ionicons name="chatbubble-ellipses-outline" size={26} color="#ffffff" />
              <Text style={styles.actionBtnLabel}>1.2K</Text>
            </TouchableOpacity>

            {/* Share Button */}
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.7}>
              <Ionicons name="arrow-redo-outline" size={26} color="#ffffff" />
              <Text style={styles.actionBtnLabel}>Share</Text>
            </TouchableOpacity>

            {/* Remix Button */}
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Ionicons name="repeat-outline" size={26} color="#ffffff" />
              <Text style={styles.actionBtnLabel}>Remix</Text>
            </TouchableOpacity>

            {/* Rotating Audio Disc */}
            <Animated.View style={[styles.soundDisc, { transform: [{ rotate: spin }] }]}>
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.discThumb} resizeMode="cover" />
              ) : (
                <Ionicons name="disc" size={32} color="#ffffff" />
              )}
            </Animated.View>
          </View>
        </View>

        {/* Slim bottom scrubber line */}
        <View style={styles.bottomScrubber}>
          <View style={[styles.bottomScrubberFill, { width: isActive ? '65%' : '0%' }]} />
        </View>
      </LinearGradient>
    </View>
  );
};

export const YouTubeShortsModal: React.FC = () => {
  const { isShortsVisible, activeShortIndex, shortsList, closeShorts, setActiveShortIndex } = useYouTubePlayer();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [feed, setFeed] = useState<ActiveYouTubeVideo[]>([]);
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT);

  useEffect(() => {
    if (shortsList && shortsList.length > 0) {
      setFeed(shortsList);
    }
  }, [shortsList]);

  // Scroll to selected short when opening
  useEffect(() => {
    if (isShortsVisible && activeShortIndex >= 0 && activeShortIndex < feed.length) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: activeShortIndex, animated: false });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isShortsVisible, activeShortIndex, feed.length]);

  // Load more shorts when approaching end of feed
  const handleLoadMore = useCallback(async () => {
    try {
      const res = await youTubeService.getShortsFeed(5000);
      if (res.videos && res.videos.length > 0) {
        setFeed((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const newVideos = res.videos.filter((v) => !existingIds.has(v.id));
          return [...prev, ...newVideos];
        });
      }
    } catch {}
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const current = viewableItems[0];
      if (current.index !== null && current.index !== undefined) {
        setActiveShortIndex(current.index);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  if (!isShortsVisible) return null;

  return (
    <Modal
      visible={isShortsVisible}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={closeShorts}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View
        style={styles.modalContainer}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - containerHeight) > 5) {
            setContainerHeight(h);
          }
        }}
      >
        <FlatList
          ref={flatListRef}
          data={feed}
          keyExtractor={(item) => `short_swipe_${item.id}`}
          pagingEnabled={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
          snapToInterval={containerHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum={true}
          bounces={false}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          getItemLayout={(_, index) => ({
            length: containerHeight,
            offset: containerHeight * index,
            index,
          })}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 100);
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item, index }) => (
            <ShortPage
              item={item}
              isActive={index === activeShortIndex}
              onClose={closeShorts}
              insets={insets}
              height={containerHeight}
            />
          )}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  shortPageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortsHeaderTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  topRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topRightBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 40,
    paddingHorizontal: 14,
    zIndex: 10,
  },
  bottomContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bottomLeftWrap: {
    flex: 1,
    paddingRight: 16,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  channelAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  channelName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    maxWidth: 160,
  },
  subscribeBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  subscribeBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  subscribeBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  subscribeBtnTextActive: {
    color: '#ffffff',
  },
  videoTitle: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
    marginBottom: 8,
  },
  audioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    maxWidth: 220,
  },
  audioPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '500',
  },
  rightActionColumn: {
    alignItems: 'center',
    gap: 16,
    paddingBottom: 4,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  actionBtnLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  soundDisc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#27272a',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 4,
  },
  discThumb: {
    width: '100%',
    height: '100%',
  },
  bottomScrubber: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1,
    marginTop: 4,
  },
  bottomScrubberFill: {
    height: '100%',
    backgroundColor: '#ff0000',
    borderRadius: 1,
  },
});

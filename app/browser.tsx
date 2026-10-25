import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
  BackHandler,
} from 'react-native';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { isHapticsSupported, showAlert } from '@/utils/platform';
import {
  getTamilMVBaseUrl,
  subscribeTamilMVBaseUrl,
  autoDetectTamilMVDomain,
} from '@/hooks/useTamilMv';
import { MagnetParser } from '@/utils/MagnetParser';
import { downloadService } from '@/services/DownloadService';
import { tmdbService } from '@/services/TmdbService';
import { StreamingServerClient } from '@/clients/stremio';
import { StorageKeys, storageService } from '@/utils/StorageService';

function getActiveStreamingClient(): StreamingServerClient {
  try {
    const raw = storageService.getItem(StorageKeys.SERVERS_KEY);
    if (raw) {
      const servers: any[] = JSON.parse(raw);
      const active = servers.find((s) => s.current);
      if (active?.serverUrl) {
        return new StreamingServerClient(active.serverUrl);
      }
    }
  } catch {}
  return new StreamingServerClient();
}

// ─── Pure JS SHA-1 and Torrent InfoHash Parser ────────────────────────────────
function sha1Bytes(bytes: Uint8Array): string {
  const n = bytes.length;
  const words: number[] = [];
  for (let i = 0; i < n; i++) {
    words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  words[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
  words[(((n + 8) >> 6) + 1) * 16 - 1] = n * 8;

  const w = new Array(80);
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;
  let e = -1009589776;

  for (let i = 0; i < words.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d, olde = e;

    for (let j = 0; j < 80; j++) {
      if (j < 16) w[j] = words[i + j] || 0;
      else {
        const t = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
        w[j] = (t << 1) | (t >>> 31);
      }

      const s = Math.floor(j / 20);
      const f =
        s === 0 ? (b & c) | (~b & d) :
        s === 1 ? b ^ c ^ d :
        s === 2 ? (b & c) | (b & d) | (c & d) :
        b ^ c ^ d;
      const k = [1518500249, 1859775393, -1894007588, -899497514][s];

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    a = (a + olda) | 0;
    b = (b + oldb) | 0;
    c = (c + oldc) | 0;
    d = (d + oldd) | 0;
    e = (e + olde) | 0;
  }

  function hex(num: number) {
    const s = (num >>> 0).toString(16);
    return ('00000000' + s).slice(-8);
  }

  return (hex(a) + hex(b) + hex(c) + hex(d) + hex(e)).toLowerCase();
}

function extractInfoBytesFromBencodedTorrent(arrayBuffer: ArrayBuffer): Uint8Array | null {
  const u8 = new Uint8Array(arrayBuffer);
  let infoStart = -1;
  const marker = [52, 58, 105, 110, 102, 111]; // "4:info" in ASCII

  for (let i = 0; i <= u8.length - marker.length; i++) {
    let match = true;
    for (let j = 0; j < marker.length; j++) {
      if (u8[i + j] !== marker[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      infoStart = i + marker.length;
      break;
    }
  }

  if (infoStart === -1 || u8[infoStart] !== 100) { // 100 is 'd'
    return null;
  }

  let idx = infoStart;

  function parseBencode(): boolean {
    if (idx >= u8.length) return false;
    const char = u8[idx];

    if (char === 105) { // 'i' integer
      idx++;
      while (idx < u8.length && u8[idx] !== 101) idx++;
      idx++;
      return true;
    } else if (char === 108 || char === 100) { // 'l' list or 'd' dict
      idx++;
      while (idx < u8.length && u8[idx] !== 101) {
        parseBencode();
      }
      idx++;
      return true;
    } else if (char >= 48 && char <= 57) { // byte string length
      let lenStr = '';
      while (idx < u8.length && u8[idx] !== 58) {
        lenStr += String.fromCharCode(u8[idx]);
        idx++;
      }
      idx++;
      const strLen = parseInt(lenStr, 10);
      idx += strLen;
      return true;
    }
    return false;
  }

  parseBencode();
  const infoEnd = idx;
  return u8.subarray(infoStart, infoEnd);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/^(?:https?:\/\/)?(?:www\.)?[\w\.-]+\.(?:com|org|net|cz|win|pm|re|to|yt|wf|ws|me|solar|cards|pizza|fi|live)\s*[-_:]\s*/i, '')
    .replace(/^(?:tamilmv|1tamilmv|tamilyogi|isaimini)\s*[-_:]\s*/i, '')
    .trim();
}

function extractQualityTag(title: string): string | null {
  const match = title.match(/\b(2160p|1080p|720p|4K)[^)]*?(WEB-?DL|BluRay|WEBRip|HDTV|x265|x264|HEVC|AVC)?/i);
  if (!match) return null;
  return [match[1], match[2]].filter(Boolean).join(' ');
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

  return { is4K, is1080p, is720p, resolution, fileSize, audio, codec };
}

function extractInfoHashFromMagnet(magnet: string): string {
  const match = magnet.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  return match ? match[1].toLowerCase() : '';
}

// ─── Ad & Popup Blocklist ─────────────────────────────────────────────────────
const AD_DOMAIN_PATTERNS = [
  'monetag.com',
  'propellerads',
  'propeller-tracking',
  'adsterra',
  'exoclick',
  'popads.net',
  'popcash.net',
  'adcash.com',
  'onclickalgo',
  'trafficstars',
  'hilltopads',
  'yllix.com',
  'clickadu',
  'richpush',
  'mgid.com',
  'whomept.com',
  'ouo.io',
  '1xbet',
  'bet365',
  'betway',
  'parimatch',
  'mostbet',
  'melbet',
  'linebet',
  'dafabet',
  'stake.com',
  'batery.bet',
  'batery.in',
  'megapari',
  'lotus365',
  'fairplay',
  'histats.com',
  'statcounter.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adnxs.com',
  'criteo.com',
  'rubiconproject.com',
  '/adserver/',
  '/popunder',
  '/adclick',
  'creative.click',
];

function isAdOrMaliciousUrl(url: string, baseDomain: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();

  for (const pattern of AD_DOMAIN_PATTERNS) {
    if (lower.includes(pattern)) {
      return true;
    }
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    const isTamilMv = host.includes('tamilmv') || host.includes('1tamilmv');
    const isAllowedCdn = host.includes('cloudflare') || host.includes('tmdb.org') || host.includes('youtube.com');

    if (!isTamilMv && !isAllowedCdn) {
      return true;
    }
  } catch {}

  return false;
}

// ─── Injected JavaScript for Immediate Downloads, Adblock & Detection ────────
const INJECTED_ADBLOCK_AND_DETECTION_SCRIPT = `
(function() {
  try {
    // 1. Completely neutralize window.open (kills popups & popunders)
    window.open = function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'POPUP_BLOCKED' }));
      }
      return null;
    };
    Object.defineProperty(window, 'open', {
      value: function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'POPUP_BLOCKED' }));
        }
        return null;
      },
      writable: false,
      configurable: false
    });

    // 2. Pure JS SHA-1, Bencode Parsers & Proximity Release Matcher for Downloads
    function sha1Hex(u8) {
      function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
      var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
      var bitLen = u8.length * 8;
      var padLen = ((u8.length + 8) >>> 6 << 6) + 64;
      var pad = new Uint8Array(padLen);
      pad.set(u8);
      pad[u8.length] = 0x80;
      var dv = new DataView(pad.buffer);
      dv.setUint32(padLen - 4, bitLen, false);

      var w = new Uint32Array(80);
      for (var chunk = 0; chunk < padLen; chunk += 64) {
        for (var i = 0; i < 16; i++) {
          w[i] = dv.getUint32(chunk + i * 4, false);
        }
        for (var j = 16; j < 80; j++) {
          w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
        }
        var a = h0, b = h1, c = h2, d = h3, e = h4;
        for (var k = 0; k < 80; k++) {
          var f = 0, kVal = 0;
          if (k < 20) { f = (b & c) | ((~b) & d); kVal = 0x5a827999; }
          else if (k < 40) { f = b ^ c ^ d; kVal = 0x6ed9eba1; }
          else if (k < 60) { f = (b & c) | (b & d) | (c & d); kVal = 0x8f1bbcdc; }
          else { f = b ^ c ^ d; kVal = 0xca62c1d6; }
          var temp = (rotl(a, 5) + f + e + kVal + w[k]) >>> 0;
          e = d; d = c; c = rotl(b, 30); b = a; a = temp;
        }
        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
      }
      function toHex(n) { return ('00000000' + n.toString(16)).slice(-8); }
      return (toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4)).toLowerCase();
    }
    window.__sha1Hex = sha1Hex;

    function extractInfoBytes(arrayBuffer) {
      var u8 = new Uint8Array(arrayBuffer);
      var marker = [52, 58, 105, 110, 102, 111]; // '4:info'
      var infoStart = -1;
      for (var i = 0; i < u8.length - marker.length; i++) {
        var match = true;
        for (var m = 0; m < marker.length; m++) {
          if (u8[i + m] !== marker[m]) { match = false; break; }
        }
        if (match) { infoStart = i + marker.length; break; }
      }
      if (infoStart === -1 || u8[infoStart] !== 100) return null; // 100 is 'd'
      var idx = infoStart;
      function parseBencode() {
        if (idx >= u8.length) return false;
        var char = u8[idx];
        if (char === 105) { // 'i'
          idx++;
          while (idx < u8.length && u8[idx] !== 101) idx++;
          idx++;
          return true;
        } else if (char === 108 || char === 100) { // 'l' or 'd'
          idx++;
          while (idx < u8.length && u8[idx] !== 101) parseBencode();
          idx++;
          return true;
        } else if (char >= 48 && char <= 57) {
          var lenStr = '';
          while (idx < u8.length && u8[idx] !== 58) {
            lenStr += String.fromCharCode(u8[idx]);
            idx++;
          }
          idx++;
          var strLen = parseInt(lenStr, 10);
          idx += strLen;
          return true;
        }
        return false;
      }
      parseBencode();
      return u8.subarray(infoStart, idx);
    }
    window.__extractInfoBytes = extractInfoBytes;

    function extractMetaFromBencode(arrayBuffer) {
      var u8 = new Uint8Array(arrayBuffer);
      var str = '';
      for (var i = 0; i < Math.min(u8.length, 30000); i++) {
        str += String.fromCharCode(u8[i]);
      }
      var name = '';
      var nameMatch = str.match(/4:name(\\d+):/);
      if (nameMatch) {
        var nLen = parseInt(nameMatch[1], 10);
        var nStart = nameMatch.index + nameMatch[0].length;
        name = str.substr(nStart, nLen);
      }
      var length = 0;
      var lenMatches = str.match(/6:lengthi(\\d+)e/g);
      if (lenMatches) {
        for (var l = 0; l < lenMatches.length; l++) {
          var m = lenMatches[l].match(/6:lengthi(\\d+)e/);
          if (m) {
            var val = parseInt(m[1], 10);
            if (val > length) length = val;
          }
        }
      }
      return { name: name, length: length };
    }
    window.__extractMetaFromBencode = extractMetaFromBencode;

    function findMatchingRelease(target) {
      if (!target) return null;

      function getQuality(s) {
        if (!s) return '';
        var m = s.match(/\\b(2160p|4k|1080p|720p|480p|360p|\\d+(?:\\.\\d+)?\\s*(?:gb|mb))\\b/gi);
        return m ? m.map(function(x) { return x.toLowerCase().replace(/\\s+/g, ''); }).join('|') : '';
      }

      function getDnTitle(magnetUrl) {
        var m = (magnetUrl || '').match(/[?&]dn=([^&]+)/);
        if (m) {
          try {
            return decodeURIComponent(m[1].replace(/\\+/g, ' '));
          } catch(e) {
            return m[1].replace(/\\+/g, ' ');
          }
        }
        return '';
      }

      var targetBlock = target.parentElement;
      var targetText = (target.innerText || '') + ' ' + (target.getAttribute('title') || '');
      var headingEl = targetBlock;
      while (headingEl && headingEl.tagName !== 'P' && headingEl.tagName !== 'DIV' && headingEl !== document.body) {
        headingEl = headingEl.parentElement;
      }
      var surroundingText = (headingEl ? headingEl.innerText : '') + ' ' +
        (headingEl && headingEl.previousElementSibling ? headingEl.previousElementSibling.innerText : '');
      var targetQuality = getQuality(targetText) || getQuality(surroundingText);

      // 1. Immediate parent: check for magnet link inside same block (e.g. same <p>, <div>, <span>, <td>, <li>)
      if (targetBlock && !targetBlock.classList.contains('ipsType_richText') && !targetBlock.classList.contains('ipsComment')) {
        var localMagnets = targetBlock.querySelectorAll('a[href^="magnet:"]');
        for (var lm = 0; lm < localMagnets.length; lm++) {
          var mHref = localMagnets[lm].getAttribute('href') || localMagnets[lm].href;
          return { magnetUrl: mHref, title: getDnTitle(mHref) || localMagnets[lm].innerText.trim() };
        }
      }

      // 2. Immediate siblings of target (next 4, previous 4)
      if (targetBlock) {
        var sibs = Array.prototype.slice.call(targetBlock.children);
        var tIdx = sibs.indexOf(target);
        if (tIdx !== -1) {
          for (var fi = tIdx + 1; fi < Math.min(sibs.length, tIdx + 5); fi++) {
            if (sibs[fi].tagName === 'A' && (sibs[fi].getAttribute('href') || '').startsWith('magnet:')) {
              var fHref = sibs[fi].getAttribute('href') || sibs[fi].href;
              return { magnetUrl: fHref, title: getDnTitle(fHref) || sibs[fi].innerText.trim() };
            }
            var fSub = sibs[fi].querySelector && sibs[fi].querySelector('a[href^="magnet:"]');
            if (fSub) {
              var fsHref = fSub.getAttribute('href') || fSub.href;
              return { magnetUrl: fsHref, title: getDnTitle(fsHref) || fSub.innerText.trim() };
            }
          }
          for (var bi = tIdx - 1; bi >= Math.max(0, tIdx - 4); bi--) {
            if (sibs[bi].tagName === 'A' && (sibs[bi].getAttribute('href') || '').startsWith('magnet:')) {
              var bHref = sibs[bi].getAttribute('href') || sibs[bi].href;
              return { magnetUrl: bHref, title: getDnTitle(bHref) || sibs[bi].innerText.trim() };
            }
            var bSub = sibs[bi].querySelector && sibs[bi].querySelector('a[href^="magnet:"]');
            if (bSub) {
              var bsHref = bSub.getAttribute('href') || bSub.href;
              return { magnetUrl: bsHref, title: getDnTitle(bsHref) || bSub.innerText.trim() };
            }
          }
        }
      }

      // 3. Parent's block siblings (e.g. target is in <p class="torrent"> and magnet is in <p class="magnet">)
      if (headingEl && headingEl.parentElement && !headingEl.parentElement.classList.contains('ipsComment')) {
        var pSibs = Array.prototype.slice.call(headingEl.parentElement.children);
        var pIdx = pSibs.indexOf(headingEl);
        if (pIdx !== -1) {
          for (var pfi = pIdx + 1; pfi < Math.min(pSibs.length, pIdx + 4); pfi++) {
            var mNext = pSibs[pfi].querySelector && pSibs[pfi].querySelector('a[href^="magnet:"]');
            if (mNext) {
              var mnHref = mNext.getAttribute('href') || mNext.href;
              return { magnetUrl: mnHref, title: getDnTitle(mnHref) || mNext.innerText.trim() };
            }
          }
          for (var pbi = pIdx - 1; pbi >= Math.max(0, pIdx - 4); pbi--) {
            var mPrev = pSibs[pbi].querySelector && pSibs[pbi].querySelector('a[href^="magnet:"]');
            if (mPrev) {
              var mpHref = mPrev.getAttribute('href') || mPrev.href;
              return { magnetUrl: mpHref, title: getDnTitle(mpHref) || mPrev.innerText.trim() };
            }
          }
        }
      }

      // 4. Sequential index matching in the post
      var post = target.closest('.ipsType_richText, .ipsComment') || document.body;
      var allTorrents = Array.prototype.slice.call(post.querySelectorAll('a[href*="attachment.php"], a[href*=".torrent"], .ipsAttachLink'));
      var allMagnets = Array.prototype.slice.call(post.querySelectorAll('a[href^="magnet:"]'));

      var posIndex = allTorrents.indexOf(target);
      if (posIndex !== -1 && allMagnets[posIndex]) {
        var imHref = allMagnets[posIndex].getAttribute('href') || allMagnets[posIndex].href;
        var imTitle = getDnTitle(imHref);
        var imQuality = getQuality(imTitle);
        if (!targetQuality || !imQuality || targetQuality === imQuality || imQuality.includes(targetQuality)) {
          return { magnetUrl: imHref, title: imTitle || allMagnets[posIndex].innerText.trim() };
        }
      }

      // 5. Nearest by visual vertical offset (pixels)
      if (allMagnets.length > 0) {
        var tRect = target.getBoundingClientRect();
        var bestMagnet = null;
        var bestDist = Infinity;
        for (var mi = 0; mi < allMagnets.length; mi++) {
          var mag = allMagnets[mi];
          var mRect = mag.getBoundingClientRect();
          var dist = Math.abs(mRect.top - tRect.top);
          var mUrl = mag.getAttribute('href') || mag.href;
          var mTitle = getDnTitle(mUrl);
          var mQ = getQuality(mTitle);
          if (targetQuality && mQ && (targetQuality === mQ || mQ.includes(targetQuality))) {
            dist -= 1000;
          }
          if (dist < bestDist) {
            bestDist = dist;
            bestMagnet = mag;
          }
        }
        if (bestMagnet) {
          var bmHref = bestMagnet.getAttribute('href') || bestMagnet.href;
          return { magnetUrl: bmHref, title: getDnTitle(bmHref) || bestMagnet.innerText.trim() };
        }
      }

      return null;
    }
    window.__findMatchingRelease = findMatchingRelease;

    function findPagePoster() {
      var ipsImg = document.querySelector('.ipsType_richText img.ipsImage, div.ipsComment_content img.ipsImage, img.ipsImage');
      if (ipsImg && ipsImg.src && !ipsImg.src.includes('avatar') && !ipsImg.src.includes('emoticon')) {
        return ipsImg.src;
      }
      var allImgs = document.querySelectorAll('.ipsType_richText img, div.ipsComment_content img, article img');
      for (var i = 0; i < allImgs.length; i++) {
        var src = allImgs[i].src || '';
        if (src && !src.includes('avatar') && !src.includes('emoticon') && !src.includes('theme') && !src.includes('svg') && !src.includes('reactions') && !src.includes('advert')) {
          return src;
        }
      }
      return '';
    }
    window.__findPagePoster = findPagePoster;

    // 3. Intercept click hijackers, magnet links, and .torrent file buttons
    document.addEventListener('click', function(e) {
      var target = e.target;
      while (target && target.tagName !== 'A') {
        target = target.parentElement;
      }
      if (target && target.tagName === 'A') {
        var href = target.getAttribute('href') || target.href;
        var text = (target.innerText || target.getAttribute('title') || '').trim();

        if (href) {
          // A. Direct magnet link click -> trigger immediate download
          if (href.startsWith('magnet:')) {
            e.preventDefault();
            e.stopPropagation();
            var dnMatch = href.match(/[?&]dn=([^&]+)/);
            var releaseTitle = '';
            if (dnMatch) {
              try { releaseTitle = decodeURIComponent(dnMatch[1].replace(/\\+/g, ' ')); } catch(err) { releaseTitle = dnMatch[1].replace(/\\+/g, ' '); }
            }
            var title = releaseTitle || text || document.title;
            var pagePoster = findPagePoster();
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'START_IMMEDIATE_DOWNLOAD',
              magnetUrl: href,
              title: title.trim(),
              poster: pagePoster
            }));
            return false;
          }

          // B. .torrent file link or button click -> trigger immediate download
          var isTorrentFile =
            /\\.torrent\\b/i.test(href) ||
            /attachment\\.php\\?id=\\d+/i.test(href) ||
            /attach_id=\\d+/i.test(href) ||
            /\\.torrent\\b/i.test(text) ||
            /download\\s*\\.torrent/i.test(text) ||
            target.classList.contains('ipsAttachLink');

          if (isTorrentFile) {
            e.preventDefault();
            e.stopPropagation();

            var matching = findMatchingRelease(target);
            var candidateTitle = (matching && matching.title) || text || document.title;
            var pagePoster = findPagePoster();

            // 1. If matching release magnet is found, start download immediately with that exact release!
            if (matching && matching.magnetUrl) {
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'START_IMMEDIATE_DOWNLOAD',
                magnetUrl: matching.magnetUrl,
                title: candidateTitle.trim(),
                poster: pagePoster
              }));
            }

            // 2. Also fetch .torrent file inside the WebView context (shares session & Cloudflare cookies)
            try {
              var xhr = new XMLHttpRequest();
              xhr.open('GET', href, true);
              xhr.responseType = 'arraybuffer';
              xhr.timeout = 10000;
              xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 400 && xhr.response) {
                  var infoBytes = extractInfoBytes(xhr.response);
                  if (infoBytes) {
                    var hash = sha1Hex(infoBytes);
                    var meta = extractMetaFromBencode(xhr.response);
                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: matching ? 'TORRENT_METADATA_RESOLVED' : 'START_IMMEDIATE_DOWNLOAD',
                      infoHash: hash,
                      title: (meta.name || candidateTitle).trim(),
                      fileLength: meta.length || 0,
                      fileName: meta.name || '',
                      poster: pagePoster
                    }));
                  }
                }
              };
              xhr.send();
            } catch (err) {}

            return false;
          }

          if (target.getAttribute('target') === '_blank') {
            target.removeAttribute('target');
          }
        }
      }
    }, true);

    // 3. Inject CSS to hide banners, floating sponsor footers & ad slots
    var style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = \`
      iframe[src*="ad"], iframe[id*="ad"], div[id*="ad-"], div[class*="ad-"],
      .popunder, .ad-banner, .advertisement, div[id*="google_ads"],
      a[href*="1xbet"], a[href*="bet365"], a[href*="parimatch"], a[href*="batery"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    \`;
    document.head.appendChild(style);

    // 4. Scan page for streams & magnet links
    function scanPageForStreams() {
      try {
        var magnetLinks = document.querySelectorAll('a[href^="magnet:"]');
        var streams = [];
        for (var i = 0; i < magnetLinks.length; i++) {
          var a = magnetLinks[i];
          var href = a.getAttribute('href') || a.href;
          var dnMatch = href.match(/[?&]dn=([^&]+)/);
          var dnTitle = '';
          if (dnMatch) {
            try { dnTitle = decodeURIComponent(dnMatch[1].replace(/\\+/g, ' ')); } catch(err) { dnTitle = dnMatch[1].replace(/\\+/g, ' '); }
          }
          var title = dnTitle || a.innerText || a.getAttribute('title') || '';
          if (!title || title.length < 5) {
            var parent = a.closest('p, div, li');
            if (parent) title = parent.innerText;
          }
          streams.push({
            magnetUrl: href,
            title: (title || document.title).trim()
          });
        }

        var videoTags = document.querySelectorAll('video, source');
        var directVideos = [];
        for (var j = 0; j < videoTags.length; j++) {
          var v = videoTags[j];
          var src = v.getAttribute('src') || v.src;
          if (src && (src.includes('.mp4') || src.includes('.m3u8') || src.includes('.mkv'))) {
            directVideos.push(src);
          }
        }

        if (streams.length > 0 || directVideos.length > 0) {
          var pagePoster = findPagePoster();
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PAGE_STREAMS_FOUND',
            magnets: streams,
            directVideos: directVideos,
            pageTitle: document.title,
            poster: pagePoster,
            url: window.location.href
          }));
        }
      } catch (err) {}
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      scanPageForStreams();
    } else {
      document.addEventListener('DOMContentLoaded', scanPageForStreams);
    }
    window.addEventListener('load', scanPageForStreams);
    setTimeout(scanPageForStreams, 1500);
    setTimeout(scanPageForStreams, 3500);
  } catch (e) {}
})();
true;
`;

export default function BrowserScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView | null>(null);

  const [baseUrl, setBaseUrl] = useState<string>(() => getTamilMVBaseUrl());
  const [currentUrl, setCurrentUrl] = useState<string>(() => getTamilMVBaseUrl());
  const [addressBarInput, setAddressBarInput] = useState<string>('');
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [pageTitle, setPageTitle] = useState<string>('Web View');
  const [blockedAdCount, setBlockedAdCount] = useState<number>(0);

  // Detected streams on current page
  const [detectedMagnets, setDetectedMagnets] = useState<Array<{ magnetUrl: string; title: string; infoHash: string }>>([]);
  const [detectedVideos, setDetectedVideos] = useState<string[]>([]);
  const [detectedPageUrl, setDetectedPageUrl] = useState<string>('');
  const [pagePoster, setPagePoster] = useState<string>('');

  // Modals & Bottom Sheets
  const [qualityPickerVisible, setQualityPickerVisible] = useState<boolean>(false);

  // Instant Download Toast State
  const [downloadToastVisible, setDownloadToastVisible] = useState<boolean>(false);
  const [downloadToastTitle, setDownloadToastTitle] = useState<string>('');
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Error & Domain Recovery
  const [hasLoadError, setHasLoadError] = useState<boolean>(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState<boolean>(false);
  const [autoDetectStatus, setAutoDetectStatus] = useState<string>('');

  const triggerHaptic = useCallback(async (type: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(type);
    }
  }, []);

  // Subscribe to base URL updates (e.g. when configured in Settings)
  useEffect(() => {
    const unsub = subscribeTamilMVBaseUrl((newUrl) => {
      setBaseUrl(newUrl);
      setCurrentUrl(newUrl);
    });
    return unsub;
  }, []);

  // Hardware Back Button handling on Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backAction = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      router.back();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [canGoBack]);

  const showDownloadToast = (title: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setDownloadToastTitle(title);
    setDownloadToastVisible(true);
    toastTimeoutRef.current = setTimeout(() => {
      setDownloadToastVisible(false);
    }, 4500);
  };

  // ── Browser Navigation Handlers ──
  const handleGoBack = () => {
    triggerHaptic();
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    triggerHaptic();
    if (canGoForward && webViewRef.current) {
      webViewRef.current.goForward();
    }
  };

  const handleReload = () => {
    triggerHaptic();
    setHasLoadError(false);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleGoHome = () => {
    triggerHaptic();
    setHasLoadError(false);
    setCurrentUrl(baseUrl);
    setAddressBarInput('');
  };

  const handleSearchSubmit = () => {
    triggerHaptic();
    const query = addressBarInput.trim();
    if (!query) return;

    setHasLoadError(false);

    if (query.startsWith('http://') || query.startsWith('https://')) {
      setCurrentUrl(query);
      return;
    }

    const searchUrl = `${baseUrl}/index.php?/search/&q=${encodeURIComponent(query)}&type=forums_topic&search_and_or=or&sortby=relevancy`;
    setCurrentUrl(searchUrl);
  };

  // ── Auto-Detect Working Domain (when site is unreachable/blocked) ──
  const handleAutoDetectWorkingDomain = async () => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setIsAutoDetecting(true);
    setAutoDetectStatus('Searching Google in background for active TamilMV domain...');

    try {
      const working = await autoDetectTamilMVDomain((status) => {
        setAutoDetectStatus(status);
      });

      if (working) {
        setBaseUrl(working);
        setCurrentUrl(working);
        setHasLoadError(false);
        showAlert(
          'Domain Auto-Configured',
          `Successfully recovered and configured active domain:\n\n${working}\n\nReloading browser.`
        );
      } else {
        showAlert(
          'Auto-Detect Failed',
          'Could not find a working domain from Google search. Please verify your internet connection or check Settings.'
        );
      }
    } catch (e: any) {
      showAlert('Auto-Detect Error', e?.message || 'Failed to detect active domain');
    } finally {
      setIsAutoDetecting(false);
      setAutoDetectStatus('');
    }
  };

  // ── Start Immediate Download (Magnet & Torrent Files) ──
  const startImmediateDownload = async (params: {
    magnetUrl?: string;
    infoHash?: string;
    title?: string;
    poster?: string;
    fileLength?: number;
    fileName?: string;
  }) => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    let infoHash = params.infoHash;
    if (!infoHash && params.magnetUrl) {
      infoHash = extractInfoHashFromMagnet(params.magnetUrl);
    }

    if (!infoHash) {
      showAlert('Download Error', 'Could not extract valid torrent infoHash for download.');
      return;
    }

    let displayTitle = params.title;
    if (params.magnetUrl) {
      const dn = MagnetParser.extractDisplayName(params.magnetUrl);
      if (dn) displayTitle = dn;
    }

    const clean = cleanTitle(displayTitle || pageTitle || 'Movie Download');
    const finalFileName = params.fileName || `${clean}.mp4`;
    const initialPoster = params.poster || pagePoster || '';

    try {
      const client = getActiveStreamingClient();
      const streamUrl = await client.getStreamingURL(infoHash, 0);

      // 1. Start download immediately in downloadService (persisted & broadcasting)
      await downloadService.startDownload({
        infoHash,
        fileIdx: 0,
        title: clean,
        poster: initialPoster,
        fileName: finalFileName,
        streamUrl,
        fileLength: params.fileLength,
      });

      // 2. Background poster resolution from TMDB (fetches official HD movie poster)
      tmdbService.getMovieFullInfo(clean)
        .then((tmdb) => {
          if (tmdb?.posterUrl) {
            downloadService.updateItemPoster(infoHash, tmdb.posterUrl);
          }
        })
        .catch(() => {});

      // 3. Background file metadata resolution (pick largest video file)
      client.getTorrentFiles(infoHash, 4000)
        .then((files) => {
          if (files && files.length > 0) {
            const mainFile = files.reduce((prev, curr) => (curr.length > prev.length ? curr : prev), files[0]);
            downloadService.updateItemMetadata(infoHash, mainFile.id ?? 0, mainFile.name, mainFile.length);
          }
        })
        .catch(() => {});

      // 4. Immediately show notification banner with "View in Library" button
      showDownloadToast(clean);
    } catch (err: any) {
      console.warn('[Browser] Download start failed:', err);
      showAlert('Download Failed', err?.message || 'Could not start download');
    }
  };

  // ── Handle .torrent File Download Interception ──
  const handleTorrentFileDownload = async (torrentUrl: string, title?: string) => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    const clean = cleanTitle(title || pageTitle || 'Movie Download');

    // Check if the URL contains a 40-character hex infoHash
    const hashMatch = torrentUrl.match(/\b([a-fA-F0-9]{40})\b/i);
    if (hashMatch) {
      await startImmediateDownload({
        infoHash: hashMatch[1].toLowerCase(),
        title: clean,
      });
      return;
    }

    // Execute in-page fetch via WebView to ensure Cloudflare clearance & cookies are used
    if (webViewRef.current) {
      showDownloadToast(clean);
      const injectedCode = `
        (function() {
          try {
            var url = ${JSON.stringify(torrentUrl)};
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.timeout = 10000;
            xhr.onload = function() {
              if (xhr.status >= 200 && xhr.status < 400 && xhr.response) {
                var infoBytes = window.__extractInfoBytes ? window.__extractInfoBytes(xhr.response) : null;
                if (infoBytes) {
                  var hash = window.__sha1Hex ? window.__sha1Hex(infoBytes) : '';
                  var meta = window.__extractMetaFromBencode ? window.__extractMetaFromBencode(xhr.response) : { name: '', length: 0 };
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'START_IMMEDIATE_DOWNLOAD',
                    infoHash: hash,
                    title: (meta.name || ${JSON.stringify(clean)}).trim(),
                    fileLength: meta.length || 0,
                    fileName: meta.name || ''
                  }));
                }
              }
            };
            xhr.send();
          } catch (e) {}
        })();
        true;
      `;
      webViewRef.current.injectJavaScript(injectedCode);
    }
  };

  // ── Playback Execution ──
  const handlePlayMagnet = (magnet: { magnetUrl: string; title: string; infoHash: string }) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setQualityPickerVisible(false);

    const clean = cleanTitle(magnet.title);
    const streams = JSON.stringify([
      {
        name: clean,
        title: clean,
        infoHash: magnet.infoHash,
        fileIdx: 0,
      },
    ]);

    router.push({
      pathname: '/stream/player',
      params: {
        streams,
        selectedStreamIndex: '0',
        title: clean,
        poster: pagePoster || '',
      },
    });
  };

  const handlePlayDirectVideo = (videoUrl: string) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/stream/player' as any,
      params: {
        videoUrl,
        title: cleanTitle(pageTitle),
        poster: pagePoster || '',
      },
    });
  };

  const handleOpenMovieDetails = (topicUrl: string, title?: string) => {
    triggerHaptic();
    router.push({
      pathname: '/torrent/details',
      params: {
        title: cleanTitle(title || pageTitle),
        poster: pagePoster || '',
        topicUrl: topicUrl || currentUrl,
      },
    });
  };

  // ── WebView Message & Navigation Interception ──
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'POPUP_BLOCKED') {
        setBlockedAdCount((c) => c + 1);
      } else if (data.type === 'START_IMMEDIATE_DOWNLOAD') {
        // Direct click on magnet or parsed .torrent file -> START DOWNLOAD IMMEDIATELY!
        startImmediateDownload({
          magnetUrl: data.magnetUrl,
          infoHash: data.infoHash,
          title: cleanTitle(data.title || pageTitle),
          poster: data.poster || pagePoster || '',
          fileLength: data.fileLength,
          fileName: data.fileName,
        });
      } else if (data.type === 'TORRENT_METADATA_RESOLVED') {
        // When in-page .torrent file parsing finishes, update exact metadata (e.g. 500MB fileLength)
        if (data.infoHash) {
          downloadService.updateItemMetadata(
            data.infoHash,
            0,
            data.fileName,
            data.fileLength,
            data.poster || pagePoster || ''
          );
        }
      } else if (data.type === 'TORRENT_FILE_CLICK') {
        // Fallback for .torrent file button click
        if (data.magnetUrl) {
          startImmediateDownload({
            magnetUrl: data.magnetUrl,
            title: cleanTitle(data.title || pageTitle),
            poster: data.poster || pagePoster || '',
          });
        } else if (data.url) {
          handleTorrentFileDownload(data.url, cleanTitle(data.title || pageTitle));
        }
      } else if (data.type === 'PAGE_STREAMS_FOUND') {
        if (data.poster) {
          setPagePoster(data.poster);
        }
        const parsedMagnets = (data.magnets || []).map((m: any) => ({
          magnetUrl: m.magnetUrl,
          title: cleanTitle(m.title),
          infoHash: extractInfoHashFromMagnet(m.magnetUrl),
        })).filter((m: any) => m.infoHash.length > 0);

        setDetectedMagnets(parsedMagnets);
        setDetectedVideos(data.directVideos || []);
        setDetectedPageUrl(data.url || currentUrl);
      }
    } catch {}
  };

  const handleShouldStartLoadWithRequest = (request: any): boolean => {
    const url = request.url || '';

    // 1. Intercept magnet links -> START DOWNLOAD IMMEDIATELY!
    if (url.startsWith('magnet:')) {
      startImmediateDownload({
        magnetUrl: url,
        title: cleanTitle(pageTitle),
      });
      return false;
    }

    // 2. Intercept .torrent file download requests -> START DOWNLOAD IMMEDIATELY!
    if (
      url.endsWith('.torrent') ||
      url.includes('.torrent?') ||
      url.includes('attachment.php?id=') ||
      url.includes('attach_id=')
    ) {
      handleTorrentFileDownload(url, cleanTitle(pageTitle));
      return false;
    }

    // 3. Intercept ad networks, popups, and betting redirects
    if (isAdOrMaliciousUrl(url, baseUrl)) {
      setBlockedAdCount((c) => c + 1);
      return false;
    }

    return true;
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setCurrentUrl(navState.url);
    if (navState.title) {
      setPageTitle(navState.title);
    }

    if (navState.url !== detectedPageUrl) {
      setDetectedMagnets([]);
      setDetectedVideos([]);
    }
  };

  const isMovieTopic = currentUrl.includes('/forums/topic/') || detectedMagnets.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* ── Top Browser Navigation Bar ── */}
      <View style={styles.topBar}>
        <View style={styles.navControlsRow}>
          {/* Back to App / Close Web View */}
          <TouchableOpacity
            style={styles.backToAppBtn}
            onPress={() => {
              triggerHaptic();
              router.back();
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Back Button */}
          <TouchableOpacity
            style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]}
            onPress={handleGoBack}
            disabled={!canGoBack}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={canGoBack ? '#ffffff' : '#48484a'} />
          </TouchableOpacity>

          {/* Forward Button */}
          <TouchableOpacity
            style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]}
            onPress={handleGoForward}
            disabled={!canGoForward}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-forward" size={20} color={canGoForward ? '#ffffff' : '#48484a'} />
          </TouchableOpacity>

          {/* Reload / Refresh Button */}
          <TouchableOpacity style={styles.navBtn} onPress={handleReload} activeOpacity={0.7}>
            <Ionicons name="reload" size={18} color="#ffffff" />
          </TouchableOpacity>

          {/* Home Button */}
          <TouchableOpacity style={styles.navBtn} onPress={handleGoHome} activeOpacity={0.7}>
            <Ionicons name="home-outline" size={19} color="#535aff" />
          </TouchableOpacity>

          {/* Search / Address Bar */}
          <View style={styles.addressBar}>
            <Ionicons name="search" size={15} color="#8E8E93" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.addressInput}
              value={addressBarInput}
              onChangeText={setAddressBarInput}
              onSubmitEditing={handleSearchSubmit}
              placeholder={pageTitle ? cleanTitle(pageTitle) : 'Search movie or URL...'}
              placeholderTextColor="#666666"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {addressBarInput.length > 0 && (
              <TouchableOpacity onPress={() => setAddressBarInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color="#666666" />
              </TouchableOpacity>
            )}
          </View>

          {/* AdBlock Shield Pill */}
          <TouchableOpacity
            style={styles.shieldBadge}
            onPress={() => {
              triggerHaptic();
              showAlert(
                'Ad & Popup Shield Active',
                `NetFlix built-in shield has prevented ${blockedAdCount} unwanted advertising popups, click-jackers, and tracker scripts during this session.`
              );
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="shield-checkmark" size={15} color="#00e676" />
            <Text style={styles.shieldBadgeText}>{blockedAdCount}</Text>
          </TouchableOpacity>
        </View>

        {/* Loading Progress Bar */}
        {isLoading && (
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${Math.max(loadProgress * 100, 15)}%` }]} />
          </View>
        )}
      </View>

      {/* ── Main Browser View or Error Fallback ── */}
      {hasLoadError ? (
        <View style={styles.errorContainer}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color="#ff453a" />
          </View>
          <Text style={styles.errorTitle}>Domain Unreachable</Text>
          <Text style={styles.errorDescription}>
            The configured TamilMV domain may have rotated or is currently blocked by your network/ISP.
          </Text>

          {isAutoDetecting ? (
            <View style={styles.autoDetectingBox}>
              <ActivityIndicator size="small" color="#535aff" style={{ marginRight: 10 }} />
              <Text style={styles.autoDetectingText}>{autoDetectStatus || 'Discovering live domain...'}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.autoDetectBtn}
              onPress={handleAutoDetectWorkingDomain}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.autoDetectBtnText}>Auto-Detect Working Domain</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.retryBtn} onPress={handleReload} activeOpacity={0.7}>
            <Ionicons name="refresh" size={16} color="#8E8E93" style={{ marginRight: 6 }} />
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.webViewWrap}>
          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            style={styles.webView}
            injectedJavaScriptBeforeContentLoaded={INJECTED_ADBLOCK_AND_DETECTION_SCRIPT}
            injectedJavaScript={INJECTED_ADBLOCK_AND_DETECTION_SCRIPT}
            onMessage={handleWebViewMessage}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onNavigationStateChange={handleNavigationStateChange}
            onLoadStart={() => {
              setIsLoading(true);
              setLoadProgress(0.2);
            }}
            onLoadProgress={({ nativeEvent }) => setLoadProgress(nativeEvent.progress)}
            onLoadEnd={() => {
              setIsLoading(false);
              setLoadProgress(1);
            }}
            onError={(e) => {
              setIsLoading(false);
              setHasLoadError(true);
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowsBackForwardNavigationGestures={true}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            mediaPlaybackRequiresUserAction={false}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#535aff" />
                <Text style={styles.loadingText}>Loading Web View...</Text>
              </View>
            )}
          />
        </View>
      )}

      {/* ── Detected Streams Floating Bar (Active on Movie Topics) ── */}
      {isMovieTopic && (detectedMagnets.length > 0 || detectedVideos.length > 0) && (
        <View style={[styles.floatingStreamBar, { bottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.floatingStreamLeft}>
            <View style={styles.streamActiveBadge}>
              <Ionicons name="videocam" size={14} color="#00e676" />
              <Text style={styles.streamActiveBadgeText}>
                {detectedMagnets.length} {detectedMagnets.length === 1 ? 'quality' : 'qualities'}
              </Text>
            </View>
            <Text style={styles.floatingStreamTitle} numberOfLines={1}>
              {cleanTitle(pageTitle)}
            </Text>
          </View>

          <View style={styles.floatingStreamActions}>
            {/* Play Button */}
            <TouchableOpacity
              style={styles.floatingWatchBtn}
              onPress={() => {
                triggerHaptic();
                if (detectedMagnets.length > 1) {
                  setQualityPickerVisible(true);
                } else if (detectedMagnets.length === 1) {
                  handlePlayMagnet(detectedMagnets[0]);
                } else if (detectedVideos.length > 0) {
                  handlePlayDirectVideo(detectedVideos[0]);
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={14} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.floatingWatchBtnText}>Play</Text>
            </TouchableOpacity>

            {/* Download Button -> Starts Download Immediately! */}
            <TouchableOpacity
              style={styles.floatingDownloadBtn}
              onPress={() => {
                triggerHaptic();
                if (detectedMagnets.length > 1) {
                  setQualityPickerVisible(true);
                } else if (detectedMagnets.length === 1) {
                  startImmediateDownload(detectedMagnets[0]);
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-down" size={14} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.floatingDownloadBtnText}>Download</Text>
            </TouchableOpacity>

            {/* Movie Details Button */}
            <TouchableOpacity
              style={styles.floatingDetailsBtn}
              onPress={() => handleOpenMovieDetails(detectedPageUrl || currentUrl, pageTitle)}
              activeOpacity={0.8}
            >
              <Ionicons name="information-circle-outline" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Choose Quality Modal (When user taps Play on multiple stream options) ── */}
      <Modal
        visible={qualityPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setQualityPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setQualityPickerVisible(false)}
        >
          <View style={[styles.modalSheet, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <View style={styles.qualityModalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Choose Stream Quality</Text>
                <Text style={styles.modalSubtitle}>
                  {detectedMagnets.length} stream qualities detected on this page
                </Text>
              </View>
              <TouchableOpacity onPress={() => setQualityPickerVisible(false)}>
                <Ionicons name="close-circle" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={detectedMagnets}
              keyExtractor={(item, index) => `${item.infoHash}-${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 10 }}
              renderItem={({ item }) => {
                const clean = cleanTitle(item.title);
                const qualityTag = extractQualityTag(clean);
                const meta = parseQualityMeta(clean);

                return (
                  <TouchableOpacity
                    style={styles.qualityOptionCard}
                    onPress={() => handlePlayMagnet(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.qualityPillBadge,
                      meta.is4K && styles.qualityPillBadge4K,
                      meta.is1080p && styles.qualityPillBadge1080p,
                      meta.is720p && styles.qualityPillBadge720p,
                    ]}>
                      <Text style={[
                        styles.qualityPillText,
                        meta.is4K && styles.qualityPillText4K,
                        meta.is1080p && styles.qualityPillText1080p,
                        meta.is720p && styles.qualityPillText720p,
                      ]}>
                        {meta.resolution || qualityTag || 'HD'}
                      </Text>
                    </View>

                    <View style={styles.qualityOptionBody}>
                      <Text style={styles.qualityOptionTitle} numberOfLines={2}>
                        {clean}
                      </Text>
                      <View style={styles.qualityMetaChipsRow}>
                        {meta.fileSize && (
                          <View style={styles.metaChip}>
                            <Ionicons name="folder-outline" size={10} color="#8E8E93" />
                            <Text style={styles.metaChipText}>{meta.fileSize}</Text>
                          </View>
                        )}
                        {meta.audio && (
                          <View style={styles.metaChip}>
                            <Ionicons name="volume-medium-outline" size={10} color="#8E8E93" />
                            <Text style={styles.metaChipText}>{meta.audio}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.qualityActionButtons}>
                      <TouchableOpacity
                        style={styles.qualityDownloadSmallBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          setQualityPickerVisible(false);
                          startImmediateDownload(item);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="arrow-down-circle" size={24} color="#00e676" />
                      </TouchableOpacity>

                      <View style={styles.qualityPlayBtnSmall}>
                        <Ionicons name="play" size={12} color="#ffffff" />
                        <Text style={styles.qualityPlayBtnSmallText}>Play</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Immediate Download Toast Banner ── */}
      {downloadToastVisible && (
        <View style={[styles.downloadToast, { bottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.downloadToastIconWrap}>
            <Ionicons name="arrow-down-circle" size={24} color="#00e676" />
          </View>
          <View style={styles.downloadToastTextWrap}>
            <Text style={styles.downloadToastTitle}>Download Started Immediately</Text>
            <Text style={styles.downloadToastSubtitle} numberOfLines={1}>
              {downloadToastTitle}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.downloadToastLibraryBtn}
            onPress={() => {
              triggerHaptic();
              setDownloadToastVisible(false);
              router.push('/(tabs)/library');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.downloadToastLibraryBtnText}>Library</Text>
            <Ionicons name="chevron-forward" size={14} color="#000000" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  /* Top Browser Navigation Bar */
  topBar: {
    backgroundColor: '#121214',
    borderBottomWidth: 1,
    borderBottomColor: '#222224',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  navControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backToAppBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#26262a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38383c',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  addressBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  addressInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    paddingVertical: 0,
  },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.3)',
    paddingHorizontal: 8,
    height: 34,
    borderRadius: 8,
  },
  shieldBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00e676',
  },

  /* Progress Bar */
  progressBarTrack: {
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 6,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#535aff',
  },

  /* WebView Wrap */
  webViewWrap: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0a0a0c',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },

  /* Floating Stream Banner */
  floatingStreamBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#535aff55',
    shadowColor: '#535aff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  floatingStreamLeft: {
    flex: 1,
    marginRight: 10,
    gap: 2,
  },
  streamActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streamActiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00e676',
  },
  floatingStreamTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  floatingStreamActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  floatingWatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#535aff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  floatingWatchBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  floatingDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00e676',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  floatingDownloadBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  floatingDetailsBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Error Container */
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  errorIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 10,
  },
  autoDetectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#535aff',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    width: '100%',
  },
  autoDetectBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  autoDetectingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#535aff44',
  },
  autoDetectingText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '500',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  retryBtnText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },

  /* Modal & Bottom Sheets */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#3a3a3c',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 3,
    marginBottom: 16,
  },

  /* Quality Modal List */
  qualityModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  qualityOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252528',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    minWidth: 58,
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
    fontSize: 11,
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
    gap: 4,
  },
  qualityOptionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 18,
  },
  qualityMetaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
  },
  qualityActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qualityDownloadSmallBtn: {
    padding: 4,
  },
  qualityPlayBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#535aff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  qualityPlayBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },

  /* Immediate Download Toast */
  downloadToast: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.4)',
    shadowColor: '#00e676',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 9999,
  },
  downloadToastIconWrap: {
    marginRight: 10,
  },
  downloadToastTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  downloadToastTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00e676',
  },
  downloadToastSubtitle: {
    fontSize: 12,
    color: '#ffffff',
    marginTop: 1,
  },
  downloadToastLibraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#00e676',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  downloadToastLibraryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
});

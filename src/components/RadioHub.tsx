import React, { useEffect, useRef, useState } from 'react';
import { Disc3, ExternalLink, Link2, ListMusic, Pause, Play, Radio, X } from 'lucide-react';
import type { GameStep } from '../game/types';

const PLAYLIST_ID = '1XbVBMVIC71ruH7IHuzEJ0';
const PLAYLIST_URI = `spotify:playlist:${PLAYLIST_ID}`;
const PLAYLIST_EMBED_URL = `https://open.spotify.com/embed/playlist/${PLAYLIST_ID}?utm_source=generator&theme=0`;
const PLAYLIST_EXTERNAL_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`;

// Verified official audio/video for "CRO - No Hand Outs" (April 2025)
const NO_HANDOUTS_YT_ID = '1HRL1Be2MrI';
const NO_HANDOUTS_EMBED_URL = `https://www.youtube.com/embed/${NO_HANDOUTS_YT_ID}?enablejsapi=1&loop=1&playlist=${NO_HANDOUTS_YT_ID}&rel=0&modestbranding=1&playsinline=1`;

function parseYouTubeEmbedUrl(rawInput: string): { embedUrl: string; label: string } | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(normalized);
    const listId = url.searchParams.get('list');
    let videoId = url.searchParams.get('v');

    if (!videoId && url.hostname.includes('youtu.be')) {
      videoId = url.pathname.replace(/^\/+/, '').split('/')[0] || null;
    } else if (!videoId && url.pathname.includes('/embed/')) {
      videoId = url.pathname.split('/embed/')[1]?.split('/')[0] || null;
    }

    if (listId) {
      const safeList = encodeURIComponent(listId);
      const vidPart = videoId ? `${encodeURIComponent(videoId)}?` : `videoseries?`;
      return {
        embedUrl: `https://www.youtube.com/embed/${vidPart}list=${safeList}&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`,
        label: 'CUSTOM YT PLAYLIST'
      };
    }

    if (videoId) {
      const safeVid = encodeURIComponent(videoId);
      return {
        embedUrl: `https://www.youtube.com/embed/${safeVid}?enablejsapi=1&loop=1&playlist=${safeVid}&rel=0&modestbranding=1&playsinline=1`,
        label: 'CUSTOM YT FULL TRACK'
      };
    }
  } catch {
    return null;
  }
  return null;
}

export type RadioMode = 'no_handouts' | 'spotify' | 'synth';

interface SpotifyPlaybackUpdateEvent {
  data?: {
    isPaused?: boolean;
    isBuffering?: boolean;
    playingURI?: string;
    position?: number;
    duration?: number;
  };
}

interface SpotifyEmbedController {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  loadUri: (uri: string) => void;
  addListener: (event: string, cb: (e: SpotifyPlaybackUpdateEvent) => void) => void;
  removeListener?: (event: string, cb: (e: SpotifyPlaybackUpdateEvent) => void) => void;
  destroy?: () => void;
}

interface SpotifyIframeApi {
  createController: (
    element: HTMLElement,
    options: { width: string | number; height: string | number; uri: string },
    callback: (controller: SpotifyEmbedController) => void
  ) => void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
    __spotifyIframeApi?: SpotifyIframeApi;
  }
}

export interface RadioStatus {
  playing: boolean;
  ready: boolean;
  source: RadioMode;
}

interface RadioHubProps {
  open: boolean;
  muted: boolean;
  step: GameStep;
  selectedLevel: number;
  showFloatingTrigger: boolean;
  onToggleOpen: () => void;
  onStatusChange: (status: RadioStatus) => void;
  onSpotifyPlaybackChange: (playing: boolean) => void;
}

export const RadioHub: React.FC<RadioHubProps> = ({
  open,
  muted,
  step,
  selectedLevel,
  showFloatingTrigger,
  onToggleOpen,
  onStatusChange,
  onSpotifyPlaybackChange
}) => {
  const spotifyHostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const ytFrameRef = useRef<HTMLIFrameElement | null>(null);
  const customYtFrameRef = useRef<HTMLIFrameElement | null>(null);

  const [ready, setReady] = useState(false);
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  const [spotifyPreviewOnly, setSpotifyPreviewOnly] = useState(true);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [customYtPlaying, setCustomYtPlaying] = useState(false);
  const [source, setSource] = useState<RadioMode>('no_handouts');
  const [autoRoute, setAutoRoute] = useState(true);
  const [expandedList, setExpandedList] = useState(false);
  const [customYtInput, setCustomYtInput] = useState('');
  const [customYt, setCustomYt] = useState<{ embedUrl: string; label: string } | null>(null);
  const [showCustomYtBar, setShowCustomYtBar] = useState(false);
  const [customYtError, setCustomYtError] = useState(false);

  const prevStepRef = useRef<GameStep>(step);
  const prevLevelRef = useRef<number>(selectedLevel);

  const sendYtCommand = (
    frame: HTMLIFrameElement | null,
    func: string,
    args: unknown[] = []
  ) => {
    const win = frame?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    } catch {
      // ignore cross-origin postMessage startup timing errors
    }
  };

  // Listen to YouTube player state notifications so synth override stays synchronized
  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      if (typeof evt.data !== 'string' || !evt.origin.includes('youtube')) return;
      const isMainFrame = evt.source === ytFrameRef.current?.contentWindow;
      const isCustomFrame = evt.source === customYtFrameRef.current?.contentWindow;
      try {
        const payload = JSON.parse(evt.data) as { event?: string; info?: { playerState?: number } | number };
        if (payload.event === 'onReady') {
          if (isCustomFrame) {
            customYtFrameRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'listening', id: 2, channel: 'widget' }),
              '*'
            );
            if (source === 'spotify' && !muted) {
              sendYtCommand(customYtFrameRef.current, 'unMute');
              sendYtCommand(customYtFrameRef.current, 'playVideo');
            }
          } else {
            ytFrameRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
              '*'
            );
            if (source === 'no_handouts' && !muted) {
              sendYtCommand(ytFrameRef.current, 'unMute');
              sendYtCommand(ytFrameRef.current, 'playVideo');
            }
          }
        }
        const stateVal =
          typeof payload.info === 'number'
            ? payload.info
            : payload.info && typeof payload.info.playerState === 'number'
              ? payload.info.playerState
              : null;
        if (stateVal !== null) {
          const isActive = stateVal === 1 || stateVal === 3;
          if (isCustomFrame) {
            setCustomYtPlaying(isActive);
          } else if (isMainFrame || !customYt) {
            setYtPlaying(isActive);
          }
        }
      } catch {
        // ignore non-JSON postMessages
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [source, muted, customYt]);

  const activeExternalPlaying =
    (source === 'spotify' && (customYt ? customYtPlaying : spotifyPlaying)) ||
    (source === 'no_handouts' && ytPlaying);

  // Sync status upstream
  useEffect(() => {
    onStatusChange({ playing: activeExternalPlaying, ready, source });
  }, [activeExternalPlaying, ready, source, onStatusChange]);

  // Mute internal synth groove only when external YouTube or Spotify embed is actually streaming audio
  useEffect(() => {
    onSpotifyPlaybackChange(activeExternalPlaying);
  }, [activeExternalPlaying, onSpotifyPlaybackChange]);

  // Honor global [M] audio mute across YouTube & Spotify embeds
  useEffect(() => {
    if (muted) {
      if (controllerRef.current && spotifyPlaying) {
        controllerRef.current.pause();
      }
      sendYtCommand(ytFrameRef.current, 'pauseVideo');
      sendYtCommand(ytFrameRef.current, 'mute');
      sendYtCommand(customYtFrameRef.current, 'pauseVideo');
      sendYtCommand(customYtFrameRef.current, 'mute');
    } else {
      sendYtCommand(ytFrameRef.current, 'unMute');
      sendYtCommand(customYtFrameRef.current, 'unMute');
      if (source === 'no_handouts') {
        sendYtCommand(ytFrameRef.current, 'playVideo');
      } else if (source === 'spotify' && (step === 'preview' || step === 'countdown' || step === 'race')) {
        if (customYt) {
          sendYtCommand(customYtFrameRef.current, 'playVideo');
        } else {
          controllerRef.current?.play();
        }
      }
    }
  }, [muted, source, spotifyPlaying, step, customYt]);

  // Initialize official Spotify Embed iFrame API once and keep persistent across screens
  useEffect(() => {
    const mount = spotifyHostRef.current;
    if (!mount) return;
    let cancelled = false;
    let fallbackTimer: number | null = null;

    const initController = (api: SpotifyIframeApi) => {
      if (cancelled || !spotifyHostRef.current || controllerRef.current) return;
      spotifyHostRef.current.innerHTML = '';
      api.createController(
        spotifyHostRef.current,
        {
          width: '100%',
          height: 152,
          uri: PLAYLIST_URI
        },
        (controller) => {
          if (cancelled) {
            controller.destroy?.();
            return;
          }
          controllerRef.current = controller;
          setReady(true);

          controller.addListener('ready', () => {
            if (!cancelled) setReady(true);
          });

          controller.addListener('playback_started', () => {
            if (!cancelled) {
              setSpotifyPlaying(true);
            }
          });

          controller.addListener('playback_update', (evt) => {
            if (cancelled) return;
            const paused = evt?.data?.isPaused;
            if (typeof paused === 'boolean') {
              setSpotifyPlaying(!paused);
            }
            const dur = evt?.data?.duration;
            if (typeof dur === 'number' && dur > 0) {
              // Spotify embeds report ~30s (or ~30000ms) when serving unauthenticated previews
              const isPreview = dur <= 35 || (dur >= 1000 && dur <= 35000);
              setSpotifyPreviewOnly(isPreview);
            }
          });
        }
      );
    };

    if (window.__spotifyIframeApi) {
      initController(window.__spotifyIframeApi);
    } else {
      const prevReady = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = (api) => {
        window.__spotifyIframeApi = api;
        prevReady?.(api);
        initController(api);
      };

      const existingScript = document.querySelector('script[data-spotify-iframe-api="true"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://open.spotify.com/embed/iframe-api/v1';
        script.async = true;
        script.dataset.spotifyIframeApi = 'true';
        document.body.appendChild(script);
      }

      fallbackTimer = window.setTimeout(() => {
        if (cancelled || controllerRef.current || !spotifyHostRef.current) return;
        if (spotifyHostRef.current.querySelector('iframe')) return;
        const iframe = document.createElement('iframe');
        iframe.src = PLAYLIST_EMBED_URL;
        iframe.width = '100%';
        iframe.height = '152';
        iframe.style.border = '0';
        iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
        iframe.title = 'Ahwoo Racing Spotify Playlist';
        spotifyHostRef.current.appendChild(iframe);
        setReady(true);
      }, 2400);
    }

    return () => {
      cancelled = true;
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      controllerRef.current?.destroy?.();
      controllerRef.current = null;
    };
  }, []);

  // Adjust embed height smoothly when toggling compact vs full tracklist
  useEffect(() => {
    const iframe = spotifyHostRef.current?.querySelector('iframe');
    if (iframe) {
      iframe.style.height = expandedList ? '330px' : '152px';
    }
  }, [expandedList]);

  // Automatic Screen Music Routing:
  // - Car Select ('driver') & Level Select ('level'): CRO - No Hand Outs
  // - Race / Level Start ('preview', 'countdown', 'race'): Start current Playlist
  useEffect(() => {
    const prevStep = prevStepRef.current;
    const prevLvl = prevLevelRef.current;
    prevStepRef.current = step;
    prevLevelRef.current = selectedLevel;

    if (!autoRoute) return;

    const isMenuSelect = step === 'driver' || step === 'level';
    const isRaceFlow = step === 'preview' || step === 'countdown' || step === 'race';
    const wasRaceFlow = prevStep === 'preview' || prevStep === 'countdown' || prevStep === 'race';

    if (isMenuSelect) {
      setSource('no_handouts');
      if (spotifyPlaying && controllerRef.current) {
        controllerRef.current.pause();
      }
      sendYtCommand(customYtFrameRef.current, 'pauseVideo');
      setCustomYtPlaying(false);
      if (!muted) {
        sendYtCommand(ytFrameRef.current, 'unMute');
        sendYtCommand(ytFrameRef.current, 'playVideo');
      }
    } else if (isRaceFlow && (!wasRaceFlow || prevLvl !== selectedLevel)) {
      setSource('spotify');
      sendYtCommand(ytFrameRef.current, 'pauseVideo');
      setYtPlaying(false);
      if (!muted) {
        if (customYt) {
          sendYtCommand(customYtFrameRef.current, 'unMute');
          sendYtCommand(customYtFrameRef.current, 'playVideo');
        } else if (controllerRef.current) {
          controllerRef.current.play();
        }
      }
    }
  }, [step, selectedLevel, autoRoute, muted, spotifyPlaying, customYt]);

  const handleTogglePlay = () => {
    if (source === 'synth') {
      setSource('spotify');
      if (customYt) {
        sendYtCommand(customYtFrameRef.current, 'unMute');
        sendYtCommand(customYtFrameRef.current, 'playVideo');
      } else {
        controllerRef.current?.play();
      }
      return;
    }
    if (source === 'no_handouts') {
      if (ytPlaying) {
        sendYtCommand(ytFrameRef.current, 'pauseVideo');
        setYtPlaying(false);
      } else {
        sendYtCommand(ytFrameRef.current, 'unMute');
        sendYtCommand(ytFrameRef.current, 'playVideo');
      }
      return;
    }
    if (customYt) {
      if (customYtPlaying) {
        sendYtCommand(customYtFrameRef.current, 'pauseVideo');
        setCustomYtPlaying(false);
      } else {
        sendYtCommand(customYtFrameRef.current, 'unMute');
        sendYtCommand(customYtFrameRef.current, 'playVideo');
      }
      return;
    }
    controllerRef.current?.togglePlay();
  };

  const handleSwitchSource = (next: RadioMode) => {
    setSource(next);
    if (next === 'synth') {
      if (spotifyPlaying) controllerRef.current?.pause();
      sendYtCommand(ytFrameRef.current, 'pauseVideo');
      sendYtCommand(customYtFrameRef.current, 'pauseVideo');
      setYtPlaying(false);
      setCustomYtPlaying(false);
    } else if (next === 'no_handouts') {
      if (spotifyPlaying) controllerRef.current?.pause();
      sendYtCommand(customYtFrameRef.current, 'pauseVideo');
      setCustomYtPlaying(false);
      if (!muted) {
        sendYtCommand(ytFrameRef.current, 'unMute');
        sendYtCommand(ytFrameRef.current, 'playVideo');
      }
    } else {
      sendYtCommand(ytFrameRef.current, 'pauseVideo');
      setYtPlaying(false);
      if (!muted) {
        if (customYt) {
          sendYtCommand(customYtFrameRef.current, 'unMute');
          sendYtCommand(customYtFrameRef.current, 'playVideo');
        } else {
          controllerRef.current?.play();
        }
      }
    }
  };

  const handleApplyCustomYt = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseYouTubeEmbedUrl(customYtInput);
    if (!parsed) {
      setCustomYtError(true);
      return;
    }
    setCustomYtError(false);
    setCustomYt(parsed);
    setShowCustomYtBar(false);
    setSource('spotify');
    if (spotifyPlaying) controllerRef.current?.pause();
    sendYtCommand(ytFrameRef.current, 'pauseVideo');
    setYtPlaying(false);
  };

  const handleClearCustomYt = () => {
    sendYtCommand(customYtFrameRef.current, 'pauseVideo');
    setCustomYtPlaying(false);
    setCustomYt(null);
    setCustomYtInput('');
    setCustomYtError(false);
  };

  const triggerLabel =
    source === 'no_handouts'
      ? 'CRO · NO HANDOUTS'
      : source === 'spotify'
        ? customYt
          ? customYtPlaying
            ? 'FULL YT LIVE'
            : 'FULL YT [R]'
          : spotifyPlaying
            ? spotifyPreviewOnly
              ? 'PREVIEW 30S'
              : 'PLAYLIST LIVE'
            : 'PLAYLIST [R]'
        : 'SYNTH [R]';

  return (
    <>
      {/* Unobtrusive corner trigger */}
      {showFloatingTrigger && !open && (
        <button
          type="button"
          onClick={onToggleOpen}
          title="Open Radio & Track Switcher (R)"
          className="fixed bottom-3 right-4 z-40 nav-chip px-2.5 py-1.5 flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-[#d8e6ff] cursor-pointer whitespace-nowrap shrink-0"
        >
          <Radio
            className={`w-3.5 h-3.5 shrink-0 ${
              source === 'no_handouts'
                ? 'text-[#f5c451]'
                : activeExternalPlaying
                  ? 'text-[#1ed760]'
                  : 'text-[#00f0ff]'
            }`}
          />
          <span>RADIO</span>
          <span
            className={
              source === 'no_handouts'
                ? 'text-[#f5c451]'
                : activeExternalPlaying
                  ? 'text-[#1ed760]'
                  : 'text-[#9be8ff]'
            }
          >
            {triggerLabel}
          </span>
        </button>
      )}

      {/* Persistent Radio Hub mounted across all screens so music transitions cleanly */}
      <div
        aria-hidden={!open}
        className={`fixed bottom-12 right-4 z-50 w-[min(92vw,364px)] lux-panel border border-[#f5c451]/60 transition-all duration-200 ${
          open
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-6 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Disc3
              className={`w-4 h-4 shrink-0 ${
                source === 'no_handouts'
                  ? 'text-[#f5c451]'
                  : activeExternalPlaying
                    ? 'text-[#1ed760]'
                    : 'text-[#00f0ff]'
              }`}
            />
            <div className="min-w-0">
              <div className="text-[10px] font-black tracking-[0.18em] text-white truncate">
                {source === 'no_handouts'
                  ? 'CRO · NO HAND OUTS'
                  : source === 'spotify'
                    ? customYt
                      ? customYt.label
                      : 'AHWOO PLAYLIST'
                    : 'SYNTH CORE'}
              </div>
              <div className="text-[8px] tracking-[0.15em] text-[#9be8ff] truncate">
                {source === 'no_handouts'
                  ? 'CAR & LEVEL SELECT · FULL TRACK'
                  : source === 'spotify'
                    ? customYt
                      ? customYtPlaying
                        ? 'YOUTUBE FULL STREAM · LIVE'
                        : 'YOUTUBE FULL STREAM · READY'
                      : spotifyPreviewOnly
                        ? 'SPOTIFY EMBED · 30S PREVIEW MODE'
                        : spotifyPlaying
                          ? 'RACE PLAYLIST · STREAMING'
                          : 'RACE PLAYLIST · READY'
                    : 'ADAPTIVE SOUND ENGINE · FULL OST'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleTogglePlay}
              title={activeExternalPlaying ? 'Pause' : 'Play'}
              className="p-1.5 border border-white/20 text-white hover:border-[#1ed760] hover:text-[#1ed760] cursor-pointer"
            >
              {activeExternalPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
            {source === 'spotify' && !customYt && (
              <button
                type="button"
                onClick={() => setExpandedList((v) => !v)}
                title={expandedList ? 'Compact Player' : 'Show Full Playlist'}
                className={`p-1.5 border cursor-pointer ${
                  expandedList
                    ? 'border-[#00f0ff] text-[#00f0ff]'
                    : 'border-white/20 text-[#b9c8e8] hover:text-white'
                }`}
              >
                <ListMusic className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleOpen}
              title="Minimize Radio Hub (R)"
              className="p-1.5 border border-white/20 text-[#b9c8e8] hover:border-[#f5c451] hover:text-white cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 3-way Track / Source Switcher */}
        <div className="grid grid-cols-3 gap-1 px-2.5 pt-2 pb-1.5 text-[8px] font-bold tracking-[0.12em]">
          <button
            type="button"
            onClick={() => handleSwitchSource('no_handouts')}
            className={`py-1 border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              source === 'no_handouts'
                ? 'bg-[#f5c451]/18 border-[#f5c451] text-[#fff4d4]'
                : 'bg-black/40 border-white/15 text-[#9eb2da] hover:text-white'
            }`}
          >
            NO HANDOUTS
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSource('spotify')}
            className={`py-1 border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              source === 'spotify'
                ? 'bg-[#1ed760]/18 border-[#1ed760] text-[#d8ffe6]'
                : 'bg-black/40 border-white/15 text-[#9eb2da] hover:text-white'
            }`}
          >
            PLAYLIST
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSource('synth')}
            className={`py-1 border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              source === 'synth'
                ? 'bg-[#00f0ff]/18 border-[#00f0ff] text-[#d8f8ff]'
                : 'bg-black/40 border-white/15 text-[#9eb2da] hover:text-white'
            }`}
          >
            SYNTH
          </button>
        </div>

        {/* Auto-routing & Full-Track Helper Controls */}
        <div className="flex items-center justify-between gap-1.5 px-2.5 pb-1.5 text-[8px] tracking-[0.12em] text-[#9be8ff]">
          <span>MENU: NO HANDOUTS · RACE: PLAYLIST</span>
          <button
            type="button"
            onClick={() => setAutoRoute((v) => !v)}
            className={`px-1.5 py-0.5 border cursor-pointer whitespace-nowrap shrink-0 ${
              autoRoute
                ? 'border-[#00f0ff]/60 text-[#00f0ff]'
                : 'border-white/15 text-[#8ea2ca]'
            }`}
          >
            {autoRoute ? 'AUTO ON' : 'AUTO OFF'}
          </button>
        </div>

        {/* Full-Length Audio Action Bar when on Spotify Playlist (which limits unauthenticated iframe embeds to 30s previews) */}
        {source === 'spotify' && (
          <div className="mx-2.5 mb-2 px-2 py-1.5 bg-[#0a1226]/90 border border-[#f5c451]/35 flex flex-wrap items-center justify-between gap-1.5 text-[8px] tracking-[0.1em]">
            <span className="text-[#ffd978]">
              {customYt ? 'FULL-LENGTH YT ACTIVE' : 'SPOTIFY EMBED = 30S PREVIEWS'}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowCustomYtBar((v) => !v)}
                className="px-1.5 py-0.5 border border-[#00f0ff]/55 text-[#9be8ff] hover:bg-[#00f0ff]/15 flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Link2 className="w-2.5 h-2.5" />
                {customYt ? 'CHANGE YT' : 'PASTE YT URL'}
              </button>
              {customYt && (
                <button
                  type="button"
                  onClick={handleClearCustomYt}
                  className="px-1.5 py-0.5 border border-white/20 text-[#b9c8e8] hover:text-white cursor-pointer"
                >
                  SPOTIFY
                </button>
              )}
              <a
                href={PLAYLIST_EXTERNAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-1.5 py-0.5 border border-[#1ed760]/60 text-[#1ed760] hover:bg-[#1ed760]/15 flex items-center gap-1 whitespace-nowrap"
              >
                <span>OPEN FULL</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        )}

        {/* Custom Full-Length YouTube Track or Playlist Paste Form */}
        {showCustomYtBar && (
          <form
            onSubmit={handleApplyCustomYt}
            className="mx-2.5 mb-2 p-2 bg-black/60 border border-[#00f0ff]/45 flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={customYtInput}
                onChange={(e) => {
                  setCustomYtInput(e.target.value);
                  if (customYtError) setCustomYtError(false);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Paste YouTube video or playlist URL..."
                className="flex-1 min-w-0 bg-[#050712] border border-white/20 px-2 py-1 text-[10px] text-white placeholder-[#6f82a8] focus:outline-none focus:border-[#00f0ff]"
              />
              <button
                type="submit"
                className="px-2 py-1 border border-[#00f0ff] bg-[#00f0ff]/15 text-[#9be8ff] text-[9px] font-bold tracking-[0.12em] cursor-pointer whitespace-nowrap"
              >
                LOAD
              </button>
            </div>
            {customYtError && (
              <div className="text-[8px] text-[#ff5c8d] tracking-[0.08em]">
                Enter a valid youtube.com or youtu.be track / playlist URL.
              </div>
            )}
          </form>
        )}

        {/* All embeds stay mounted cleanly so playback transitions never cut */}
        <div className="px-2.5 pb-2.5">
          <div className={source === 'no_handouts' ? 'block' : 'hidden'}>
            <div className="w-full overflow-hidden bg-[#050712] border border-[#f5c451]/35 aspect-video">
              <iframe
                ref={ytFrameRef}
                src={NO_HANDOUTS_EMBED_URL}
                title="CRO - No Hand Outs"
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
              />
            </div>
          </div>

          <div className={source === 'spotify' && customYt ? 'block' : 'hidden'}>
            {customYt && (
              <div className="w-full overflow-hidden bg-[#050712] border border-[#00f0ff]/40 aspect-video">
                <iframe
                  ref={customYtFrameRef}
                  src={customYt.embedUrl}
                  title="Custom Full-Length Race Radio"
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media; picture-in-picture"
                />
              </div>
            )}
          </div>

          <div className={source !== 'no_handouts' && !customYt ? 'block' : 'hidden'}>
            <div
              ref={spotifyHostRef}
              className="w-full overflow-hidden bg-[#050712] border border-white/10 min-h-[152px]"
            />
          </div>

          <div className="flex items-center justify-between text-[8px] tracking-[0.14em] text-[#8ea2ca] mt-1.5 px-0.5">
            <span>
              {source === 'no_handouts'
                ? 'CRO - NO HAND OUTS (FULL TRACK)'
                : customYt
                  ? 'LEVEL 01+ · FULL YT STREAM'
                  : 'LEVEL 01+ · SPOTIFY PLAYLIST'}
            </span>
            <span>[R] TOGGLE</span>
          </div>
        </div>
      </div>
    </>
  );
};

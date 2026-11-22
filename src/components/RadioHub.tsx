import React, { useEffect, useRef, useState } from 'react';
import { Disc3, ListMusic, Pause, Play, Radio, X } from 'lucide-react';

const PLAYLIST_ID = '1XbVBMVIC71ruH7IHuzEJ0';
const PLAYLIST_URI = `spotify:playlist:${PLAYLIST_ID}`;
const PLAYLIST_EMBED_URL = `https://open.spotify.com/embed/playlist/${PLAYLIST_ID}?utm_source=generator&theme=0`;

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
  source: 'spotify' | 'synth';
}

interface RadioHubProps {
  open: boolean;
  muted: boolean;
  showFloatingTrigger: boolean;
  onToggleOpen: () => void;
  onStatusChange: (status: RadioStatus) => void;
  onSpotifyPlaybackChange: (playing: boolean) => void;
}

export const RadioHub: React.FC<RadioHubProps> = ({
  open,
  muted,
  showFloatingTrigger,
  onToggleOpen,
  onStatusChange,
  onSpotifyPlaybackChange
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [source, setSource] = useState<'spotify' | 'synth'>('spotify');
  const [expandedList, setExpandedList] = useState(false);

  // Sync status upstream
  useEffect(() => {
    onStatusChange({ playing: isPlaying, ready, source });
  }, [isPlaying, ready, source, onStatusChange]);

  // Override internal procedural synth music when Spotify Radio is playing (or selected and not muted)
  useEffect(() => {
    onSpotifyPlaybackChange(source === 'spotify' && isPlaying);
  }, [source, isPlaying, onSpotifyPlaybackChange]);

  // Pause Spotify cleanly when global game audio is muted
  useEffect(() => {
    if (muted && isPlaying && controllerRef.current) {
      controllerRef.current.pause();
    }
  }, [muted, isPlaying]);

  // Initialize official Spotify Embed iFrame API once and keep persistent across screens
  useEffect(() => {
    const mount = hostRef.current;
    if (!mount) return;
    let cancelled = false;
    let fallbackTimer: number | null = null;

    const initController = (api: SpotifyIframeApi) => {
      if (cancelled || !hostRef.current || controllerRef.current) return;
      hostRef.current.innerHTML = '';
      api.createController(
        hostRef.current,
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
              setSource('spotify');
              setIsPlaying(true);
            }
          });

          controller.addListener('playback_update', (evt) => {
            if (cancelled) return;
            const paused = evt?.data?.isPaused;
            if (typeof paused === 'boolean') {
              setIsPlaying(!paused);
              if (!paused) setSource('spotify');
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

      // Direct embed iframe fallback if Spotify API script hasn't initialized
      fallbackTimer = window.setTimeout(() => {
        if (cancelled || controllerRef.current || !hostRef.current) return;
        if (hostRef.current.querySelector('iframe')) return;
        const iframe = document.createElement('iframe');
        iframe.src = PLAYLIST_EMBED_URL;
        iframe.width = '100%';
        iframe.height = '152';
        iframe.style.border = '0';
        iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
        iframe.title = 'Ahwoo Racing Spotify Radio Hub';
        hostRef.current.appendChild(iframe);
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
    const iframe = hostRef.current?.querySelector('iframe');
    if (iframe) {
      iframe.style.height = expandedList ? '352px' : '152px';
    }
  }, [expandedList]);

  const handleTogglePlay = () => {
    if (source === 'synth') {
      setSource('spotify');
    }
    if (controllerRef.current) {
      controllerRef.current.togglePlay();
    }
  };

  const handleSwitchSource = (next: 'spotify' | 'synth') => {
    setSource(next);
    if (next === 'synth' && isPlaying && controllerRef.current) {
      controllerRef.current.pause();
    } else if (next === 'spotify' && !isPlaying && controllerRef.current) {
      controllerRef.current.play();
    }
  };

  return (
    <>
      {/* Optional unobtrusive corner micro-trigger for non-race screens */}
      {showFloatingTrigger && !open && (
        <button
          type="button"
          onClick={onToggleOpen}
          title="Open Spotify Radio Hub (R)"
          className="fixed bottom-3 right-4 z-40 nav-chip px-2.5 py-1.5 flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-[#d8e6ff] cursor-pointer whitespace-nowrap"
        >
          <Radio className={`w-3.5 h-3.5 shrink-0 ${isPlaying ? 'text-[#1ed760]' : 'text-[#00f0ff]'}`} />
          <span>RADIO</span>
          <span className={isPlaying ? 'text-[#1ed760]' : 'text-[#f5c451]'}>
            {isPlaying ? 'SPOTIFY LIVE' : '[R]'}
          </span>
        </button>
      )}

      {/* Persistent Spotify Radio Drawer — kept mounted even when collapsed so music never cuts between screens */}
      <div
        aria-hidden={!open}
        className={`fixed bottom-12 right-4 z-50 w-[min(92vw,340px)] lux-panel border border-[#f5c451]/60 transition-all duration-200 ${
          open
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-6 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Disc3 className={`w-4 h-4 shrink-0 ${isPlaying ? 'text-[#1ed760]' : 'text-[#f5c451]'}`} />
            <div className="min-w-0">
              <div className="text-[10px] font-black tracking-[0.18em] text-white truncate">
                AHWOO RADIO HUB
              </div>
              <div className="text-[8px] tracking-[0.16em] text-[#9be8ff] truncate">
                {source === 'spotify'
                  ? isPlaying
                    ? 'SPOTIFY PLAYLIST · STREAMING'
                    : 'SPOTIFY PLAYLIST · READY'
                  : 'INTERNAL SYNTH CORE ACTIVE'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {controllerRef.current && (
              <button
                type="button"
                onClick={handleTogglePlay}
                title={isPlaying ? 'Pause Spotify' : 'Play Spotify'}
                className="p-1.5 border border-white/20 text-white hover:border-[#1ed760] hover:text-[#1ed760] cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            )}
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

        {/* Source selector */}
        <div className="grid grid-cols-2 gap-1 px-2.5 pt-2 pb-1.5 text-[9px] font-bold tracking-[0.15em]">
          <button
            type="button"
            onClick={() => handleSwitchSource('spotify')}
            className={`py-1 border cursor-pointer transition-colors ${
              source === 'spotify'
                ? 'bg-[#1ed760]/18 border-[#1ed760] text-[#d8ffe6]'
                : 'bg-black/40 border-white/15 text-[#9eb2da] hover:text-white'
            }`}
          >
            SPOTIFY RADIO
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSource('synth')}
            className={`py-1 border cursor-pointer transition-colors ${
              source === 'synth'
                ? 'bg-[#f5c451]/18 border-[#f5c451] text-[#fff4d4]'
                : 'bg-black/40 border-white/15 text-[#9eb2da] hover:text-white'
            }`}
          >
            SYNTH CORE
          </button>
        </div>

        {/* Persistent Spotify Embed Host */}
        <div className="px-2.5 pb-2.5">
          <div ref={hostRef} className="w-full overflow-hidden bg-[#050712] border border-white/10 min-h-[152px]" />
          <div className="flex items-center justify-between text-[8px] tracking-[0.14em] text-[#8ea2ca] mt-1.5 px-0.5">
            <span>PRESS PLAY ABOVE TO STREAM PLAYLIST</span>
            <span>[R] TOGGLE</span>
          </div>
        </div>
      </div>
    </>
  );
};

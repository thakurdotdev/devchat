import { useRef, useState, useEffect, useCallback } from 'preact/hooks';

interface Props {
  src: string;
  title: string;
}

/**
 * Custom audio player styled with VS Code theme variables.
 * Replaces the default browser <audio controls> element.
 */
export function AudioPlayer({ src, title }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }, [playing]);

  const seek = useCallback((e: MouseEvent) => {
    const audio = audioRef.current;
    const bar = e.currentTarget as HTMLDivElement;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div class="audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button class="audio-play-btn" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
        <span class={`codicon ${playing ? 'codicon-debug-pause' : 'codicon-play'}`} />
      </button>
      <div class="audio-track">
        <span class="audio-track-title">{title}</span>
        <div class="audio-progress-bar" onClick={seek}>
          <div class="audio-progress-fill" style={`width:${progress}%`} />
        </div>
      </div>
      <span class="audio-time">{fmt(currentTime)}/{fmt(duration)}</span>
    </div>
  );
}

function fmt(s: number): string {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

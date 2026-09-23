interface Props {
  url: string;
  preview?: string;
  title?: string;
  blurred: boolean;
  onToggle: () => void;
}

export function GifMedia({ url, preview, title, blurred, onToggle }: Props) {
  const media = isVideo(url)
    ? <video class={`gif ${blurred ? 'gif-blurred' : ''}`} src={url} poster={preview} autoplay loop muted playsinline />
    : <img class={`gif ${blurred ? 'gif-blurred' : ''}`} src={url} alt={title || 'Animated image'} loading="lazy" />;

  return (
    <div class={`gif-media ${blurred ? 'is-blurred' : ''}`}>
      {media}
      <button
        class="gif-visibility"
        type="button"
        aria-label={blurred ? 'Reveal GIF' : 'Blur GIF'}
        title={blurred ? 'Reveal GIF' : 'Blur GIF'}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <span class={`codicon ${blurred ? 'codicon-eye' : 'codicon-eye-closed'}`} />
        {blurred && <span>Show GIF</span>}
      </button>
    </div>
  );
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('.mp4');
}

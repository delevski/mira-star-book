import { useCallback, useEffect, useRef, useState } from "react";

type Page = { image: string; video?: string; audio?: string; text: string };
type Booklet = {
  icon: string; cover: string; coverBackground: string;
  title: string; coverTitle: string; author: string; pages: Page[];
};
type Flip = { dir: "forward" | "backward"; from: number } | null;

const FLIP_MS = 780;

export function App() {
  const [book, setBook] = useState<Booklet | "loading" | "error">("loading");
  useEffect(() => {
    fetch("/content/mira/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setBook)
      .catch(() => setBook("error"));
  }, []);
  if (book === "loading")
    return (
      <div className="site-status" role="status">
        <span className="site-status-emoji bouncing" aria-hidden="true">⭐</span>
        <p>רק רגע...</p>
      </div>
    );
  if (book === "error")
    return (
      <div className="site-status">
        <span className="site-status-emoji" aria-hidden="true">☁️</span>
        <p>משהו לא נטען. נסו שוב בעוד רגע.</p>
      </div>
    );
  return <BookletView booklet={book} />;
}

function BookletView({ booklet }: { booklet: Booklet }) {
  const dir = "/content/mira";
  const pages = booklet.pages;
  const total = pages.length + 1; // cover + spreads
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState<Flip>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const swishRef = useRef<HTMLAudioElement>(null);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const lastPlayed = useRef<number>(-1);

  const atCover = idx === 0;
  const atEnd = idx === total - 1;
  const src = useCallback((i: number) => (i === 0 ? `${dir}/${booklet.cover}` : `${dir}/${pages[i - 1].image}`), [dir, booklet.cover, pages]);
  const audioSrc = useCallback((i: number) => (i > 0 && pages[i - 1].audio ? `${dir}/${pages[i - 1].audio}` : null), [dir, pages]);
  const videoSrc = useCallback((i: number) => (i > 0 && pages[i - 1].video ? `${dir}/${pages[i - 1].video}` : undefined), [dir, pages]);

  // preload neighbours
  useEffect(() => {
    for (let n = Math.max(0, idx - 1); n <= Math.min(total - 1, idx + 2); n++) {
      const im = new Image();
      im.src = src(n);
    }
  }, [idx, total, src]);

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    setNeedsTap(false);
  }, []);

  const playFor = useCallback(
    (i: number) => {
      const el = audioRef.current, a = audioSrc(i);
      if (!el || !a) return;
      if (lastPlayed.current === i) return;
      lastPlayed.current = i;
      el.src = a;
      el.muted = false;
      el.play().catch((e) => {
        if (e?.name === "NotAllowedError") setNeedsTap(true);
      });
    },
    [audioSrc],
  );

  useEffect(() => {
    if (flip) return;
    if (idx <= 0) { lastPlayed.current = -1; stopAudio(); return; }
    playFor(idx);
  }, [idx, flip, playFor, stopAudio]);

  const swish = useCallback(() => {
    const el = swishRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => {});
  }, []);

  const settle = (n: number) => { setIdx(n); setFlip(null); };
  const forward = () => {
    if (idx >= total - 1 || flip) return;
    stopAudio(); lastPlayed.current = -1;
    swish();
    setFlip({ dir: "forward", from: idx });
    setTimeout(() => settle(idx + 1), FLIP_MS);
  };
  const backward = () => {
    if (idx <= 0 || flip) return;
    stopAudio(); lastPlayed.current = -1;
    swish();
    setFlip({ dir: "backward", from: idx });
    setTimeout(() => settle(idx - 1), FLIP_MS);
  };
  const restart = () => { if (flip) return; stopAudio(); lastPlayed.current = -1; setIdx(0); };

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; touchY.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = touchX.current - e.changedTouches[0].clientX;
    const dy = Math.abs((touchY.current ?? 0) - e.changedTouches[0].clientY);
    if (Math.abs(dx) > 60 && dy < 100) { dx > 0 ? backward() : forward(); }
    touchX.current = null; touchY.current = null;
  };
  const onClick = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < r.width * 0.15) forward();
    else if (x > r.width * 0.85) backward();
  };
  const listenTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    setNeedsTap(false);
    el.muted = false;
    el.play().catch(() => {});
  };

  const flippingTo = flip ? (flip.dir === "forward" ? flip.from + 1 : flip.from - 1) : idx;
  const toCover = flip && flippingTo === 0;
  const fromCover = flip && flip.from === 0;

  return (
    <div className="story-booklet-view" dir="rtl">
      <div className="story-top-bar">
        <h2 className="story-title">{booklet.icon} {booklet.title}</h2>
        {atEnd && !atCover && (
          <button type="button" className="story-restart-button" onClick={restart} disabled={!!flip}>חזור להתחלה</button>
        )}
      </div>
      <div className="story-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={onClick}>
        <div className="story-book-perspective">
          <div className={atCover && !flip ? "story-book-sheet story-book-closed" : "story-book-sheet"}>
            {flip ? (
              <>
                {/* underneath: where we are going */}
                {toCover ? (
                  <ClosedCover booklet={booklet} src={src(0)} />
                ) : fromCover ? (
                  <Spread left={src(1)} video={videoSrc(1)} />
                ) : (
                  <Spread left={src(flippingTo)} video={videoSrc(flippingTo)} />
                )}
                <UnderShadow dir={flip.dir} />
                {/* the turning leaf */}
                {fromCover ? (
                  <CoverLeaf booklet={booklet} src={src(0)} opening />
                ) : toCover ? (
                  <CoverLeaf booklet={booklet} src={src(0)} opening={false} />
                ) : (
                  <PageLeaf dir={flip.dir} img={src(flip.from)} />
                )}
              </>
            ) : atCover ? (
              <ClosedCover booklet={booklet} src={src(0)} />
            ) : (
              <Spread left={src(idx)} video={videoSrc(idx)} />
            )}
            {idx < total - 1 && !flip && (
              <div className="story-page-corner corner-left" onClick={(e) => { e.stopPropagation(); forward(); }}>
                <div className="story-corner-fold corner-fold-left" />
              </div>
            )}
            {idx > 0 && !flip && (
              <div className="story-page-corner corner-right" onClick={(e) => { e.stopPropagation(); backward(); }}>
                <div className="story-corner-fold corner-fold-right" />
              </div>
            )}
          </div>
        </div>
      </div>
      {!atCover && pages[idx - 1]?.text && (
        <div className="story-text-strip">{pages[idx - 1].text.split("\n").map((ln, i) => <p key={i}>{ln}</p>)}</div>
      )}
      {needsTap && !flip && (
        <button type="button" className="story-listen-button" onClick={listenTap} onTouchEnd={(e) => e.stopPropagation()}>🔊 הַקִּישׁוּ לִשְׁמֹעַ</button>
      )}
      <div className="story-page-indicator">{idx === 0 ? "כריכה" : `${idx} / ${pages.length}`}</div>
      <audio ref={audioRef} preload="metadata" />
      <audio ref={swishRef} src={`${dir}/sfx/flip.mp3`} preload="auto" />
      <RotatePrompt />
    </div>
  );
}

function ClosedCover({ booklet, src }: { booklet: Booklet; src: string }) {
  return (
    <div className="story-closed-cover" style={{ backgroundColor: booklet.coverBackground }}>
      <img className="story-cover-image" src={src} alt="" draggable={false} />
      <div className="story-cover-text">
        <p className="story-cover-title">{booklet.coverTitle}</p>
        <p className="story-cover-author">{booklet.author}</p>
      </div>
    </div>
  );
}

function Spread({ left, video }: { left: string; video?: string }) {
  // one wide 3:1 illustration spanning the two pages of the open book; when the page has a clip,
  // one video across the whole book paints the illustration, then rests on the finished page
  // (its last frame is the still underneath, so it never pops)
  return (
    <div className="story-open-book">
      <div className="story-page story-page-left">
        <div className="story-page-clip"><img className="story-spread-image" src={left} alt="" draggable={false} style={{ left: "0" }} /></div>
      </div>
      <div className="story-page story-page-right">
        <div className="story-page-clip"><img className="story-spread-image" src={left} alt="" draggable={false} style={{ left: "-100%" }} /></div>
      </div>
      {video && (
        <video key={video} className="story-spread-video" src={video} poster={left} muted playsInline autoPlay preload="auto" />
      )}
      <div className="story-spine" aria-hidden="true" />
    </div>
  );
}

/* the turning half-page: front shows half of the current spread, back is paper */
function PageLeaf({ dir, img }: { dir: "forward" | "backward"; img: string }) {
  // forward (RTL): the LEFT half turns over the spine to the right; backward: the RIGHT half turns back left
  const half = dir === "forward" ? "left" : "right";
  return (
    <div className={`story-leaf story-leaf-${half} ${dir === "forward" ? "leaf-turn-forward" : "leaf-turn-backward"}`}>
      <div className="story-leaf-face story-leaf-front">
        <div className="story-page-clip">
          <img className="story-spread-image" src={img} alt="" draggable={false} style={half === "left" ? { left: "0" } : { left: "-100%" }} />
        </div>
        <div className="story-leaf-shade" />
      </div>
      <div className="story-leaf-face story-leaf-back">
        <div className="story-leaf-back-shade" />
      </div>
    </div>
  );
}

/* cover swing: opening turns the closed cover around its spine; closing brings it back */
function CoverLeaf({ booklet, src, opening }: { booklet: Booklet; src: string; opening: boolean }) {
  return (
    <div className={`story-cover-leaf ${opening ? "cover-open-anim" : "cover-close-anim"}`}>
      <div className="story-leaf-face story-leaf-front">
        <div className="story-closed-cover story-cover-inleaf" style={{ backgroundColor: booklet.coverBackground }}>
          <img className="story-cover-image" src={src} alt="" draggable={false} />
          <div className="story-cover-text">
            <p className="story-cover-title">{booklet.coverTitle}</p>
            <p className="story-cover-author">{booklet.author}</p>
          </div>
        </div>
        <div className="story-leaf-shade" />
      </div>
      <div className="story-leaf-face story-leaf-back">
        <div className="story-leaf-back-shade" />
      </div>
    </div>
  );
}

function UnderShadow({ dir }: { dir: "forward" | "backward" }) {
  return <div className={`story-under-shadow ${dir === "forward" ? "under-shadow-forward" : "under-shadow-backward"}`} aria-hidden="true" />;
}

function RotatePrompt() {
  return (
    <div className="rotate-prompt" role="dialog" aria-label="סובבו את המכשיר">
      <span className="rotate-prompt-emoji" aria-hidden="true">📱</span>
      <p>סוֹבְבוּ אֶת הַמַּכְשִׁיר לְרֹוחַב</p>
    </div>
  );
}

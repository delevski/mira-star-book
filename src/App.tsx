import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Page = { image: string; audio?: string; text: string };
type Booklet = {
  icon: string; cover: string; coverBackground: string;
  title: string; coverTitle: string; author: string; pages: Page[];
};

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
  const [flipping, setFlipping] = useState(false);
  const [flipDir, setFlipDir] = useState<"forward" | "backward" | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const lastPlayed = useRef<number>(-1);

  const atCover = idx === 0;
  const atEnd = idx === total - 1;
  const src = useCallback((i: number) => (i === 0 ? `${dir}/${booklet.cover}` : `${dir}/${pages[i - 1].image}`), [dir, booklet.cover, pages]);
  const audioSrc = useCallback((i: number) => (i > 0 && pages[i - 1].audio ? `${dir}/${pages[i - 1].audio}` : null), [dir, pages]);

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
    if (flipping) return;
    if (idx <= 0) { lastPlayed.current = -1; stopAudio(); return; }
    playFor(idx);
  }, [idx, flipping, playFor, stopAudio]);

  const settle = (n: number) => { setIdx(n); setFlipping(false); setFlipDir(null); };
  const forward = () => {
    if (idx >= total - 1 || flipping) return;
    stopAudio(); lastPlayed.current = -1;
    setFlipDir("forward"); setFlipping(true);
    setTimeout(() => settle(idx + 1), 720);
  };
  const backward = () => {
    if (idx <= 0 || flipping) return;
    stopAudio(); lastPlayed.current = -1;
    setFlipDir("backward"); setFlipping(true);
    setTimeout(() => settle(idx - 1), 720);
  };
  const restart = () => { if (flipping) return; stopAudio(); lastPlayed.current = -1; setIdx(0); };

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

  const flippingTo = flipDir === "forward" ? idx + 1 : idx - 1;
  const sheetClass = ["story-book-sheet", atCover && !flipping ? "story-book-closed" : "", flipping ? "story-book-flipping" : ""].filter(Boolean).join(" ");

  return (
    <div className="story-booklet-view" dir="rtl">
      <div className="story-top-bar">
        <h2 className="story-title">{booklet.icon} {booklet.title}</h2>
        {atEnd && !atCover && (
          <button type="button" className="story-restart-button" onClick={restart} disabled={flipping}>חזור להתחלה</button>
        )}
      </div>
      <div className="story-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={onClick}>
        <div className={atCover && !flipping ? "story-book-perspective story-book-perspective-closed" : "story-book-perspective"}>
          <div className={sheetClass}>
            {flipping ? (
              <>
                {/* static under-layer: where we are going */}
                {flippingTo === 0 ? (
                  <ClosedCover booklet={booklet} src={src(0)} />
                ) : flippingTo > idx ? (
                  <Spread left={src(Math.max(1, flippingTo))} />
                ) : (
                  <Spread left={src(Math.max(1, flippingTo))} />
                )}
                {/* the turning sheet */}
                <div className={flipDir === "forward" ? "story-flip-layer page-flip-forward" : "story-flip-layer page-flip-backward"}>
                  {idx === 0 ? <ClosedCover booklet={booklet} src={src(0)} /> : <Spread left={src(idx)} />}
                </div>
              </>
            ) : atCover ? (
              <ClosedCover booklet={booklet} src={src(0)} />
            ) : (
              <Spread left={src(idx)} />
            )}
            {idx < total - 1 && !flipping && (
              <div className="story-page-corner corner-left" onClick={(e) => { e.stopPropagation(); forward(); }}>
                <div className="story-corner-fold corner-fold-left" />
              </div>
            )}
            {idx > 0 && !flipping && (
              <div className="story-page-corner corner-right" onClick={(e) => { e.stopPropagation(); backward(); }}>
                <div className="story-corner-fold corner-fold-right" />
              </div>
            )}
          </div>
        </div>
      </div>
      {!atCover && !flipping && pages[idx - 1]?.text && (
        <div className="story-text-strip">{pages[idx - 1].text.split("\n").map((ln, i) => <p key={i}>{ln}</p>)}</div>
      )}
      {needsTap && !flipping && (
        <button type="button" className="story-listen-button" onClick={listenTap} onTouchEnd={(e) => e.stopPropagation()}>🔊 הַקִּישׁוּ לִשְׁמֹעַ</button>
      )}
      <div className="story-page-indicator">{idx === 0 ? "כריכה" : `${idx} / ${pages.length}`}</div>
      <audio ref={audioRef} preload="metadata" />
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

function Spread({ left }: { left: string }) {
  // one wide 3:1 illustration spanning the two pages of the open book
  return (
    <div className="story-open-book">
      <div className="story-page story-page-left">
        <div className="story-page-clip"><img className="story-spread-image" src={left} alt="" draggable={false} style={{ left: "0" }} /></div>
      </div>
      <div className="story-page story-page-right">
        <div className="story-page-clip"><img className="story-spread-image" src={left} alt="" draggable={false} style={{ left: "-100%" }} /></div>
      </div>
      <div className="story-spine" aria-hidden="true" />
    </div>
  );
}

function RotatePrompt() {
  return (
    <div className="rotate-prompt" role="dialog" aria-label="סובבו את המכשיר">
      <span className="rotate-prompt-emoji" aria-hidden="true">📱</span>
      <p>סוֹבְבוּ אֶת הַמַּכְשִׁיר לְרֹוחַב</p>
    </div>
  );
}

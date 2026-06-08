"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { useFullscreen } from "@/lib/hooks/useFullscreen";
import { EscortHeader } from "./EscortHeader";
import { CaptionBar } from "./overlays/CaptionBar";
import { Countdown } from "./overlays/Countdown";
import { DooringFlash } from "./overlays/DooringFlash";
import { LiveDot } from "./overlays/LiveDot";
import { ShotProgress } from "./overlays/ShotProgress";
import { buildCaption, SHOTS } from "./sequence.config";
import { useCameraFrame } from "./useCameraFrame";
import { useEscortSequence } from "./useEscortSequence";

type Props = { onClose: () => void };

export function GateSequenceView({ onClose }: Props) {
  const { phase, cam, secsToLower, dooring, abort } = useEscortSequence(onClose);
  const { detect, detectError, toggleDetect, onDetectError, source } =
    useCameraFrame(cam);

  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);

  const activeIndex = SHOTS.findIndex((s) => s.cam === cam);
  const showCountdown =
    phase === "upper" ||
    phase === "ramp" ||
    phase === "road" ||
    phase === "lower";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      ref={rootRef}
      className={cn(
        "z-50 overflow-hidden border border-zinc-700 bg-zinc-900 shadow-2xl",
        isFullscreen
          ? "flex h-screen w-screen flex-col rounded-none border-0"
          : "fixed bottom-28 left-1/2 w-[460px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl"
      )}
    >
      <EscortHeader
        detect={detect}
        onToggleDetect={toggleDetect}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onClose={abort}
      />

      {/* video */}
      <div
        className={cn(
          "relative w-full overflow-hidden bg-black",
          isFullscreen ? "flex-1" : "aspect-video"
        )}
      >
        {/* Film cut between shots: each camera change crossfades + gently
            pushes in. Keyed by `cam` so the every-400ms live refresh within a
            shot doesn't re-trigger it. */}
        <AnimatePresence>
          <motion.div
            key={cam}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            {source.kind === "detect" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={source.url}
                alt="זיהוי אובייקטים — שידור חי"
                onError={onDetectError}
                className="block h-full w-full object-cover"
              />
            ) : source.kind === "raw" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={source.url}
                alt="שידור חי"
                className="block h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
                מתחבר למצלמה…
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* big countdown — runs from the upper shot through the ramp, the
            driveway, and the lower-gate approach, staying visible until the
            door opens */}
        {showCountdown && <Countdown secs={secsToLower} />}

        {/* "פותח דלת" — flashes big-centered when the lower gate opens */}
        {dooring && <DooringFlash />}

        <CaptionBar text={buildCaption(phase, secsToLower)} />

        <LiveDot label={SHOTS[activeIndex]?.label} live={detect && !detectError} />
      </div>

      {/* shot progress dots + abort */}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <ShotProgress activeIndex={activeIndex} />
        <button
          type="button"
          onClick={abort}
          className="rounded-full px-4 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
        >
          עצור רצף
        </button>
      </div>
    </motion.div>
  );
}

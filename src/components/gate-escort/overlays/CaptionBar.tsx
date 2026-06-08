/** Bottom gradient caption describing the current phase. */
export function CaptionBar({ text }: { text: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-3 pt-8 pb-2">
      <span className="text-sm font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
        {text}
      </span>
    </div>
  );
}

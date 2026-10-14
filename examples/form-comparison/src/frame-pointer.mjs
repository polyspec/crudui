/**
 * Whether the pointer is over a comparison frame. A pointer can rest over one frame only, and
 * no page style keeps `:hover` out of a frame in every browser, so a column captured while
 * the pointer is over it would differ by the person's pointer, not by its rendering.
 */
export function pointerOverFrame(frame) {
  return frame.contentDocument.documentElement.matches(':hover');
}

/**
 * Throws `message` while the pointer is over one of `frames`: a capture requires the pointer outside both frames
 * (docs/spec/form-comparison.md), so the comparison stops without a result and asks to move the pointer.
 */
export function requirePointerOutside(frames, message) {
  if (frames.some(pointerOverFrame)) throw new Error(message);
}

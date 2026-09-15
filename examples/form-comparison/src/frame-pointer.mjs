/**
 * Whether the pointer is over a comparison frame. A pointer can rest over one frame only, and
 * no page style keeps `:hover` out of a frame in every browser, so a column captured while
 * the pointer is over it would differ by the person's pointer, not by its rendering.
 */
export function pointerOverFrame(frame) {
  return frame.contentDocument.documentElement.matches(':hover');
}

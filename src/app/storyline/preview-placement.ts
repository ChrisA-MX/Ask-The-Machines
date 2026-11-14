export interface PreviewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PreviewSize { width: number; height: number }
export type PreviewSide = 'above' | 'below' | 'right' | 'left';

export interface PreviewPlacement {
  left: number;
  top: number;
  side: PreviewSide;
  arrowOffset: number;
}

/** Chooses the first viewport-safe card side, clamping it around screen edges and a floating control. */
export function placePreviewCard(
  node: PreviewRect,
  card: PreviewSize,
  viewport: PreviewSize,
  obstacle?: PreviewRect | readonly PreviewRect[] | null,
  padding = 14,
  gap = 12,
): PreviewPlacement {
  const minLeft = padding;
  const maxLeft = Math.max(padding, viewport.width - card.width - padding);
  const minTop = padding;
  const maxTop = Math.max(padding, viewport.height - card.height - padding);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const obstacles = obstacle ? (Array.isArray(obstacle) ? obstacle : [obstacle]) : [];
  const verticalOrder: PreviewSide[] = (node.top + node.height / 2) >= viewport.height / 2
    ? ['above', 'below', 'right', 'left']
    : ['below', 'above', 'right', 'left'];
  const candidates: Array<PreviewPlacement & { overlap: number }> = [];

  for (const side of verticalOrder) {
    const desiredLeft = side === 'right'
      ? node.right + gap
      : side === 'left'
        ? node.left - card.width - gap
        : node.left + node.width / 2 - card.width / 2;
    const desiredTop = side === 'above'
      ? node.top - card.height - gap
      : side === 'below'
        ? node.bottom + gap
        : node.top + node.height / 2 - card.height / 2;

    // Above and below must actually fit in that direction; lateral options may clamp vertically.
    if ((side === 'above' && desiredTop < minTop) || (side === 'below' && desiredTop > maxTop)) continue;
    const leftOptions = [
      clamp(desiredLeft, minLeft, maxLeft),
      clamp(node.left + node.width / 2 - card.width / 2, minLeft, maxLeft),
      minLeft,
      maxLeft,
    ];
    if (obstacles.length) {
      leftOptions.push(
        ...obstacles.flatMap((entry) => [
          clamp(entry.left - card.width - gap, minLeft, maxLeft),
          clamp(entry.right + gap, minLeft, maxLeft),
        ]),
      );
    }
    const uniqueLefts = [...new Set(leftOptions)].sort((a, b) => Math.abs(a - desiredLeft) - Math.abs(b - desiredLeft));
    const top = clamp(desiredTop, minTop, maxTop);

    for (const left of uniqueLefts) {
      const overlap = obstacles.reduce((total, entry) => total + overlapArea({ left, top, width: card.width, height: card.height }, entry), 0);
      const arrowOffset = side === 'above' || side === 'below'
        ? clamp(node.left + node.width / 2 - left, 18, Math.max(18, card.width - 18))
        : clamp(node.top + node.height / 2 - top, 18, Math.max(18, card.height - 18));
      const candidate = { left, top, side, arrowOffset, overlap };
      candidates.push(candidate);
      if (overlap === 0) return { left, top, side, arrowOffset };
    }
  }

  // If every side intersects the floating chat launcher, keep the card visible and minimize the overlap.
  const best = candidates.sort((a, b) => a.overlap - b.overlap)[0];
  return best
    ? { left: best.left, top: best.top, side: best.side, arrowOffset: best.arrowOffset }
    : {
        left: clamp(node.left + node.width / 2 - card.width / 2, minLeft, maxLeft),
        top: clamp(node.bottom + gap, minTop, maxTop),
        side: 'below',
        arrowOffset: clamp(card.width / 2, 18, Math.max(18, card.width - 18)),
      };
}

function overlapArea(a: { left: number; top: number; width: number; height: number }, b: PreviewRect): number {
  const width = Math.max(0, Math.min(a.left + a.width, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

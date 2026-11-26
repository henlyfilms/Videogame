/**
 * Minimal CanvasRenderingContext2D stand-in for jsdom. Every method is a no-op,
 * measureText returns a plausible width, gradients are chainable.
 */
export function makeMockContext(canvas?: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const state: Record<string | symbol, unknown> = {
    canvas,
    measureText: (t: string) => ({ width: t.length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false,
  };
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

export function installCanvasMock(): void {
  if (typeof HTMLCanvasElement === 'undefined') return;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: function (this: HTMLCanvasElement) {
      const self = this as HTMLCanvasElement & { __ctx?: CanvasRenderingContext2D };
      if (!self.__ctx) self.__ctx = makeMockContext(this);
      return self.__ctx;
    },
  });
}

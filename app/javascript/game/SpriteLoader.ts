const cache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export function getImage(src: string): HTMLImageElement | undefined {
  return cache.get(src);
}

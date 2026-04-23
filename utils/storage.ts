export function getMarketedStorage(bytes: number): number {
    const gb = bytes / 1e9;
  
    const sizes = [64, 128, 256, 512, 1024, 2048];
  
    return sizes.reduce((best, curr) =>
      Math.abs(curr - gb) < Math.abs(best - gb) ? curr : best
    );
  }

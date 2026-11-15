// ID generation. The app installs expo-crypto's randomUUID at startup;
// tests use Node's crypto. The fallback is only for environments with neither.

let generator: () => string = () => {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

export function setIdGenerator(fn: () => string) {
  generator = fn;
}

export function newId(): string {
  return generator();
}

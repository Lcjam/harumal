export {};

declare global {
  interface Window {
    Kakao?: {
      init(key: string): void;
      isInitialized(): boolean;
      Share: {
        sendDefault(payload: Record<string, unknown>): void;
      };
    };
  }
}

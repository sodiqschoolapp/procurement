// The part of heic-decode 2.1.0 the app uses (src/server/files/process.ts). The package ships no
// types; written here rather than adding @types/heic-decode as one more dependency.
declare module "heic-decode" {
  type Pixels = { width: number; height: number; data: Uint8ClampedArray };
  type Image = { width: number; height: number; decode(): Promise<Pixels> };
  type Decode = {
    (input: { buffer: Uint8Array }): Promise<Pixels>;
    all(input: { buffer: Uint8Array }): Promise<Image[] & { dispose(): void }>;
  };
  const decode: Decode;
  export default decode;
}

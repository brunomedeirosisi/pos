declare module 'extract-zip' {
  interface Options {
    dir?: string | URL;
    defaultDirMode?: number;
    defaultFileMode?: number;
    onEntry?: (entry: { fileName: string; type: string }) => void;
  }

  function extractZip(source: string, options?: Options): Promise<void>;

  export = extractZip;
}

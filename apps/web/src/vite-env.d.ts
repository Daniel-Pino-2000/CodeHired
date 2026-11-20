/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The API's URL when it isn't served under /api on the web app's own origin
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

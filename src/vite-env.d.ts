/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Public URL of the Typhoon proxy Worker (…/v1). The API key lives only in the Worker. */
  readonly VITE_TYPHOON_PROXY_URL?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }

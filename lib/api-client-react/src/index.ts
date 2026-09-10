export * from "./generated/api";
export * from "./generated/api.schemas";
export { QueryClient, QueryClientProvider } from "@tanstack/react-query";
export { setBaseUrl, setAuthFailureHandler, setAuthTokenGetter } from "./custom-fetch";
export type { AuthFailureHandler, AuthTokenGetter } from "./custom-fetch";

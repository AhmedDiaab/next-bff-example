import { randomUUID } from "node:crypto";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HTTPClientOptions = {
    baseUrl: string;
    defaultHeaders?: Record<string, string>;
    retries?: number;
    retryStatuses?: number[];
    defaultTimeoutMs?: number;
};

export type RequestInitEx = {
    headers?: Record<string, string>;
    query?: Record<string, string | number | boolean | undefined>;
    json?: unknown;
    timeoutMs?: number;
    authToken?: string | null;
    cache?: RequestCache;
};

export type HttpResponse<T> = {
    data: T;
    status: number;
    headers: Headers;
};

class HTTPError extends Error {
    status?: number;
    response?: HttpResponse<unknown>;

    constructor(message: string, status?: number, response?: HttpResponse<unknown>) {
        super(message);
        this.name = "HTTPError";
        this.status = status;
        this.response = response;
    }
}

export class HttpClient {
    private baseUrl: string;
    private defaultHeaders: Record<string, string>;
    private retries: number;
    private retryStatuses: Set<number>;
    private defaultTimeoutMs: number;

    constructor({
        baseUrl,
        defaultHeaders = {},
        retries = 2,
        retryStatuses = [408, 429, 502, 503, 504],
        defaultTimeoutMs = 5000,
    }: HTTPClientOptions) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.defaultHeaders = defaultHeaders;
        this.retries = retries;
        this.retryStatuses = new Set(retryStatuses);
        this.defaultTimeoutMs = defaultTimeoutMs;
    }

    get<T>(path: string, init?: RequestInitEx) {
        return this.request<T>("GET", path, init);
    }

    post<T>(path: string, init?: RequestInitEx) {
        return this.request<T>("POST", path, init);
    }

    put<T>(path: string, init?: RequestInitEx) {
        return this.request<T>("PUT", path, init);
    }

    patch<T>(path: string, init?: RequestInitEx) {
        return this.request<T>("PATCH", path, init);
    }

    delete<T>(path: string, init?: RequestInitEx) {
        return this.request<T>("DELETE", path, init);
    }

    private async request<T>(method: HttpMethod, path: string, init: RequestInitEx = {}): Promise<HttpResponse<T>> {
        const url = this.buildUrl(path, init.query);
        const headers = this.buildHeaders(init);
        const body = init.json !== undefined ? JSON.stringify(init.json) : undefined;
        const maxAttempts = Math.max(1, this.retries + 1);
        let lastError: unknown;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? this.defaultTimeoutMs);

            try {
                const response = await fetch(url, {
                    method,
                    headers,
                    body,
                    cache: init.cache,
                    signal: controller.signal,
                });

                if (this.shouldRetry(response.status, attempt, maxAttempts)) {
                    await this.backoff(attempt);
                    continue;
                }

                const data = await this.parseResponse(response);
                if (!response.ok) {
                    throw new HTTPError(`HTTP ${response.status} ${response.statusText}`, response.status, {
                        data,
                        status: response.status,
                        headers: response.headers,
                    });
                }

                return { data: data as T, status: response.status, headers: response.headers };
            } catch (error) {
                lastError = error;
                if (this.shouldRetryError(error, attempt, maxAttempts)) {
                    await this.backoff(attempt);
                    continue;
                }
                throw error instanceof Error ? error : new HTTPError("Unknown HTTP error");
            } finally {
                clearTimeout(timeout);
            }
        }

        throw lastError instanceof Error ? lastError : new HTTPError("Request failed");
    }

    private buildUrl(path: string, query?: RequestInitEx["query"]): string {
        const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
        if (query) {
            const params = new URLSearchParams();
            Object.entries(query).forEach(([key, value]) => {
                if (value !== undefined) params.append(key, String(value));
            });
            url.search = params.toString();
        }
        return url.toString();
    }

    private buildHeaders(init: RequestInitEx): Headers {
        const headers = new Headers({ ...this.defaultHeaders, ...init.headers });

        if (!headers.has("x-request-id")) {
            headers.set("x-request-id", randomUUID());
        }

        if (init.authToken) {
            headers.set("Authorization", `Bearer ${init.authToken}`);
        }

        if (init.json !== undefined && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        return headers;
    }

    private async parseResponse(response: Response): Promise<unknown> {
        const contentType = response.headers.get("content-type") || "";
        if (response.status === 204) return undefined;
        if (contentType.includes("application/json")) return response.json();
        return response.text();
    }

    private shouldRetry(status: number, attempt: number, maxAttempts: number): boolean {
        return this.retryStatuses.has(status) && attempt < maxAttempts - 1;
    }

    private shouldRetryError(error: unknown, attempt: number, maxAttempts: number): boolean {
        const isAbortError = (error as any)?.name === "AbortError" || (error as any)?.status === 408;
        return attempt < maxAttempts - 1 && (isAbortError || this.isNetworkError(error));
    }

    private async backoff(attempt: number): Promise<void> {
        const base = 300;
        const cap = 4000;
        const maxDelay = Math.min(cap, base * 2 ** attempt);
        const delay = Math.floor(Math.random() * (maxDelay + 1));
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    private isNetworkError(error: unknown): boolean {
        return error instanceof TypeError || (error as any)?.name === "FetchError";
    }
}
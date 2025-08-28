import { env } from "../env";
import { HTTPClient } from "./http";

export const apis = {
    users: new HTTPClient({
        baseUrl: env.USERS_API,
        retries: 2,
        defaultTimeoutMs: 5000,
    }),
    billing: new HTTPClient({
        baseUrl: env.BILLING_API,
        retries: 2,
        defaultTimeoutMs: 5000,
    }),
};

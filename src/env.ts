import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        USERS_API: z.url(),
        BILLING_API: z.url(),
        NEXTAUTH_SECRET: z.string().min(32),
        OIDC_WELL_KNOWN: z.url().optional(),
        NEXTAUTH_URL: z.url().optional(),
        OIDC_CLIENT_ID: z.string().min(1),
        OIDC_CLIENT_SECRET: z.string().min(1),
    },
    client: {
        NEXT_PUBLIC_APP_NAME: z.string().optional(),
    },
    runtimeEnv: {
        USERS_API: process.env.USERS_API,
        BILLING_API: process.env.BILLING_API,
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
        OIDC_WELL_KNOWN: process.env.OIDC_WELL_KNOWN,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
        OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
        OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET,
        NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    },
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});

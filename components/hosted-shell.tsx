"use client";

import dynamic from "next/dynamic";
export { AccountRow } from "@/components/account-row";

// A client import boundary keeps the SDK out of local-mode startup. Server
// auth and tenant reads remain in the layout, pages, middleware and API routes.
export const HostedProvider = dynamic(() => import("@/components/hosted-provider").then((module) => module.HostedClientProvider));

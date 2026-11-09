/** GET the open-thread count of every note that has open threads (feature 024, the sidebar's dots). */
import { notebookSummaryResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async () => notebookSummaryResponse());

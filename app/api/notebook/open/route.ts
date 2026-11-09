/** POST: the note bare /notebook opens, as `{ href }` (feature 028: the mode switch goes straight there). */
import { notebookOpenResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const POST = withTenant(async () => notebookOpenResponse());

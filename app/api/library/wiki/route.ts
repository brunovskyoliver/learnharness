/** What the editor needs to draw wiki links (feature 016). */
import { wikiCatalogResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (request: Request) => wikiCatalogResponse(request));

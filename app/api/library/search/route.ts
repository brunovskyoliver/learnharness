/** GET full-text search over the Library (feature 019). Never parses on this path. */
import { documentSearchResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant((request: Request) => documentSearchResponse(request));

/** GET lists the trash; POST moves an item or folder there (feature 012). */
import { libraryTrashListResponse, libraryTrashResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(() => libraryTrashListResponse());
export const POST = withTenant(async (request: Request) => libraryTrashResponse(request));

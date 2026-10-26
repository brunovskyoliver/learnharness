/**
 * /api/files — hosted uploads: GET lists, POST (multipart "files") saves,
 * DELETE ?name= removes. The agent's fs tools read only this folder in
 * hosted mode. 404 outside hosted mode (desktop reads the learner's home).
 */
import { filesResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(filesResponse);
export const POST = withTenant(filesResponse);
export const DELETE = withTenant(filesResponse);

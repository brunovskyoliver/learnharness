/** PATCH an annotation's note; DELETE removes the highlight (feature 020). */
import { annotationDeleteResponse, annotationPatchResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; annotationId: string }> };

export const PATCH = withTenant(async (request: Request, ctx: Context) => {
	const { id, annotationId } = await ctx.params;
	return annotationPatchResponse(request, id, annotationId);
});
export const DELETE = withTenant(async (_request: Request, ctx: Context) => {
	const { id, annotationId } = await ctx.params;
	return annotationDeleteResponse(id, annotationId);
});

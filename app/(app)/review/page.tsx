import { ReviewView } from "@/components/review/review-view";
import { RouteExit } from "@/components/paper/route-content";
import { withTenantPage } from "@/src/server";

export const dynamic = "force-dynamic";

/** Flashcards and the daily queue (feature 021). The client view fetches, so no
 *  card reaches the first response, and its code loads with this route alone. */
async function ReviewPage() {
	return <RouteExit><ReviewView /></RouteExit>;
}

export default withTenantPage(ReviewPage);

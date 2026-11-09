import { LibraryView } from "@/components/library/library-view";
import { RouteExit } from "@/components/paper/route-content";
import { withTenantPage } from "@/src/server";

export const dynamic = "force-dynamic";

/** The full Library view (feature 009). The client view fetches the list, so
 *  loading, failed and retry stay in one place. */
async function LibraryPage() {
	return <RouteExit><LibraryView /></RouteExit>;
}

export default withTenantPage(LibraryPage);

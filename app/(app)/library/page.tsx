import { LibraryView } from "@/components/library/library-view";
import { withTenantPage } from "@/src/server";

export const dynamic = "force-dynamic";

/** The full Library view (feature 009). The client view fetches the list, so
 *  loading, failed and retry stay in one place. */
async function LibraryPage() {
	return <LibraryView />;
}

export default withTenantPage(LibraryPage);

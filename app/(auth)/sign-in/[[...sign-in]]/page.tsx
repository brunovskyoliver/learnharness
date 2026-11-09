import { notFound } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { hostedMode } from "@/src/server";
import { RouteContent } from "@/components/paper/route-content";

export const dynamic = "force-dynamic";

export default function SignInPage() {
	if (!hostedMode()) notFound();
	return (
		<main className="flex min-h-dvh items-center justify-center">
			{/* The page inks in as one on arrival (feature 028); Clerk's widget itself is not animated. */}
			<RouteContent><SignIn /></RouteContent>
		</main>
	);
}

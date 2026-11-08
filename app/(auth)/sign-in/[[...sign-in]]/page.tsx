import { notFound } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { hostedMode } from "@/src/server";

export const dynamic = "force-dynamic";

export default function SignInPage() {
	if (!hostedMode()) notFound();
	return (
		<main className="flex min-h-dvh items-center justify-center">
			<SignIn />
		</main>
	);
}

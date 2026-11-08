import { notFound } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { hostedMode } from "@/src/server";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
	if (!hostedMode()) notFound();
	return (
		<main className="flex min-h-dvh items-center justify-center">
			<SignUp />
		</main>
	);
}

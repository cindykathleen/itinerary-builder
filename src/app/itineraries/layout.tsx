import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import CloseMenusOnOutsideClick from "./CloseMenusOnOutsideClick";

export default async function ItinerariesLayout({
  children,
}: LayoutProps<"/itineraries">) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <>
      <CloseMenusOnOutsideClick />
      {children}
    </>
  );
}

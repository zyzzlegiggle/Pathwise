/* eslint-disable react-hooks/rules-of-hooks */
// app/app/page.tsx  (protected landing)
import { getCurrentUser } from "@/lib/current-user";
import CareerAgentUI from "../app/page";

export default async function ProtectedAppPage() {
  const me = await getCurrentUser();
  // me contains { id, email, name } if needed
  return <CareerAgentUI />;
}

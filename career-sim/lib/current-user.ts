import { cookies } from "next/headers";
import { verifyJwt } from "./auth";

export async function getCurrentUser() {
  const cookieStore = await cookies(); // await the cookies() Promise
  const token = cookieStore.get("auth_token")?.value;

  if (!token) return null;
  try {
    const payload = await verifyJwt(token);
    return {
      id: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string | undefined,
    };
  } catch {
    return null;
  }
}

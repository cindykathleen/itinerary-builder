import type { NextRequest } from "next/server";
import { yoga } from "@/lib/graphql/yoga";

const { handleRequest } = yoga;

function handle(request: NextRequest) {
  return handleRequest(request, {});
}

export { handle as GET, handle as POST, handle as OPTIONS };

import { yoga } from "@/lib/graphql/yoga";

const { handleRequest } = yoga;

export { handleRequest as GET, handleRequest as POST, handleRequest as OPTIONS };

import { timingSafeEqual } from "node:crypto";

export function isAuthorizedApiRequest(header: string | string[] | undefined): boolean {
  const expected = process.env.CHANNELSWARM_API_TOKEN;
  if (!expected || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

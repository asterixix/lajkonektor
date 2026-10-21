export function adresMcp(origin: string): string {
  return origin.replace(/\/+$/, "") + "/mcp";
}

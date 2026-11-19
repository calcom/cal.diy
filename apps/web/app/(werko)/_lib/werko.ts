// biome-ignore lint/correctness/noProcessGlobal: Next inlines NEXT_PUBLIC_* into client code only via process.env
// biome-ignore lint/style/noProcessEnv: same as above
export const WERKO_WEB_URL = process.env.NEXT_PUBLIC_WERKO_WEB_URL ?? "https://werko.cz";

export const werkoWebPath = (path = "") => `${WERKO_WEB_URL}/cs${path}`;

/** A room is a Cal.diy user with the ADMIN role; its profile page lists the room's booking options */
export const roomPath = (username: string) => `/${encodeURIComponent(username)}`;

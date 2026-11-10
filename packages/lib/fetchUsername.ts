type ResponseUsernameApi = {
  available: boolean;
  message?: string;
  suggestion?: string;
};

export async function fetchUsername(username: string, orgSlug: string | null) {
  const response = await fetch("/api/username", {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({
      username: username.trim(),
      orgSlug: orgSlug ?? undefined,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data = (await response.json()) as ResponseUsernameApi;
  return { response, data };
}

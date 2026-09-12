const SQUADCAST_API_BASE = "https://api.squadcast.fm/v2";

export interface SquadCastInviteLinks {
  shortLink: string;
  previewLink: string;
}

export interface SquadCastStageMember {
  email: string;
  inviteLinks: SquadCastInviteLinks;
}

export interface SquadCastSessionResponse {
  sessionID: string;
  sessionTitle: string;
  showID: string;
  showTitle: string;
  showImg: string | null;
  orgID: string;
  date: string;
  startTimestamp: number;
  startTime: string;
  endTime: string;
  invites: {
    stage: string[] | null;
    viewer: string[] | null;
  };
  videoEnabled: boolean;
  favorite: boolean;
  take: number;
  stage: SquadCastStageMember[];
  viewer: unknown[];
}

export interface SquadCastSessionCreateParams {
  date: string;
  startTime: string;
  endTime: string;
  sessionTitle: string;
  stage?: string[];
}

export async function validateToken(apiToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${SQUADCAST_API_BASE}/organizations`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createSession(
  apiToken: string,
  params: SquadCastSessionCreateParams
): Promise<SquadCastSessionResponse> {
  const formData = new URLSearchParams();
  formData.append("sessionTitle", params.sessionTitle);
  formData.append("date", params.date);
  formData.append("startTime", params.startTime);
  formData.append("endTime", params.endTime);
  params.stage?.forEach((email) => {
    formData.append("stage", email);
  });

  const res = await fetch(`${SQUADCAST_API_BASE}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create SquadCast session: ${res.status} ${body}`);
  }

  try {
    return (await res.json()) as SquadCastSessionResponse;
  } catch {
    throw new Error(`Failed to parse SquadCast API response: ${res.status}`);
  }
}

export async function deleteSession(apiToken: string, sessionId: string): Promise<void> {
  const res = await fetch(`${SQUADCAST_API_BASE}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to delete SquadCast session: ${res.status} ${body}`);
  }
}

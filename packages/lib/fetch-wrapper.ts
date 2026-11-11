import { HttpError } from "./http-error";

async function getErrorBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length === 0) {
    return { message: response.statusText || response.status.toString() };
  }
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
    return { message: text };
  } catch {
    return { message: text };
  }
}

async function http<T>(path: string, config: RequestInit): Promise<T> {
  const request = new Request(path, config);
  const response: Response = await fetch(request);

  if (!response.ok) {
    const parsedError = await getErrorBody(response);
    const message =
      typeof parsedError.message === "string" && parsedError.message.length > 0
        ? parsedError.message
        : response.statusText || response.status.toString();
    const err = HttpError.fromRequest(
      request,
      {
        url: response.url,
        status: response.status,
        statusText: message,
      },
      parsedError
    );
    throw err;
  }
  try {
    return await response.json();
  } catch {
    throw new Error(
      `Failed to parse response as JSON: ${response.status} ${response.statusText}`
    );
  }
}

export async function get<T>(path: string, config?: RequestInit): Promise<T> {
  const init = { method: "GET", ...config };
  return await http<T>(path, init);
}

export async function post<T, U>(path: string, body: T, config?: RequestInit): Promise<U> {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...config,
  };
  return await http<U>(path, init);
}

export async function put<T, U>(path: string, body: T, config?: RequestInit): Promise<U> {
  const init = {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...config,
  };
  return await http<U>(path, init);
}

export async function patch<T, U>(path: string, body: T, config?: RequestInit): Promise<U> {
  const init = {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...config,
  };
  return await http<U>(path, init);
}

export async function remove<T, U>(path: string, body: T, config?: RequestInit): Promise<U> {
  const init = {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...config,
  };
  return await http<U>(path, init);
}

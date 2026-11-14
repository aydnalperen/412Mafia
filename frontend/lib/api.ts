const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL) ||
  "http://127.0.0.1:8000";

export type Course = {
  id: string | number;
  name: string;
  description: string;
  created_at: string;
};

export type CreateCourseInput = {
  name: string;
  description: string;
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input.toString(), {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, `API error ${res.status}`, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export const coursesApi = {
  list: (): Promise<Course[]> => request(`${API_BASE}/api/courses/`),
  create: (input: CreateCourseInput): Promise<Course> =>
    request(`${API_BASE}/api/courses/`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  get: (id: string | number): Promise<Course> =>
    request(`${API_BASE}/api/courses/${encodeURIComponent(String(id))}/`),
};

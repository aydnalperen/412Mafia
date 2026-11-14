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
  const headers: Record<string, string> = {};
  // FormData carries its own multipart boundary; do not force a content type.
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(input.toString(), {
    headers: { ...headers, ...(init?.headers || {}) },
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

export type MaterialKind = "transcript" | "slides" | "exam" | "study";

export type Material = {
  id: string | number;
  kind: MaterialKind;
  file_name: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  error: string | null;
  created_at: string;
};

export type UploadMaterialInput = {
  file: File;
  kind: MaterialKind;
};

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: { code?: string; message?: string } } | null;
    if (body?.error?.message) {
      return body.error.code ? `${body.error.code}: ${body.error.message}` : body.error.message;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export const materialsApi = {
  list: (courseId: string | number): Promise<Material[]> =>
    request(`${API_BASE}/api/courses/${encodeURIComponent(String(courseId))}/materials/`),
  upload: (courseId: string | number, input: UploadMaterialInput): Promise<Material> => {
    const form = new FormData();
    form.append("file", input.file);
    form.append("kind", input.kind);
    return request(`${API_BASE}/api/courses/${encodeURIComponent(String(courseId))}/materials/`, {
      method: "POST",
      body: form,
    });
  },
};

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

export type TranscriptionStatus =
  | "queued"
  | "extracting_audio"
  | "transcribing"
  | "indexing"
  | "ready"
  | "failed";

export type TranscriptionJob = {
  id: string | number;
  status: TranscriptionStatus;
  error: string | null;
  progress: number;
  source_material_id: string | number | null;
  output_material_id: string | number | null;
  created_at: string;
};

export type TranscriptSegment = {
  id: string | number;
  text: string;
  sequence: number;
  start_seconds: number | null;
  end_seconds: number | null;
};

export type MaterialKind = "transcript" | "slides" | "exam" | "study" | "recording";

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
  kind: Exclude<MaterialKind, "recording">;
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
  upload: (
    courseId: string | number,
    input: UploadMaterialInput,
    signal?: AbortSignal,
  ): Promise<Material> => {
    const form = new FormData();
    form.append("file", input.file);
    form.append("kind", input.kind);
    return request(`${API_BASE}/api/courses/${encodeURIComponent(String(courseId))}/materials/`, {
      method: "POST",
      body: form,
      signal,
    });
  },
  transcript: (materialId: string | number): Promise<TranscriptSegment[]> =>
    request(`${API_BASE}/api/materials/${encodeURIComponent(String(materialId))}/transcript/`),
};

export type Question = {
  id: string | number;
  question_number: string;
  text: string;
  page_number: number | null;
  material_id: string | number;
  material_title: string;
};

export type QuestionSource = {
  chunk_id: string | number;
  text: string;
  material_title: string;
  material_kind: MaterialKind;
  page_number: number | null;
  start_seconds: number | null;
  end_seconds: number | null;
  score: number;
  reason: string;
  method: string;
};

export const questionsApi = {
  list: (courseId: string | number): Promise<Question[]> =>
    request(`${API_BASE}/api/courses/${encodeURIComponent(String(courseId))}/questions/`),
  sources: (questionId: string | number): Promise<QuestionSource[]> =>
    request(`${API_BASE}/api/questions/${encodeURIComponent(String(questionId))}/sources/`),
  analyzeSources: (questionId: string | number): Promise<QuestionSource[]> =>
    request(`${API_BASE}/api/questions/${encodeURIComponent(String(questionId))}/sources/`, { method: "POST" }),
};

export type CourseSource = {
  chunk_id: number;
  material_id: number;
  file_name: string;
  page_number: number | null;
  is_slide: boolean;
  start_seconds: number | null;
  end_seconds: number | null;
};

export type KnowledgeGraph = {
  openrouter_available: boolean;
  topics: {
    id: number;
    name: string;
    description: string;
    question_ids: number[];
    sources: (CourseSource & { text: string })[];
  }[];
};

function knowledgeUrl(courseId: string) {
  return `${API_BASE}/api/courses/${encodeURIComponent(courseId)}/knowledge/`;
}

export const knowledgeApi = {
  get: (courseId: string) => request<KnowledgeGraph>(knowledgeUrl(courseId)),
  generate: (courseId: string, mode: "local" | "openrouter") =>
    request<KnowledgeGraph>(`${knowledgeUrl(courseId)}generate/`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
};

export const recordingsApi = {
  list: (courseId: string | number): Promise<TranscriptionJob[]> =>
    request(`${API_BASE}/api/courses/${encodeURIComponent(String(courseId))}/recordings/`),
  upload: (
    courseId: string | number,
    file: File,
    signal?: AbortSignal,
  ): Promise<TranscriptionJob> => {
    const form = new FormData();
    form.append("file", file);
    return request(`${API_BASE}/api/courses/${encodeURIComponent(String(courseId))}/recordings/`, {
      method: "POST",
      body: form,
      signal,
    });
  },
  job: (id: string | number): Promise<TranscriptionJob> =>
    request(`${API_BASE}/api/transcription-jobs/${encodeURIComponent(String(id))}/`),
};

export type OralTurnFeedback = {
  accuracy: number;
  completeness: number;
  correct_points: string[];
  missing_points: string[];
  source_chunk_ids: number[];
};

export type OralTurn = {
  question: string;
  answer: string;
  feedback: OralTurnFeedback | null;
};

export type OralRevisionSource = {
  chunk_id: number;
  text: string;
  material_title: string;
  page_number: number | null;
  start_seconds: number | null;
  end_seconds: number | null;
};

export type OralReport = {
  strengths: string[];
  missing_concepts: string[];
  revision_sources: OralRevisionSource[];
};

export type OralSession = {
  id: string | number;
  course_id: string | number;
  question_id: string | number;
  status: "active" | "completed";
  current_question: string | null;
  sources: OralRevisionSource[];
  turns: OralTurn[];
  report: OralReport | null;
};

export type OralStartInput = {
  question_id: number;
};

export type OralAnswerInput = {
  answer: string;
  expected_turn: number;
};

export const oralApi = {
  start: (courseId: string | number, body: OralStartInput): Promise<OralSession> =>
    request(`${API_BASE}/api/courses/${encodeURIComponent(String(courseId))}/oral/start/`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  get: (sessionId: string | number): Promise<OralSession> =>
    request(`${API_BASE}/api/oral/${encodeURIComponent(String(sessionId))}/`),
  answer: (sessionId: string | number, body: OralAnswerInput): Promise<OralSession> =>
    request(`${API_BASE}/api/oral/${encodeURIComponent(String(sessionId))}/answer/`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export type FlashcardRating = "known" | "review_again";

export type Flashcard = {
  id: number;
  front: string;
  back: string;
  source: CourseSource;
  review_state: "new" | FlashcardRating;
};

type FlashcardOrigin = { topic_id: number } | { oral_session_id: number };

function flashcardsUrl(courseId: string) {
  return `${API_BASE}/api/courses/${encodeURIComponent(courseId)}/flashcards/`;
}

export const flashcardsApi = {
  list: (courseId: string) => request<Flashcard[]>(flashcardsUrl(courseId)),
  generate: (courseId: string, origin: FlashcardOrigin) =>
    request<Flashcard[]>(`${flashcardsUrl(courseId)}generate/`, {
      method: "POST",
      body: JSON.stringify(origin),
    }),
  review: (courseId: string, cardId: number, rating: FlashcardRating) =>
    request<Flashcard>(`${flashcardsUrl(courseId)}${cardId}/`, {
      method: "PATCH",
      body: JSON.stringify({ review_state: rating }),
    }),
};

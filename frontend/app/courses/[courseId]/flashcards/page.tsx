"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlashcardsWorkspace } from "@/components/course/flashcards-workspace";

export default function FlashcardsPage({
  params,
  searchParams,
}: {
  params: { courseId: string };
  searchParams: { oralSession?: string | string[] };
}) {
  const id = params.courseId;
  const router = useRouter();
  const rawSession =
    typeof searchParams.oralSession === "string"
      ? Number(searchParams.oralSession)
      : NaN;
  const oralSession =
    Number.isSafeInteger(rawSession) && rawSession > 0 ? rawSession : null;

  return (
    <main className="page container">
      <nav className="page-nav">
        <Link href={`/courses/${id}`} className="btn secondary small">
          &larr; Course overview
        </Link>
        <Link href={`/courses/${id}?tab=knowledge`} className="btn secondary small">
          Knowledge graph
        </Link>
        <Link href={`/courses/${id}?tab=oral`} className="btn secondary small">
          Oral exam
        </Link>
      </nav>

      <div className="page-header">
        <span className="eyebrow">Active Recall</span>
        <h1>Flashcards</h1>
        <p>
          Generate fill-in-the-blank study cards grounded in your course
          topics or completed oral exam reports.
        </p>
      </div>

      <FlashcardsWorkspace
        courseId={id}
        oralSession={oralSession}
        onOpenKnowledge={() => router.push(`/courses/${id}?tab=knowledge`)}
        onOpenOral={() => router.push(`/courses/${id}?tab=oral`)}
      />
    </main>
  );
}

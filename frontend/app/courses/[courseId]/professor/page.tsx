"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfessorWorkspace } from "@/components/course/professor-workspace";

export default function ProfessorPage({
  params,
}: {
  params: { courseId: string };
}) {
  const id = params.courseId;
  const router = useRouter();

  return (
    <main className="page container">
      <nav className="page-nav">
        <Link href={`/courses/${id}`} className="btn secondary small">
          &larr; Course overview
        </Link>
        <Link href={`/courses/${id}?tab=questions`} className="btn secondary small">
          Exam questions
        </Link>
        <Link href={`/courses/${id}?tab=oral`} className="btn secondary small">
          Oral exam
        </Link>
      </nav>

      <div className="page-header">
        <span className="eyebrow">Teaching Alignment &amp; Guidance</span>
        <h1>Professor insights &amp; feedback</h1>
        <p>
          Audit topic-to-exam coverage across lectures and slides, track recurring
          oral practice gaps, and publish source-grounded instructor feedback.
        </p>
      </div>

      <ProfessorWorkspace
        courseId={id}
        onOpenQuestions={() => router.push(`/courses/${id}?tab=questions`)}
        onOpenKnowledge={() => router.push(`/courses/${id}?tab=knowledge`)}
        onOpenMaterials={() => router.push(`/courses/${id}?tab=materials`)}
        onOpenOral={() => router.push(`/courses/${id}?tab=oral`)}
      />
    </main>
  );
}

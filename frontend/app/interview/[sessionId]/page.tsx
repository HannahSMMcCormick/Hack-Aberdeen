
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  completeInterview,
  getCurrentUser,
  getInterview,
  saveInterviewAnswer,
  type InterviewSession,
} from "@/lib/api";

export default function InterviewPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [interview, setInterview] =
    useState<InterviewSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInterview() {
      const token = sessionStorage.getItem("access_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const user = await getCurrentUser(token);

        if (user.role !== "candidate") {
          router.replace("/admin");
          return;
        }

        const result = await getInterview(token, sessionId);

        if (cancelled) return;

        setInterview(result);

        const firstUnanswered = result.questions.findIndex(
          (question) => !question.answer
        );

        const index =
          firstUnanswered === -1 ? 0 : firstUnanswered;

        setCurrentIndex(index);
        setDraft(result.questions[index]?.answer ?? "");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load interview."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInterview();

    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        Loading interview...
      </main>
    );
  }

  if (!interview) {
    return (
      <main className="min-h-screen p-8">
        <p role="alert" className="text-red-700">
          {error || "Interview not found."}
        </p>
        <button
          onClick={() => router.push("/candidate")}
          className="mt-4 rounded-lg border px-4 py-2"
        >
          Back to Dashboard
        </button>
      </main>
    );
  }

  const questions = interview.questions;
  const question = questions[currentIndex];

  const answeredCount = questions.filter(
    (item) => Boolean(item.answer?.trim())
  ).length;

  const completed = interview.status === "completed";
  const hasUnsavedChanges =
    question !== undefined &&
    draft !== (question.answer ?? "");

  function navigateTo(index: number) {
    if (saving || finishing) return;

    if (hasUnsavedChanges) {
      setError("Save your answer before changing questions.");
      return;
    }

    if (index < 0 || index >= questions.length) return;

    setCurrentIndex(index);
    setDraft(questions[index].answer ?? "");
    setError("");
    setSuccess("");
  }

  async function handleSave() {
    if (!question || completed) return;

    if (!draft.trim()) {
      setError("Please enter an answer before saving.");
      return;
    }

    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await saveInterviewAnswer(
        token,
        sessionId,
        question.id,
        draft.trim()
      );

      const updated = await getInterview(token, sessionId);
      setInterview(updated);
      setDraft(
        updated.questions.find((item) => item.id === question.id)
          ?.answer ?? draft.trim()
      );
      setSuccess("Answer saved successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save answer."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (completed || finishing || saving) return;

    if (hasUnsavedChanges) {
      setError("Save your current answer before completing.");
      return;
    }

    if (answeredCount !== questions.length) {
      setError("Answer all questions before completing.");
      return;
    }

    if (
      !window.confirm(
        "Complete your interview? You won't be able to edit answers afterward."
      )
    ) {
      return;
    }

    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setFinishing(true);
    setError("");
    setSuccess("");

    try {
      await completeInterview(token, sessionId);
      const updated = await getInterview(token, sessionId);
      setInterview(updated);
      setSuccess("Interview completed successfully!");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete interview."
      );
    } finally {
      setFinishing(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              Technical Interview
            </h1>
            <p className="mt-1 text-gray-600">
              Answer questions about your submitted project.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/candidate")}
            className="rounded-lg border px-4 py-2 hover:bg-gray-100"
          >
            Dashboard
          </button>
        </header>

        {error && (
          <p role="alert" className="rounded-lg bg-red-100 p-4 text-red-700">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="rounded-lg bg-green-100 p-4 text-green-700">
            {success}
          </p>
        )}

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Interview Progress</h2>
            <span className="text-sm text-gray-600">
              {answeredCount} / {questions.length} answered
            </span>
          </div>

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{
                width: `${
                  questions.length
                    ? (answeredCount / questions.length) * 100
                    : 0
                }%`,
              }}
            />
          </div>

          <p className="mt-3 text-sm">
            Status:{" "}
            <span className="font-medium">
              {completed ? "Completed" : "In progress"}
            </span>
          </p>
        </section>

        {question ? (
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-blue-700">
              Question {currentIndex + 1} of {questions.length}
            </p>

            <h2 className="mt-3 text-xl font-semibold">
              {question.question}
            </h2>

            <div className="mt-3 flex gap-2 text-sm text-gray-600">
              <span className="rounded-full bg-gray-100 px-3 py-1">
                {question.category}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1">
                {question.difficulty}
              </span>
            </div>

            <label
              htmlFor="interview-answer"
              className="mt-6 block font-medium"
            >
              Your Answer
            </label>

            <textarea
              id="interview-answer"
              rows={8}
              maxLength={20000}
              value={draft}
              disabled={completed || saving || finishing}
              onChange={(event) => {
                setDraft(event.target.value);
                setSuccess("");
              }}
              placeholder="Explain your reasoning and technical decisions..."
              className="mt-2 w-full rounded-lg border p-3 disabled:bg-gray-100"
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigateTo(currentIndex - 1)}
                disabled={currentIndex === 0 || saving || finishing}
                className="rounded-lg border px-4 py-2 disabled:opacity-50"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={
                  completed ||
                  saving ||
                  finishing ||
                  !draft.trim() ||
                  !hasUnsavedChanges
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Answer"}
              </button>

              <button
                type="button"
                onClick={() => navigateTo(currentIndex + 1)}
                disabled={
                  currentIndex === questions.length - 1 ||
                  saving ||
                  finishing
                }
                className="rounded-lg border px-4 py-2 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>
        ) : (
          <p>No interview questions are available.</p>
        )}

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Finish Interview
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            {completed
              ? "Your answers have been submitted. This interview is read-only."
              : "Save answers to every question before finishing."}
          </p>

          <button
            type="button"
            onClick={handleComplete}
            disabled={
              completed ||
              finishing ||
              saving ||
              questions.length === 0 ||
              answeredCount !== questions.length ||
              hasUnsavedChanges
            }
            className="mt-4 rounded-lg bg-green-700 px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {completed
              ? "Interview Completed"
              : finishing
                ? "Completing..."
                : "Complete Interview"}
          </button>
        </section>
      </div>
    </main>
  );
}

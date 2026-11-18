
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAssessments,
  getCurrentUser,
  updateAssessment,
  deleteAssessment,
  getAdminInterviews,
  getInterviewEvaluation,
  generateInterviewEvaluation,
  type Assessment,
  type User,
  type AdminInterview,
  type InterviewEvaluation,
} from "@/lib/api";

export default function AdminDashboard() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<AdminInterview[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] =
    useState<InterviewEvaluation | null>(null);
  const [evaluationBusyId, setEvaluationBusyId] =
    useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      const token = sessionStorage.getItem("access_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);

        if (currentUser.role !== "admin") {
          sessionStorage.removeItem("access_token");
          router.replace("/login");
          return;
        }

        const [data, interviewData] = await Promise.all([
  getAssessments(token),
  getAdminInterviews(token),
]);

        if (!cancelled) {
          setUser(currentUser);
            setAssessments(data);
            setInterviews(interviewData);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load dashboard. Please log in again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function logout() {
    sessionStorage.removeItem("access_token");
    router.replace("/login");
  }

  async function handlePublish(assessment: Assessment) {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setError("");
    setBusyId(assessment.id);

    try {
      const updated = await updateAssessment(token, assessment.id, {
        status: "published",
      });

      setAssessments((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to publish assessment."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(assessment: Assessment) {
    const confirmed = window.confirm(
      `Delete "${assessment.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setError("");
    setBusyId(assessment.id);

    try {
      await deleteAssessment(token, assessment.id);

      setAssessments((current) =>
        current.filter((item) => item.id !== assessment.id)
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete assessment."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleViewEvaluation(sessionId: string) {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setEvaluationError("");
    setSelectedEvaluation(null);
    setEvaluationBusyId(sessionId);

    try {
      const evaluation = await getInterviewEvaluation(
        token,
        sessionId
      );

      setSelectedEvaluation(evaluation);
    } catch (err) {
      setEvaluationError(
        err instanceof Error
          ? err.message
          : "Unable to load evaluation."
      );
    } finally {
      setEvaluationBusyId(null);
    }
  }

  async function handleGenerateEvaluation(sessionId: string) {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    const confirmed = window.confirm(
      "Generate an AI evaluation for this completed interview? " +
        "This will use OpenAI API credits."
    );

    if (!confirmed) return;

    setEvaluationError("");
    setSelectedEvaluation(null);
    setEvaluationBusyId(sessionId);

    try {
      const evaluation = await generateInterviewEvaluation(
        token,
        sessionId
      );

      setSelectedEvaluation(evaluation);

      // Refresh interview statuses and scores.
      const updatedInterviews = await getAdminInterviews(token);
      setInterviews(updatedInterviews);
    } catch (err) {
      setEvaluationError(
        err instanceof Error
          ? err.message
          : "Unable to generate evaluation."
      );

      // Refresh statuses even when generation fails.
      try {
        const updatedInterviews = await getAdminInterviews(token);
        setInterviews(updatedInterviews);
      } catch {
        // Preserve the original error.
      }
    } finally {
      setEvaluationBusyId(null);
    }
  }


  if (loading) {
    return <main className="p-8">Loading dashboard...</main>;
  }

  if (!user) {
    return (
      <main className="p-8">
        {error && (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        )}
        <button onClick={logout} className="mt-4 underline">
          Return to login
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl">

        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              PersonifyInterview
            </h1>
            <p className="mt-1 text-slate-600">
              Admin Dashboard
            </p>
          </div>

          <button
            onClick={logout}
            className="rounded-lg border px-4 py-2 hover:bg-slate-100"
          >
            Logout
          </button>
        </header>

        {error && (
          <p
            role="alert"
            className="mb-6 rounded-lg bg-red-50 p-4 text-red-700"
          >
            {error}
          </p>
        )}

        <section className="mb-8 rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Welcome back</p>
          <h2 className="text-xl font-semibold">
            {user.full_name}
          </h2>
          <p className="text-sm text-slate-500">
            {user.email}
          </p>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">
              Assessments ({assessments.length})
            </h2>

            <button
              onClick={() => router.push("/admin/assessments/new")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              + New Assessment
            </button>
          </div>

          {assessments.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-500">
              No assessments yet. Create your first assessment.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {assessments.map((assessment) => (
                <article
                  key={assessment.id}
                  className="rounded-xl border bg-white p-6 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold">
                      {assessment.title}
                    </h3>

                    <span
                      className={
                        assessment.status === "published"
                          ? "rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700"
                          : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                      }
                    >
                      {assessment.status}
                    </span>
                  </div>

                  <p className="text-sm font-medium text-blue-700">
                    {assessment.role}
                  </p>

                  <p className="mt-3 text-sm text-slate-600">
                    {assessment.description || "No description provided."}
                  </p>

                  <p className="mt-4 text-xs text-slate-400">
                    Created:{" "}
                    {new Date(
                      assessment.created_at
                    ).toLocaleDateString()}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === assessment.id}
                      onClick={() =>
                        router.push(
                          `/admin/assessments/${assessment.id}/edit`
                        )
                      }
                      className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      Edit
                    </button>

                    {assessment.status === "draft" && (
                      <button
                        type="button"
                        disabled={busyId === assessment.id}
                        onClick={() => handlePublish(assessment)}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {busyId === assessment.id
                          ? "Working..."
                          : "Publish"}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busyId === assessment.id}
                      onClick={() => handleDelete(assessment)}
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}



        </section>



        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">
              Interview Evaluations ({interviews.length})
            </h2>

            <button
              type="button"
              onClick={async () => {
                const token = sessionStorage.getItem("access_token");
                if (!token) {
                  router.replace("/login");
                  return;
                }

                setEvaluationError("");

                try {
                  setInterviews(await getAdminInterviews(token));
                } catch (err) {
                  setEvaluationError(
                    err instanceof Error
                      ? err.message
                      : "Unable to refresh interviews."
                  );
                }
              }}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100"
            >
              Refresh
            </button>
          </div>

          {evaluationError && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-red-50 p-4 text-red-700"
            >
              {evaluationError}
            </p>
          )}

          {interviews.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-500">
              No interview sessions yet.
            </div>
          ) : (
            <div className="space-y-4">
              {interviews.map((interview) => (
                <article
                  key={interview.session_id}
                  className="rounded-xl border bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {interview.candidate_name}
                      </h3>

                      <p className="text-sm text-slate-500">
                        {interview.candidate_email}
                      </p>

                      <p className="mt-2 text-sm">
                        <span className="font-medium">
                          Assessment:
                        </span>{" "}
                        {interview.assessment_title}
                      </p>

                      <p className="text-sm">
                        <span className="font-medium">
                          Project:
                        </span>{" "}
                        {interview.project_filename || "Unknown"}
                      </p>

                      <p className="mt-2 text-sm">
                        Interview:{" "}
                        <span className="font-medium">
                          {interview.interview_status}
                        </span>
                      </p>

                      <p className="text-sm">
                        Evaluation:{" "}
                        <span className="font-medium">
                          {interview.evaluation_status}
                        </span>
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-slate-500">
                        Overall score
                      </p>

                      <p className="text-3xl font-bold text-blue-700">
                        {interview.overall_score === null
                          ? "—"
                          : `${interview.overall_score}/100`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {interview.interview_status === "completed" &&
                      interview.evaluation_status === "not_started" && (
                        <button
                          type="button"
                          disabled={evaluationBusyId !== null}
                          onClick={() =>
                            handleGenerateEvaluation(
                              interview.session_id
                            )
                          }
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {evaluationBusyId === interview.session_id
                            ? "Generating..."
                            : "Generate Evaluation"}
                        </button>
                      )}

                    {interview.evaluation_status === "completed" && (
                      <button
                        type="button"
                        disabled={evaluationBusyId !== null}
                        onClick={() =>
                          handleViewEvaluation(
                            interview.session_id
                          )
                        }
                        className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        {evaluationBusyId === interview.session_id
                          ? "Loading..."
                          : "View Results"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {selectedEvaluation && (
            <div className="mt-8 rounded-xl border bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">
                    Evaluation Results
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Session: {selectedEvaluation.session_id}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedEvaluation(null)}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="rounded-lg bg-slate-50 p-5">
                <p className="text-sm text-slate-500">
                  Overall technical score
                </p>

                <p className="text-4xl font-bold text-blue-700">
                  {selectedEvaluation.overall_score === null
                    ? "—"
                    : `${selectedEvaluation.overall_score}/100`}
                </p>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selectedEvaluation.summary}
                </p>
              </div>

              <h4 className="mt-8 mb-4 text-lg font-semibold">
                Question-by-Question Feedback
              </h4>

              <div className="space-y-4">
                {selectedEvaluation.answer_evaluations.map(
                  (answer, index) => (
                    <div
                      key={answer.answer_id}
                      className="rounded-lg border p-5"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <h5 className="font-semibold">
                          Answer {index + 1}
                        </h5>

                        <span className="font-semibold text-blue-700">
                          {answer.score}/100
                        </span>
                      </div>

                      <div className="mb-5 space-y-3">
  <div>
    <p className="text-sm font-semibold text-slate-900">
      Interview Question
    </p>
    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
      {answer.question}
    </p>
  </div>

  <div className="rounded-lg bg-slate-50 p-4">
    <p className="text-sm font-semibold text-slate-900">
      Candidate Answer
    </p>
    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
      {answer.answer_text}
    </p>
  </div>
</div>

                      <p className="text-sm font-semibold text-green-700">
                        Strengths
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                        {answer.strengths || "Not provided"}
                      </p>

                      <p className="mt-4 text-sm font-semibold text-amber-700">
                        Areas for improvement
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                        {answer.weaknesses || "Not provided"}
                      </p>

                      <p className="mt-4 text-sm font-semibold">
                        Feedback
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                        {answer.feedback || "Not provided"}
                      </p>
                    </div>
                  )
                )}
              </div>

              <p className="mt-6 text-xs text-slate-500">
                AI-generated technical feedback is advisory and
                should be reviewed by a human before use in hiring
                decisions.
              </p>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}

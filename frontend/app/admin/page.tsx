
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAssessments,
  getCurrentUser,
  updateAssessment,
  deleteAssessment,
  type Assessment,
  type User,
} from "@/lib/api";

export default function AdminDashboard() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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

        const data = await getAssessments(token);

        if (!cancelled) {
          setUser(currentUser);
          setAssessments(data);
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
      </div>
    </main>
  );
}

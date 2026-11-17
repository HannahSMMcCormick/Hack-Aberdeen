
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getCurrentUser,
  getCandidateAssessments,
  getMySubmissions,
  uploadCandidateProject,
  type CandidateAssessment,
  type CandidateSubmission,
  type User,
} from "@/lib/api";

export default function CandidateDashboard() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);

  const [assessments, setAssessments] = useState<
    CandidateAssessment[]
  >([]);

  const [submissions, setSubmissions] = useState<
    CandidateSubmission[]
  >([]);

  const [selectedAssessment, setSelectedAssessment] =
    useState("");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Track assessments that already have a submission.
  const submittedAssessmentIds = new Set(
    submissions.map((submission) => submission.assessment_id)
  );

  const alreadySubmitted = submittedAssessmentIds.has(
    selectedAssessment
  );

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

        if (currentUser.role !== "candidate") {
          router.replace("/admin");
          return;
        }

        const [available, mine] = await Promise.all([
          getCandidateAssessments(token),
          getMySubmissions(token),
        ]);

        if (cancelled) return;

        setUser(currentUser);
        setAssessments(available);
        setSubmissions(mine);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Could not load dashboard."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleUpload(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!selectedAssessment || !selectedFile) {
      setError("Select an assessment and ZIP file.");
      return;
    }

    // Prevent repeat submissions before calling the API.
    if (alreadySubmitted) {
      setError(
        "You have already submitted a project for this assessment."
      );
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".zip")) {
      setError("Only ZIP files are supported.");
      return;
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError("ZIP files must be 20 MB or smaller.");
      return;
    }

    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      await uploadCandidateProject(
        token,
        selectedAssessment,
        selectedFile
      );

      const updatedSubmissions = await getMySubmissions(
        token
      );

      setSubmissions(updatedSubmissions);

      // Clear the assessment selection after uploading.
      setSelectedAssessment("");
      setSelectedFile(null);

      setSuccess("Project uploaded successfully!");

      const fileInput = document.getElementById(
        "project-file"
      ) as HTMLInputElement | null;

      if (fileInput) fileInput.value = "";
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Project upload failed."
      );
    } finally {
      setUploading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <p>Loading candidate dashboard...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Candidate Dashboard
            </h1>

            <p className="mt-1 text-gray-600">
              Welcome, {user?.full_name || user?.email}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-lg border px-4 py-2 hover:bg-gray-100"
          >
            Logout
          </button>
        </header>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-100 p-4 text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="rounded-lg bg-green-100 p-4 text-green-700"
          >
            {success}
          </p>
        )}

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Upload Your Project
          </h2>

          <form
            onSubmit={handleUpload}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="assessment"
                className="mb-2 block font-medium"
              >
                Select Assessment
              </label>

              <select
                id="assessment"
                value={selectedAssessment}
                onChange={(event) =>
                  setSelectedAssessment(event.target.value)
                }
                required
                className="w-full rounded-lg border p-3"
              >
                <option value="">
                  Choose an assessment
                </option>

                {assessments.map((assessment) => {
                  const submitted = submittedAssessmentIds.has(
                    assessment.id
                  );

                  return (
                    <option
                      key={assessment.id}
                      value={assessment.id}
                      disabled={submitted}
                    >
                      {assessment.title} — {assessment.role}
                      {submitted ? " (Already Submitted)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label
                htmlFor="project-file"
                className="mb-2 block font-medium"
              >
                Project ZIP File
              </label>

              <input
                id="project-file"
                type="file"
                accept=".zip,application/zip"
                required
                onChange={(event) =>
                  setSelectedFile(
                    event.target.files?.[0] ?? null
                  )
                }
                className="w-full rounded-lg border p-3"
              />

              <p className="mt-2 text-sm text-gray-500">
                ZIP files only. Maximum size: 20 MB.
              </p>
            </div>

            <button
              type="submit"
              disabled={
                uploading ||
                !selectedAssessment ||
                !selectedFile ||
                alreadySubmitted
              }
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading
                ? "Uploading..."
                : alreadySubmitted
                  ? "Already Submitted"
                  : "Upload Project"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">
            Available Assessments
          </h2>

          {assessments.length === 0 ? (
            <p className="text-gray-600">
              No published assessments are available yet.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {assessments.map((assessment) => {
                const submitted = submittedAssessmentIds.has(
                  assessment.id
                );

                return (
                  <div
                    key={assessment.id}
                    className="rounded-xl border bg-white p-5 shadow-sm"
                  >
                    <h3 className="text-lg font-semibold">
                      {assessment.title}
                    </h3>

                    <p className="text-sm text-gray-600">
                      {assessment.role}
                    </p>

                    <p className="mt-3 text-sm">
                      {assessment.description ||
                        "No description provided."}
                    </p>

                    <button
                      type="button"
                      disabled={submitted}
                      onClick={() => {
                        setSelectedAssessment(assessment.id);
                        setError("");
                        setSuccess("");

                        window.scrollTo({
                          top: 0,
                          behavior: "smooth",
                        });
                      }}
                      className="mt-4 rounded-lg border px-4 py-2 text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      {submitted
                        ? "Already Submitted"
                        : "Select Assessment"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">
            My Submissions
          </h2>

          {submissions.length === 0 ? (
            <p className="text-gray-600">
              You haven't uploaded any projects yet.
            </p>
          ) : (
            <div className="space-y-3">
              {submissions.map((submission) => {
                const assessment = assessments.find(
                  (item) =>
                    item.id === submission.assessment_id
                );

                return (
                  <div
                    key={submission.id}
                    className="rounded-xl border bg-white p-5 shadow-sm"
                  >
                    <h3 className="font-semibold">
                      {submission.original_filename}
                    </h3>

                    <p className="text-sm text-gray-600">
                      Assessment:{" "}
                      {assessment?.title ||
                        submission.assessment_id}
                    </p>

                    <p className="mt-2 text-sm">
                      Status:{" "}
                      <span className="font-medium">
                        {submission.status}
                      </span>
                    </p>

                    <p className="text-sm text-gray-500">
                      Submitted:{" "}
                      {new Date(
                        submission.created_at
                      ).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

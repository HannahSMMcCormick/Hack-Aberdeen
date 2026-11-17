const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "candidate";
};

export type Assessment = {
  id: string;
  title: string;
  role: string;
  description: string | null;
  criteria: Record<string, unknown>;
  status: string;
  created_at: string;
};

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Invalid email or password");
  }

  return (await response.json()) as {
    access_token: string;
    token_type: string;
  };
}

export async function getCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load user profile");
  }

  return response.json();
}

export async function getAssessments(
  token: string
): Promise<Assessment[]> {
  const response = await fetch(`${API_URL}/assessments`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load assessments");
  }

  return response.json();
}


export type AssessmentCreate = {
  title: string;
  role: string;
  description: string | null;
  criteria: Record<string, unknown>;
};

export async function createAssessment(
  token: string,
  data: AssessmentCreate
): Promise<Assessment> {
  const response = await fetch(`${API_URL}/assessments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("You are not authorized to create assessments.");
    }

    throw new Error("Failed to create assessment.");
  }

  return response.json();
}


export type AssessmentUpdate = {
  title?: string;
  role?: string;
  description?: string | null;
  criteria?: Record<string, unknown>;
  status?: "draft" | "published";
};

export async function updateAssessment(
  token: string,
  id: string,
  data: AssessmentUpdate
): Promise<Assessment> {
  const response = await fetch(
    `${API_URL}/assessments/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update assessment (${response.status}).`);
  }

  return response.json();
}

export async function deleteAssessment(
  token: string,
  id: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}/assessments/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete assessment (${response.status}).`);
  }
}


export type CandidateAssessment = {
  id: string;
  title: string;
  role: string;
  description: string | null;
  status: string;
  created_at: string;
};

export type CandidateSubmission = {
  id: string;
  assessment_id: string;
  original_filename: string | null;
  status: string;
  created_at: string;
};

export async function getCandidateAssessments(
  token: string
): Promise<CandidateAssessment[]> {
  const response = await fetch(
    `${API_URL}/submissions/assessments`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load assessments (${response.status})`
    );
  }

  return response.json();
}

export async function getMySubmissions(
  token: string
): Promise<CandidateSubmission[]> {
  const response = await fetch(`${API_URL}/submissions/mine`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load submissions (${response.status})`
    );
  }

  return response.json();
}

export async function uploadCandidateProject(
  token: string,
  assessmentId: string,
  file: File
): Promise<CandidateSubmission> {
  const formData = new FormData();
  formData.append("assessment_id", assessmentId);
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/submissions/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Upload failed (${response.status})`
    );
  }

  return response.json();
}

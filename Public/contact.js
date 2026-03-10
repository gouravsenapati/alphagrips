const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000/api"
    : `${window.location.origin}/api`;

const form = document.getElementById("enquiryForm");
const statusBox = document.getElementById("enquiryStatus");

function setStatus(type, message) {
  if (!statusBox) return;
  statusBox.className = `enquiry-status ${type}`;
  statusBox.textContent = message;
  statusBox.hidden = false;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      branch_name: String(formData.get("branch_name") || "").trim(),
      message: String(formData.get("message") || "").trim()
    };

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
    if (statusBox) statusBox.hidden = true;

    try {
      const response = await fetch(`${API_BASE}/public/enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Unable to submit enquiry");
      }

      form.reset();
      setStatus("success", data.message || "Enquiry submitted successfully");
    } catch (error) {
      setStatus("error", error.message || "Unable to submit enquiry");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Enquiry";
    }
  });
}

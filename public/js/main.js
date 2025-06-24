document.addEventListener("DOMContentLoaded", () => {
  // Initialize the application
  initializeApp();
});

function initializeApp() {
  // Toggle sidebar on mobile
  initializeSidebar();

  // Initialize dashboard controls
  initializeDashboardControls();

  // Initialize forms
  initializeForms();

  // Initialize modals
  initializeModals();

  // Initialize tooltips and other UI elements
  initializeUI();
}

function initializeSidebar() {
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.querySelector(".sidebar");

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("show");
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener("click", (e) => {
      if (
        window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        !sidebarToggle.contains(e.target)
      ) {
        sidebar.classList.remove("show");
      }
    });
  }
}

function initializeDashboardControls() {
  // Toggle system status
  const systemToggle = document.getElementById("system-enabled");
  if (systemToggle) {
    systemToggle.addEventListener("change", function () {
      updateSetting("system_enabled", this.checked ? "1" : "0")
        .then(() => {
          showAlert(
            "success",
            `System ${this.checked ? "enabled" : "disabled"}`
          );
        })
        .catch((error) => {
          showAlert("danger", "Error updating system status: " + error.message);
          this.checked = !this.checked; // Revert toggle
        });
    });
  }

  // Handle sync now button
  const syncNowBtn = document.getElementById("sync-now");
  if (syncNowBtn) {
    syncNowBtn.addEventListener("click", function () {
      const originalHTML = this.innerHTML;
      this.disabled = true;
      this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';

      fetch("/api/actions/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showAlert("success", "Sync started in background");
          } else {
            showAlert("danger", "Error: " + data.error);
          }
        })
        .catch((error) => {
          showAlert("danger", "Error: " + error.message);
        })
        .finally(() => {
          this.disabled = false;
          this.innerHTML = originalHTML;
        });
    });
  }

  // Handle test run button
  const testRunBtn = document.getElementById("test-run");
  if (testRunBtn) {
    testRunBtn.addEventListener("click", function () {
      const originalHTML = this.innerHTML;
      this.disabled = true;
      this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';

      fetch("/api/actions/test-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showAlert("success", "Test posting started in background");
          } else {
            showAlert("danger", "Error: " + data.error);
          }
        })
        .catch((error) => {
          showAlert("danger", "Error: " + error.message);
        })
        .finally(() => {
          this.disabled = false;
          this.innerHTML = originalHTML;
        });
    });
  }
}

function initializeForms() {
  // Handle account add form
  const accountForm = document.getElementById("add-account-form");
  if (accountForm) {
    accountForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const formData = new FormData(accountForm);
      const data = Object.fromEntries(formData.entries());

      fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showAlert("success", "Account added successfully");
            closeModal("add-account-modal");
            setTimeout(() => window.location.reload(), 1000);
          } else {
            showAlert("danger", "Error: " + data.error);
          }
        })
        .catch((error) => {
          showAlert("danger", "Error: " + error.message);
        });
    });
  }

  // Handle tweet add form
  const tweetForm = document.getElementById("add-tweet-form");
  if (tweetForm) {
    tweetForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const formData = new FormData(tweetForm);
      const data = Object.fromEntries(formData.entries());

      fetch("/api/tweets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showAlert("success", "Tweet added successfully");
            closeModal("add-tweet-modal");
            setTimeout(() => window.location.reload(), 1000);
          } else {
            showAlert("danger", "Error: " + data.error);
          }
        })
        .catch((error) => {
          showAlert("danger", "Error: " + error.message);
        });
    });
  }

  // Handle settings form
  const settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const formData = new FormData(this);
      const settings = {};

      for (const [key, value] of formData.entries()) {
        settings[key] = value;
      }

      // Handle checkboxes that might not be in FormData if unchecked
      const checkboxes = this.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        if (!settings.hasOwnProperty(checkbox.name)) {
          settings[checkbox.name] = "0";
        } else {
          settings[checkbox.name] = "1";
        }
      });

      // Update each setting separately
      const promises = Object.entries(settings).map(([key, value]) => {
        return updateSetting(key, value);
      });

      Promise.all(promises)
        .then(() => {
          showAlert("success", "Settings updated successfully");
        })
        .catch((error) => {
          showAlert("danger", "Error updating settings: " + error.message);
        });
    });
  }

  // Character counter for tweet text
  const tweetTextArea = document.getElementById("tweet-text");
  if (tweetTextArea) {
    tweetTextArea.addEventListener("input", function () {
      const count = this.value.length;
      const counter = document.getElementById("char-count");
      if (counter) {
        counter.textContent = count;
        if (count > 280) {
          this.classList.add("is-invalid");
          counter.style.color = "var(--error-color)";
        } else {
          this.classList.remove("is-invalid");
          counter.style.color = "var(--muted-text-color)";
        }
      }
    });
  }
}

function initializeModals() {
  // Initialize modal triggers
  const modalTriggers = document.querySelectorAll('[data-toggle="modal"]');
  modalTriggers.forEach((trigger) => {
    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      const target = this.getAttribute("data-target");
      const modal = document.querySelector(target);
      if (modal) {
        showModal(modal);
      }
    });
  });

  // Initialize close buttons
  const closeButtons = document.querySelectorAll('[data-dismiss="modal"]');
  closeButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const modal = this.closest(".modal");
      if (modal) {
        hideModal(modal);
      }
    });
  });

  // Click outside to close modal
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      hideModal(e.target);
    }
  });

  // ESC key to close modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const openModal = document.querySelector(".modal.show");
      if (openModal) {
        hideModal(openModal);
      }
    }
  });
}

function initializeUI() {
  // Initialize dropdowns
  const dropdownToggles = document.querySelectorAll(".dropdown-toggle");
  dropdownToggles.forEach((toggle) => {
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      const dropdown = this.parentElement;
      const menu = dropdown.querySelector(".dropdown-menu");
      if (menu) {
        menu.style.display = menu.style.display === "block" ? "none" : "block";
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown")) {
      document.querySelectorAll(".dropdown-menu").forEach((menu) => {
        menu.style.display = "none";
      });
    }
  });

  // Auto-refresh alerts
  setTimeout(() => {
    document.querySelectorAll(".alert").forEach((alert) => {
      if (!alert.classList.contains("alert-permanent")) {
        alert.remove();
      }
    });
  }, 5000);
}

// Helper functions
function showAlert(type, message, permanent = false) {
  const alertsContainer = document.getElementById("alerts-container");
  if (!alertsContainer) {
    console.log(`${type.toUpperCase()}: ${message}`);
    return;
  }

  const alert = document.createElement("div");
  alert.className = `alert alert-${type} fade-in ${
    permanent ? "alert-permanent" : ""
  }`;
  alert.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <span>${message}</span>
      <button type="button" class="close" onclick="this.parentElement.parentElement.remove()">
        <span>&times;</span>
      </button>
    </div>
  `;

  alertsContainer.appendChild(alert);

  // Auto-remove after 5 seconds unless permanent
  if (!permanent) {
    setTimeout(() => {
      if (alert.parentElement) {
        alert.remove();
      }
    }, 5000);
  }
}

function showModal(modal) {
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
}

function hideModal(modal) {
  modal.classList.remove("show");
  document.body.style.overflow = "";

  // Reset form if exists
  const form = modal.querySelector("form");
  if (form) {
    form.reset();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    hideModal(modal);
  }
}

function updateSetting(key, value) {
  return fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.success) {
        throw new Error(data.error);
      }
      return data;
    });
}

// Global functions for template usage
window.fetchTweets = (username) => {
  if (confirm(`Fetch new tweets from @${username}?`)) {
    fetch(`/api/accounts/${username}/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showAlert("success", data.message);
          setTimeout(() => window.location.reload(), 2000);
        } else {
          showAlert("danger", "Error: " + data.error);
        }
      })
      .catch((error) => showAlert("danger", "Error: " + error.message));
  }
};

window.deleteAccount = (id) => {
  if (
    confirm(
      "Are you sure you want to delete this account? This will also delete all associated tweets."
    )
  ) {
    fetch(`/api/accounts/${id}`, {
      method: "DELETE",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showAlert("success", "Account deleted successfully");
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showAlert("danger", "Error: " + data.error);
        }
      })
      .catch((error) => showAlert("danger", "Error: " + error.message));
  }
};

window.postTweet = (id) => {
  if (confirm("Post this tweet now?")) {
    fetch(`/api/tweets/${id}/post`, {
      method: "POST",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showAlert("success", "Tweet posted successfully");
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showAlert("danger", "Error: " + data.error);
        }
      })
      .catch((error) => showAlert("danger", "Error: " + error.message));
  }
};

window.deleteTweet = (id) => {
  if (confirm("Delete this tweet?")) {
    fetch(`/api/tweets/${id}`, {
      method: "DELETE",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showAlert("success", "Tweet deleted successfully");
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showAlert("danger", "Error: " + data.error);
        }
      })
      .catch((error) => showAlert("danger", "Error: " + error.message));
  }
};

window.clearLogs = () => {
  if (
    confirm(
      "Are you sure you want to clear all logs? This action cannot be undone."
    )
  ) {
    fetch("/api/logs/clear", {
      method: "POST",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showAlert("success", "Logs cleared successfully");
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showAlert("danger", "Error: " + data.error);
        }
      })
      .catch((error) => showAlert("danger", "Error: " + error.message));
  }
};

window.testTwitterConnection = () => {
  const apiKey = document.querySelector('[name="twitter_api_key"]').value;
  const apiSecret = document.querySelector('[name="twitter_api_secret"]').value;
  const accessToken = document.querySelector(
    '[name="twitter_access_token"]'
  ).value;
  const accessSecret = document.querySelector(
    '[name="twitter_access_secret"]'
  ).value;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    showAlert("warning", "Please fill in all Twitter API credentials");
    return;
  }

  fetch("/api/twitter/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, apiSecret, accessToken, accessSecret }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        showAlert("success", "Twitter API connection successful!");
      } else {
        showAlert("danger", "Connection failed: " + data.error);
      }
    })
    .catch((error) => showAlert("danger", "Error: " + error.message));
};

// Utility functions
window.showAlert = showAlert;
window.closeModal = closeModal;

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// ─── STATE ───────────────────────────────────────────────────────
const state = {
  currentPage: "login",
  currentUser: null,
  profiles: { data: [], page: 1, total: 0, total_pages: 1, limit: 10 },
  filters: { gender: "", age_group: "", sort_by: "created_at", order: "desc" },
  dashData: null,
};

// ─── DOM REFS ─────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const loginPage = $("page-login");
const sidebar = $("sidebar");
const mainEl = $("main");

// ─── TOAST ────────────────────────────────────────────────────────
function toast(msg, type = "info") {
  const tc = $("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
  t.innerHTML = `<span style="font-family:var(--font-mono);font-size:13px;color:${type === "error" ? "var(--danger)" : "var(--accent)"}">${icon}</span> ${msg}`;
  tc.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(16px)";
    t.style.transition = "all 0.3s ease";
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

// ─── ROUTING ──────────────────────────────────────────────────────
function navigate(page, data = null) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));

  state.currentPage = page;

  if (page === "login") {
    loginPage.classList.add("active");
    sidebar.classList.add("hidden");
    mainEl.classList.add("full-width");
    loginPage.style.display = "flex";
    return;
  }

  loginPage.style.display = "none";
  sidebar.classList.remove("hidden");
  mainEl.classList.remove("full-width");

  const pageEl = $(`page-${page}`);
  if (pageEl) pageEl.classList.add("active");

  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add("active");

  // Page init
  if (page === "dashboard") initDashboard();
  if (page === "profiles") {
    state.profiles.page = 1;
    loadProfiles();
  }
  if (page === "profile-detail" && data) loadProfileDetail(data);
  if (page === "search") {
    $("search-input").focus();
  }
  if (page === "account") initAccount();
}

// ─── NAV CLICKS ──────────────────────────────────────────────────
document
  .querySelectorAll(".nav-item[data-page], button[data-page]")
  .forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.page));
  });

// ─── AUTH CHECK ──────────────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/profiles?page=1&limit=1`, {
      headers: { "X-API-Version": "1" },
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      // Extract user info from JWT (we don't have it directly, but we can set defaults)
      state.currentUser = { username: "User", role: "member" };
      updateSidebarUser();
      navigate("dashboard");
    } else {
      navigate("login");
    }
  } catch (e) {
    navigate("login");
  }
}

function updateSidebarUser() {
  const u = state.currentUser;
  if (!u) return;
  $("sidebar-username").textContent = u.username || "User";
  $("sidebar-role").textContent = u.role || "member";
  $("sidebar-avatar").textContent = (u.username || "U")[0].toUpperCase();
}

// ─── DASHBOARD ───────────────────────────────────────────────────
async function initDashboard() {
  renderDashSkeletons();
  try {
    // Fetch page 1 for recent + total count
    const res = await fetch(
      `${BACKEND_URL}/api/profiles?page=1&limit=10&sort_by=created_at&order=desc`,
      {
        headers: { "X-API-Version": "1" },
        credentials: "include",
      },
    );
    if (!res.ok) throw new Error();
    const data = await res.json();

    // Fetch gender counts
    const [maleRes, femaleRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/profiles?page=1&limit=1&gender=male`, {
        headers: { "X-API-Version": "1" },
        credentials: "include",
      }),
      fetch(`${BACKEND_URL}/api/profiles?page=1&limit=1&gender=female`, {
        headers: { "X-API-Version": "1" },
        credentials: "include",
      }),
    ]);
    const maleData = maleRes.ok ? await maleRes.json() : { total: 0 };
    const femaleData = femaleRes.ok ? await femaleRes.json() : { total: 0 };

    const total = data.total || 0;
    const males = maleData.total || 0;
    const females = femaleData.total || 0;

    $("stat-total").textContent = total.toLocaleString();
    $("stat-male").textContent = males.toLocaleString();
    $("stat-female").textContent = females.toLocaleString();

    // Gender bar
    const malePct = total > 0 ? Math.round((males / total) * 100) : 50;
    $("gender-bar").style.width = `${malePct}%`;
    $("gender-split-labels").innerHTML = `
      <span style="color:var(--accent-2)">${malePct}% Male</span>
      <span style="color:var(--accent)">${100 - malePct}% Female</span>`;

    // Country aggregation from current data
    const countryCounts = {};
    data.data.forEach((p) => {
      if (p.country_name)
        countryCounts[p.country_name] =
          (countryCounts[p.country_name] || 0) + 1;
    });
    const topCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    $("stat-countries").textContent = Object.keys(countryCounts).length;

    const maxCount = topCountries[0]?.[1] || 1;
    $("countries-list").innerHTML =
      topCountries
        .map(
          ([name, count]) => `
      <div class="country-row">
        <span style="font-size:12.5px;color:var(--text)">${name}</span>
        <div class="country-bar-wrap"><div class="country-bar"><div class="country-bar-fill" style="width:${(count / maxCount) * 100}%"></div></div></div>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-3)">${count}</span>
      </div>
    `,
        )
        .join("") || `<div class="text-dim text-sm">No data</div>`;

    // Recent table
    renderDashTable(data.data.slice(0, 8));
  } catch (e) {
    toast("Failed to load dashboard data", "error");
  }
}

function renderDashSkeletons() {
  ["stat-total", "stat-male", "stat-female", "stat-countries"].forEach((id) => {
    $(id).innerHTML =
      `<div class="skeleton" style="width:60px;height:32px;margin-top:4px;"></div>`;
  });
  $("dash-table-body").innerHTML = Array(6)
    .fill(0)
    .map(
      () => `
    <tr class="skeleton-row">
      ${Array(4)
        .fill(0)
        .map(
          () =>
            `<td><div class="skeleton skeleton-cell" style="width:${60 + Math.random() * 60}px"></div></td>`,
        )
        .join("")}
    </tr>`,
    )
    .join("");
}

function renderDashTable(profiles) {
  $("dash-table-body").innerHTML =
    profiles
      .map(
        (p) => `
    <tr data-id="${p.id}">
      <td>${p.name}</td>
      <td>${p.age}</td>
      <td>${genderBadge(p.gender)}</td>
      <td>${p.country_name || "—"}</td>
    </tr>
  `,
      )
      .join("") ||
    `<tr><td colspan="4" class="empty-state"><p>No profiles found</p></td></tr>`;

  $("dash-table-body")
    .querySelectorAll("tr[data-id]")
    .forEach((row) => {
      row.addEventListener("click", () =>
        navigate("profile-detail", row.dataset.id),
      );
    });
}

// ─── PROFILES LIST ────────────────────────────────────────────────
async function loadProfiles() {
  showProfilesSkeletons();
  const { page, limit } = state.profiles;
  const { gender, age_group, sort_by, order } = state.filters;

  const params = new URLSearchParams({ page, limit, sort_by, order });
  if (gender) params.set("gender", gender);
  if (age_group) params.set("age_group", age_group);

  try {
    const res = await fetch(`${BACKEND_URL}/api/profiles?${params}`, {
      headers: { "X-API-Version": "1" },
      credentials: "include",
    });
    if (res.status === 401) {
      navigate("login");
      return;
    }
    const data = await res.json();

    state.profiles.total = data.total;
    state.profiles.total_pages = data.total_pages;
    state.profiles.data = data.data;

    renderProfilesTable(data.data);
    renderPagination();
  } catch (e) {
    toast("Failed to load profiles", "error");
  }
}

function showProfilesSkeletons() {
  $("profiles-table-body").innerHTML = Array(8)
    .fill(0)
    .map(
      () => `
    <tr class="skeleton-row">
      ${Array(7)
        .fill(0)
        .map(
          () =>
            `<td><div class="skeleton skeleton-cell" style="width:${40 + Math.random() * 80}px"></div></td>`,
        )
        .join("")}
    </tr>`,
    )
    .join("");
}

function renderProfilesTable(profiles) {
  $("profiles-table-body").innerHTML =
    profiles
      .map(
        (p) => `
    <tr data-id="${p.id}" style="cursor:pointer;">
      <td class="id-cell">${p.id.substring(0, 8)}…</td>
      <td style="font-weight:500;color:var(--text)">${p.name}</td>
      <td>${p.age}</td>
      <td>${genderBadge(p.gender)}</td>
      <td>${p.country_name || "—"}</td>
      <td>${ageGroupBadge(p.age_group)}</td>
      <td>${probBar(p.gender_probability)}</td>
    </tr>
  `,
      )
      .join("") ||
    `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">◌</div><p>No profiles match your filters.</p></div></td></tr>`;

  $("profiles-table-body")
    .querySelectorAll("tr[data-id]")
    .forEach((row) => {
      row.addEventListener("click", () =>
        navigate("profile-detail", row.dataset.id),
      );
    });
}

function renderPagination() {
  const { page, total_pages, total, limit } = state.profiles;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  $("profiles-page-info").textContent =
    `${start}–${end} of ${total.toLocaleString()} profiles`;

  const ctrl = $("profiles-page-controls");
  ctrl.innerHTML = "";

  const addBtn = (label, targetPage, current = false, disabled = false) => {
    const b = document.createElement("button");
    b.className = `page-btn${current ? " current" : ""}`;
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener("click", () => {
      state.profiles.page = targetPage;
      loadProfiles();
    });
    ctrl.appendChild(b);
  };

  addBtn("←", page - 1, false, page <= 1);
  const start2 = Math.max(1, page - 2);
  const end2 = Math.min(total_pages, page + 2);
  for (let i = start2; i <= end2; i++) addBtn(i, i, i === page);
  addBtn("→", page + 1, false, page >= total_pages);
}

// ─── FILTERS ─────────────────────────────────────────────────────
$("filter-gender").addEventListener("change", (e) => {
  state.filters.gender = e.target.value;
  state.profiles.page = 1;
  loadProfiles();
});
$("filter-age-group").addEventListener("change", (e) => {
  state.filters.age_group = e.target.value;
  state.profiles.page = 1;
  loadProfiles();
});
$("filter-sort").addEventListener("change", (e) => {
  state.filters.sort_by = e.target.value;
  loadProfiles();
});
$("filter-order").addEventListener("change", (e) => {
  state.filters.order = e.target.value;
  loadProfiles();
});
$("profiles-refresh-btn").addEventListener("click", loadProfiles);

// ─── PROFILE DETAIL ───────────────────────────────────────────────
async function loadProfileDetail(profileId) {
  $("profile-detail-card").innerHTML =
    `<div class="empty-state"><div class="spinner"></div></div>`;
  try {
    const res = await fetch(`${BACKEND_URL}/api/profiles/${profileId}`, {
      headers: { "X-API-Version": "1" },
      credentials: "include",
    });
    if (!res.ok) throw new Error();
    const { data: p } = await res.json();

    $("profile-detail-card").innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar-lg">${p.name[0].toUpperCase()}</div>
        <div class="profile-hero-info">
          <div class="profile-hero-name">${p.name}</div>
          <div class="profile-hero-meta">
            ${genderBadge(p.gender)}
            ${ageGroupBadge(p.age_group)}
            <span class="badge badge-gray">${p.country_name || "Unknown"}</span>
          </div>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-cell"><div class="detail-label">Full ID</div><div class="detail-value text-mono" style="font-size:12px;color:var(--text-2)">${p.id}</div></div>
        <div class="detail-cell"><div class="detail-label">Age</div><div class="detail-value">${p.age} years</div></div>
        <div class="detail-cell"><div class="detail-label">Gender</div><div class="detail-value">${capitalize(p.gender)}</div></div>
        <div class="detail-cell"><div class="detail-label">Gender Confidence</div><div class="detail-value">${(p.gender_probability * 100).toFixed(1)}%</div></div>
        <div class="detail-cell"><div class="detail-label">Age Group</div><div class="detail-value">${capitalize(p.age_group)}</div></div>
        <div class="detail-cell"><div class="detail-label">Country</div><div class="detail-value">${p.country_name || "—"}</div></div>
        <div class="detail-cell"><div class="detail-label">Country Code</div><div class="detail-value text-mono">${p.country_id || "—"}</div></div>
        <div class="detail-cell"><div class="detail-label">Country Confidence</div><div class="detail-value">${p.country_probability ? (p.country_probability * 100).toFixed(1) + "%" : "—"}</div></div>
        <div class="detail-cell"><div class="detail-label">Created At</div><div class="detail-value" style="font-size:13px">${formatDate(p.created_at)}</div></div>
      </div>
    `;
  } catch (e) {
    $("profile-detail-card").innerHTML =
      `<div class="empty-state"><div class="empty-icon">✕</div><p>Profile not found.</p></div>`;
  }
}

$("back-to-profiles").addEventListener("click", () => navigate("profiles"));

// ─── SEARCH ───────────────────────────────────────────────────────
async function runSearch() {
  const q = $("search-input").value.trim();
  if (!q) return;

  const btn = $("search-btn");
  btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>`;

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/profiles/search?q=${encodeURIComponent(q)}&limit=20`,
      {
        headers: { "X-API-Version": "1" },
        credentials: "include",
      },
    );

    if (res.status === 400) {
      const err = await res.json();
      toast(err.message || "Could not interpret query", "error");
      return;
    }
    if (res.status === 401) {
      navigate("login");
      return;
    }
    if (!res.ok) throw new Error();

    const data = await res.json();
    const card = $("search-results-card");
    card.style.display = "";
    $("search-result-count").textContent =
      `${data.total} result${data.total !== 1 ? "s" : ""} for "${q}"`;

    $("search-table-body").innerHTML =
      data.data
        .map(
          (p) => `
      <tr data-id="${p.id}" style="cursor:pointer">
        <td style="font-weight:500;color:var(--text)">${p.name}</td>
        <td>${p.age}</td>
        <td>${genderBadge(p.gender)}</td>
        <td>${p.country_name || "—"}</td>
        <td>${ageGroupBadge(p.age_group)}</td>
      </tr>
    `,
        )
        .join("") ||
      `<tr><td colspan="5"><div class="empty-state"><p>No results found.</p></div></td></tr>`;

    $("search-table-body")
      .querySelectorAll("tr[data-id]")
      .forEach((row) => {
        row.addEventListener("click", () =>
          navigate("profile-detail", row.dataset.id),
        );
      });
  } catch (e) {
    toast("Search failed", "error");
  } finally {
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
  }
}

$("search-btn").addEventListener("click", runSearch);
$("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

// ─── EXPORT ───────────────────────────────────────────────────────
async function doExport(btn) {
  const orig = btn.innerHTML;
  btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Exporting…`;
  btn.disabled = true;
  try {
    const res = await fetch(`${BACKEND_URL}/api/profiles/export`, {
      headers: { "X-API-Version": "1" },
      credentials: "include",
    });
    if (res.status === 401) {
      navigate("login");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "insighta_export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Export downloaded successfully", "success");
  } catch (e) {
    toast("Export failed", "error");
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

$("dash-export-btn").addEventListener("click", () =>
  doExport($("dash-export-btn")),
);
$("profiles-export-btn").addEventListener("click", () =>
  doExport($("profiles-export-btn")),
);

// ─── ACCOUNT ──────────────────────────────────────────────────────
function initAccount() {
  const u = state.currentUser || {};
  const name = u.username || "User";
  $("account-avatar").textContent = name[0].toUpperCase();
  $("account-name").textContent = name;
  $("account-handle").textContent = `@${name.toLowerCase()}`;
  $("account-role-badge").textContent = u.role || "member";
}

$("logout-btn").addEventListener("click", () => {
  // Clear cookies by navigating to a logout or just reload to the login screen
  // Backend uses HTTP-only cookies, so we just redirect to login
  document.cookie.split(";").forEach((c) => {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
  });
  state.currentUser = null;
  navigate("login");
  toast("Signed out successfully", "success");
});

// ─── HELPERS ─────────────────────────────────────────────────────
function genderBadge(gender) {
  if (!gender) return `<span class="badge badge-gray">—</span>`;
  const cls = gender.toLowerCase() === "male" ? "badge-blue" : "badge-green";
  return `<span class="badge ${cls}">${capitalize(gender)}</span>`;
}
function ageGroupBadge(group) {
  if (!group) return `<span class="badge badge-gray">—</span>`;
  return `<span class="badge badge-gray">${capitalize(group)}</span>`;
}
function probBar(prob) {
  if (prob == null) return "—";
  const pct = Math.round(prob * 100);
  return `<div class="prob-ring"><div class="prob-bar-wrap"><div class="prob-bar" style="width:${pct}%"></div></div><span style="font-family:var(--font-mono);font-size:11px;color:var(--text-3)">${pct}%</span></div>`;
}
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "—";
}
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ─── INIT ─────────────────────────────────────────────────────────
checkAuth();

function getSidebar() {
  return document.getElementById("sidebar");
}

window.toggleSidebar = function () {
  const sidebar = getSidebar();

  if (!sidebar) {
    return;
  }

  sidebar.classList.toggle("open");
};

window.closeSidebar = function () {
  const sidebar = getSidebar();

  if (!sidebar) {
    return;
  }

  sidebar.classList.remove("open");
};

window.logout = function () {
  localStorage.clear();
  window.location.href = "/Public/login.html";
};

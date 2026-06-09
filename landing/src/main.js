const APP_URL = import.meta.env.VITE_APP_URL || "https://nutri.pancabiel.workers.dev";

document.querySelectorAll("[data-app-link]").forEach((el) => {
  el.setAttribute("href", APP_URL);
});

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

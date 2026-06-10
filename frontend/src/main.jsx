import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// iOS launches homescreen apps (apple-mobile-web-app-capable) in a mode where
// `navigator.standalone` is true but the `@media (display-mode: standalone)`
// query doesn't reliably match. Tag <html> so the CSS height fix can key off
// this too, otherwise the app falls back to the short 100% viewport and the
// page background leaks below the footer.
if (window.navigator.standalone === true) {
  document.documentElement.classList.add("ios-standalone");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

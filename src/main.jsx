import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import App from "./app.jsx";

// Keep compatibility with your existing app.jsx pattern:
window.React = React;
window.ReactDOM = ReactDOM;

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

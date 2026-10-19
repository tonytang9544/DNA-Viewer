import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page is missing its application root.");
}

ReactDOM.createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

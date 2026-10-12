import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Stage } from "./components/Stage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Stage>
      <App />
    </Stage>
  </StrictMode>
);

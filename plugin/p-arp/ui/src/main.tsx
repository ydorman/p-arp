import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Stage } from "./components/Stage";
import { installFocusRelease } from "./focus";
import "./styles.css";

installFocusRelease();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Stage>
      <App />
    </Stage>
  </StrictMode>
);

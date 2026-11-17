import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import type { Report } from "./types.ts";

// report.ts puts the report in the page as JSON, with "<" escaped so no listing text can close its script tag
const report = JSON.parse(document.getElementById("report")?.textContent ?? "null") as Report;
document.documentElement.lang = report.lang || "en";
createRoot(document.getElementById("root")!).render(<App report={report} />);

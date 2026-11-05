import { createContext } from "react";
import type { StartupModel } from "./startup-cache.ts";

export const StartupModelContext = createContext<readonly StartupModel[]>([]);

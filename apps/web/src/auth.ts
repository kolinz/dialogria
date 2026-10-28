import { createContext, useContext } from "react";
import type { User } from "../../../packages/shared/src";
export const AuthContext = createContext<{
  user: User;
  refresh: () => Promise<void>;
}>({ user: null as unknown as User, refresh: async () => {} });
export const useAuth = () => useContext(AuthContext);

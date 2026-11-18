import { createContext, useState, useCallback, useRef } from "react";
import { API_URL } from "../config";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user") || "null")
  );

  const isLoggedIn = !!token;
  const balanceVersion = useRef(0);
  const currentToken = useRef(token);
  currentToken.current = token;

  const updateRewardsBalance = useCallback((points) => {
    if (!Number.isFinite(points) || points < 0) return;
    balanceVersion.current += 1;
    setUser((previous) => {
      if (!previous) return previous;
      const next = { ...previous, points };
      try { localStorage.setItem("user", JSON.stringify(next)); } catch { /* The live balance still updates if storage is unavailable. */ }
      return next;
    });
  }, []);

  const login = async ({ email, password }) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.msg || data?.message || "No se pudo iniciar sesión");
    }

    // Ajusta si tu backend usa otro nombre
    const receivedToken = data.token;
    const receivedUser = data.user;

    setToken(receivedToken);
    setUser(receivedUser);

    localStorage.setItem("token", receivedToken);
    localStorage.setItem("user", JSON.stringify(receivedUser));

    return data;
  };

  const register = async ({ name, email, password, marketingOptIn = false }) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, marketingOptIn: marketingOptIn === true }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.msg || data?.message || "No se pudo crear la cuenta");
    }

    // si tu backend regresa token al registrarte, te loguea de una vez:
    const receivedToken = data.token;
    const receivedUser = data.user;

    if (receivedToken) {
      setToken(receivedToken);
      localStorage.setItem("token", receivedToken);
    }
    if (receivedUser) {
      setUser(receivedUser);
      localStorage.setItem("user", JSON.stringify(receivedUser));
    }

    return data;
  };

  const refreshUser = useCallback(async ({ rewardVisit = false } = {}) => {
    if (!token) return null;
    const version = ++balanceVersion.current;
    try {
      const res = await fetch(`${API_URL}/api/users/me${rewardVisit ? "?rewardVisit=1" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user && version === balanceVersion.current && token === currentToken.current) {
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
        return data.user;
      }
    } catch {
      // silently ignore
    }
    return null;
  }, [token]);

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoggedIn,
        login,
        register,
        logout,
        refreshUser,
        updateRewardsBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

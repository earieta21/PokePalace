import { createContext, useEffect, useState } from "react";
import { API_URL } from "../config";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  const isLoggedIn = Boolean(token);

  const saveSession = ({ token, user }) => {
    setToken(token);
    setUser(user);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  // (Opcional) validar token en futuro con /me
  useEffect(() => {
    // por ahora, solo mantenemos sesión local
  }, []);

  const register = async ({ name, email, password }) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.msg || "Error al registrar");

    saveSession(data);
    return data;
  };

  const login = async ({ email, password }) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.msg || "Error al iniciar sesión");

    saveSession(data);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{ token, user, isLoggedIn, register, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

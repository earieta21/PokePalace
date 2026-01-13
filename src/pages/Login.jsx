import { createContext, useEffect, useState } from "react";
import { API_URL } from "../config";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user") || "null")
  );

  const isLoggedIn = !!token;

  const login = async ({ email, password }) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || "Login failed");
    }

    // ajusta según lo que devuelva tu backend
    const receivedToken = data.token;
    const receivedUser = data.user;

    setToken(receivedToken);
    setUser(receivedUser);

    localStorage.setItem("token", receivedToken);
    localStorage.setItem("user", JSON.stringify(receivedUser));

    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

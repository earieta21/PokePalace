import { createContext, useState } from "react";
import { API_URL } from "../config";

export const StaffAuthContext = createContext();

export const StaffAuthProvider = ({ children }) => {
  const [staffToken, setStaffToken] = useState(
    localStorage.getItem("staffToken") || null
  );
  const [staffUser, setStaffUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("staffUser") || "null");
    } catch {
      return null;
    }
  });

  const isStaffLoggedIn = !!staffToken;

  const staffLogin = async ({ email, password }) => {
    // ✅ endpoint separado (lo haremos en backend)
    const res = await fetch(`${API_URL}/api/staff-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Staff login failed");

    const receivedToken = data.token;
    const receivedUser = data.user; // debe incluir role

    if (!receivedToken || !receivedUser) {
      throw new Error("Invalid staff auth response");
    }

    setStaffToken(receivedToken);
    setStaffUser(receivedUser);

    localStorage.setItem("staffToken", receivedToken);
    localStorage.setItem("staffUser", JSON.stringify(receivedUser));

    return data;
  };

  const staffLogout = () => {
    setStaffToken(null);
    setStaffUser(null);
    localStorage.removeItem("staffToken");
    localStorage.removeItem("staffUser");
  };

  return (
    <StaffAuthContext.Provider
      value={{ staffToken, staffUser, isStaffLoggedIn, staffLogin, staffLogout }}
    >
      {children}
    </StaffAuthContext.Provider>
  );
};

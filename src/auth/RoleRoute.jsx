import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { StaffAuthContext } from "../context/StaffAuthContext";

export default function RoleRoute({ allowedRoles, children }) {
  const { isStaffLoggedIn, staffUser } = React.useContext(StaffAuthContext);
  const location = useLocation();

  if (!isStaffLoggedIn) {
    return (
      <Navigate
        to="/staff/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  const role = staffUser?.role;
  if (!role || (Array.isArray(allowedRoles) && !allowedRoles.includes(role))) {
    return <Navigate to="/pos" replace />;
  }

  return children;
}

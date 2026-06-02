import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function EarnPoints() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/rewards-deals", { replace: true }); }, [navigate]);
  return null;
}

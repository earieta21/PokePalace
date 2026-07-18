import jwt from "jsonwebtoken";
import StaffUser from "../models/StaffUser.js";
import { isRoleAllowed } from "../utils/staffRoles.js";

export const requireStaffAuth = (roles = []) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== "staff") {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Roles and active status can change while a 12-hour PIN token is still
      // valid. Resolve the employee on every protected request so a demotion
      // or deactivation takes effect immediately instead of trusting stale
      // privileges embedded in the browser token.
      const currentUser = await StaffUser.findOne({ _id: decoded.id, active: true })
        .select("_id name role locationId active")
        .lean();
      if (!currentUser) {
        return res.status(401).json({ message: "Staff account is inactive or unavailable" });
      }

      if (!isRoleAllowed(currentUser.role, roles)) {
        return res.status(403).json({ message: "Insufficient role" });
      }

      req.staff = {
        ...decoded,
        id: String(currentUser._id),
        name: currentUser.name,
        role: currentUser.role,
        locationId: currentUser.locationId || null,
      };
      next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
};

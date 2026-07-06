import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import StaffUser from "../models/StaffUser.js";

const MANAGER_ROLES = ["owner", "manager", "admin"];

export const pinLogin = async (req, res) => {
  const { pin, locationId } = req.body;
  if (!pin || !locationId) {
    return res.status(400).json({ message: "pin y locationId requeridos" });
  }
  try {
    const user = await StaffUser.findOne({ pin, locationId, active: true });
    if (!user) {
      return res.status(401).json({ message: "PIN incorrecto" });
    }
    const token = jwt.sign(
      { id: user._id, role: user.role, type: "staff" },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        color: user.color,
        isManager: MANAGER_ROLES.includes(user.role),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", err: err.message });
  }
};

export const staffLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await StaffUser.findOne({ email, active: true });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        type: "staff",
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Staff login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

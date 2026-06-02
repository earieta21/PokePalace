import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import StaffUser from "../models/StaffUser.js";

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

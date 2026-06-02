import StaffUser from "../models/StaffUser.js";
import bcrypt from "bcryptjs";

/* GET /api/staff/employees  (admin/owner/manager) */
export const getEmployees = async (req, res) => {
  try {
    const employees = await StaffUser.find()
      .select("-password")
      .sort({ role: 1, name: 1 });
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ message: "Error fetching employees", err: err.message });
  }
};

/* POST /api/staff/employees  (admin/owner only) */
export const createEmployee = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password, role required" });
    }

    const existing = await StaffUser.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const employee = await StaffUser.create({
      name, email, password: hashed, role, active: true,
    });

    const { password: _, ...safe } = employee.toObject();
    res.status(201).json({ employee: safe });
  } catch (err) {
    res.status(400).json({ message: "Error creating employee", err: err.message });
  }
};

/* PATCH /api/staff/employees/:id  (admin/owner only) */
export const updateEmployee = async (req, res) => {
  try {
    const { name, role, active } = req.body;
    const employee = await StaffUser.findByIdAndUpdate(
      req.params.id,
      { name, role, active },
      { new: true }
    ).select("-password");

    if (!employee) return res.status(404).json({ message: "Employee not found" });
    res.json({ employee });
  } catch (err) {
    res.status(400).json({ message: "Error updating employee", err: err.message });
  }
};

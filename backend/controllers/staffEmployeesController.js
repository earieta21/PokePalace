import bcrypt from "bcryptjs";
import StaffUser from "../models/StaffUser.js";
import {
  canAssignStaffRole,
  canManageStaffRole,
  isStaffRole,
  manageableRolesFor,
} from "../utils/staffRoles.js";

const PUBLIC_FIELDS = "_id name email role color locationId active hourlyRate createdAt updatedAt";
const sameId = (left, right) => String(left) === String(right);

const locationFilterFor = (staff) => staff.locationId ? { locationId: staff.locationId } : {};

async function isLastActiveOwner(employee, update = {}) {
  const removesOwner = employee.role === "owner" && (
    update.active === false || (update.role !== undefined && update.role !== "owner")
  );
  if (!removesOwner) return false;
  return (await StaffUser.countDocuments({
    _id: { $ne: employee._id },
    role: "owner",
    active: true,
  })) === 0;
}

/* GET /api/staff/employees (manager/admin/owner)
   Protected roles are omitted unless the current owner can manage them. */
export const getEmployees = async (req, res) => {
  try {
    const manageableRoles = manageableRolesFor(req.staff.role);
    const employees = await StaffUser.find({
      ...locationFilterFor(req.staff),
      $or: [{ role: { $in: manageableRoles } }, { _id: req.staff.id }],
    })
      .select(PUBLIC_FIELDS)
      .sort({ role: 1, name: 1 });
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ message: "Error fetching employees", err: err.message });
  }
};

/* POST /api/staff/employees (admin/owner only at the route, then hierarchy). */
export const createEmployee = async (req, res) => {
  try {
    const { name, email, password, role, locationId } = req.body;
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!cleanName || !cleanEmail || typeof password !== "string" || password.length < 8 || !isStaffRole(role)) {
      return res.status(400).json({ message: "name, valid email, password (8+), and role required" });
    }
    if (!canAssignStaffRole(req.staff.role, role)) {
      return res.status(403).json({ message: "No tienes permiso para asignar ese rol" });
    }

    const resolvedLocation = locationId || req.staff.locationId || null;
    if (req.staff.locationId && resolvedLocation !== req.staff.locationId) {
      return res.status(403).json({ message: "No puedes crear personal en otra sucursal" });
    }

    const existing = await StaffUser.findOne({ email: cleanEmail });
    if (existing) return res.status(409).json({ message: "Email already in use" });

    const employee = await StaffUser.create({
      name: cleanName,
      email: cleanEmail,
      password: await bcrypt.hash(password, 10),
      role,
      locationId: resolvedLocation,
      active: true,
    });

    res.status(201).json({
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        color: employee.color,
        locationId: employee.locationId,
        active: employee.active,
        hourlyRate: employee.hourlyRate,
        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt,
      },
    });
  } catch (err) {
    res.status(400).json({ message: "Error creating employee", err: err.message });
  }
};

/* PATCH /api/staff/employees/:id (admin/owner plus hierarchy checks). */
export const updateEmployee = async (req, res) => {
  try {
    const target = await StaffUser.findById(req.params.id).select("_id role active locationId");
    if (!target) return res.status(404).json({ message: "Employee not found" });
    if (sameId(target._id, req.staff.id)) {
      return res.status(403).json({ message: "No puedes modificar tu propia cuenta desde este panel" });
    }
    if (req.staff.locationId && target.locationId !== req.staff.locationId) {
      return res.status(403).json({ message: "No puedes administrar otra sucursal" });
    }
    if (!canManageStaffRole(req.staff.role, target.role)) {
      return res.status(403).json({ message: "No tienes permiso para modificar a este integrante" });
    }

    const update = {};
    if (req.body.name !== undefined) {
      const cleanName = String(req.body.name).trim();
      if (!cleanName) return res.status(400).json({ message: "name cannot be empty" });
      update.name = cleanName;
    }
    if (req.body.active !== undefined) {
      if (typeof req.body.active !== "boolean") {
        return res.status(400).json({ message: "active must be boolean" });
      }
      update.active = req.body.active;
    }
    if (req.body.role !== undefined) {
      if (!isStaffRole(req.body.role) || !canAssignStaffRole(req.staff.role, req.body.role)) {
        return res.status(403).json({ message: "No tienes permiso para asignar ese rol" });
      }
      update.role = req.body.role;
    }

    if (await isLastActiveOwner(target, update)) {
      return res.status(409).json({ message: "Debe permanecer al menos un dueño activo" });
    }

    const employee = await StaffUser.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).select(PUBLIC_FIELDS);

    res.json({ employee });
  } catch (err) {
    res.status(400).json({ message: "Error updating employee", err: err.message });
  }
};

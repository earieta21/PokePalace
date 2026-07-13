import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getKioskEmployees, getManagedKioskEmployees,
  createKioskEmployee, updateKioskEmployee, removeKioskEmployee,
  clockIn, clockOut, getTimeRecords,
  getChecklist, toggleChecklistItem,
  addTempRecord, getTempRecords,
  getAnnouncements, createAnnouncement, deleteAnnouncement,
  getSchedule, saveSchedule,
} from "../controllers/kioskController.js";

const router = express.Router();

const anyStaff   = requireStaffAuth([]);
const managerOnly = requireStaffAuth(["owner", "manager", "admin"]);

// Employees
router.get   ("/employees",      getKioskEmployees);
router.get   ("/employees/manage", managerOnly, getManagedKioskEmployees);
router.post  ("/employees",      managerOnly, createKioskEmployee);
router.patch ("/employees/:id",  managerOnly, updateKioskEmployee);
router.delete("/employees/:id",  managerOnly, removeKioskEmployee);

// Time
router.post("/time/clock-in",  anyStaff, clockIn);
router.post("/time/clock-out", anyStaff, clockOut);
router.get ("/time",           anyStaff, getTimeRecords);

// Checklist
router.get  ("/checklist",      anyStaff, getChecklist);
router.patch("/checklist",      anyStaff, toggleChecklistItem);

// Temperatures
router.post("/temps",           anyStaff, addTempRecord);
router.get ("/temps",           anyStaff, getTempRecords);

// Announcements
router.get   ("/announcements",      anyStaff,    getAnnouncements);
router.post  ("/announcements",      managerOnly, createAnnouncement);
router.delete("/announcements/:id",  managerOnly, deleteAnnouncement);

// Schedule
router.get("/schedule",         anyStaff,    getSchedule);
router.put("/schedule",         managerOnly, saveSchedule);

export default router;

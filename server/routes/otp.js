const express = require("express");
const router = express.Router();
const OTP = require("../models/OTP");
const sendEmail = require("../utils/sendEmail");

// Generate Random 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Request OTP
router.post("/request", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  const otpCode = generateOTP();

  try {
    // Save OTP to DB
    await OTP.create({ email, code: otpCode });

    // Send email
    await sendEmail(email, otpCode);

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Verify OTP
router.post("/verify", async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code)
    return res.status(400).json({ message: "Email and OTP are required" });

  try {
    const otpRecord = await OTP.findOne({ email, code });
    if (!otpRecord) return res.status(400).json({ message: "Invalid OTP" });

    // OTP is valid → optionally create a user in DB
    // await User.create({ email }) // optional

    // Delete OTP after verification
    await OTP.deleteOne({ _id: otpRecord._id });

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

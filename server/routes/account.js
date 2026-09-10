const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const bcrypt = require("bcrypt");

// Generate random 5-digit OTP
const generateOtp = () => Math.floor(10000 + Math.random() * 90000).toString();

// =====================================================
// CREATE NEW ACCOUNT (ADMIN METHOD)
// =====================================================
router.post('/create', async (req, res) => {
  const { email, password, role, profile } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: "Email, password, and role are required" });
  }

  try {
    const existingAccount = await Account.findOne({ email });
    if (existingAccount) {
      return res.status(400).json({ message: "Account with this email already exists" });
    }

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const newAccount = new Account({
      email,
      password: hashedPassword,
      role,
      profile
    });

    await newAccount.save();

    res.status(201).json({ message: "Account created successfully!" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// =====================================================
// LOGIN (Check Email + Password & Return Role)
// =====================================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });

  try {
    const account = await Account.findOne({ email });

    if (!account)
      return res.status(400).json({ message: 'Invalid credentials' });

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, account.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Invalid credentials' });

    // ✅ Send role to frontend for role-based navigation
    res.status(200).json({
      message: 'Login successful',
      role: account.role,   // e.g., 'patient', 'doctor', 'nurse'
      profile: account.profile // optional extra info
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// REQUEST OTP
// =====================================================
router.post('/request', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const account = await Account.findOne({ email });
    if (!account) return res.status(400).json({ message: 'Account not found' });

    account.otp = otp;
    account.otpExpires = otpExpires;
    await account.save();

    console.log(`OTP for ${email}: ${otp}`);

    res.json({ message: 'OTP sent successfully!' });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// VERIFY OTP
// =====================================================
router.post('/verify', async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code)
    return res.status(400).json({ message: 'Email and OTP required' });

  try {
    const account = await Account.findOne({ email });
    if (!account) return res.status(400).json({ message: 'Account not found' });

    if (account.otp !== code)
      return res.status(400).json({ message: 'Invalid OTP' });

    if (account.otpExpires < new Date())
      return res.status(400).json({ message: 'OTP expired' });

    account.otp = null;
    account.otpExpires = null;
    await account.save();

    res.json({ message: 'OTP verified successfully!' });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
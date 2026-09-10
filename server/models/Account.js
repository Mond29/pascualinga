const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // In production, hash this!
  otp: { type: String },           // current OTP for login
  otpExpires: { type: Date },      // OTP expiry
  createdAt: { type: Date, default: Date.now },
});

const AccountModel = mongoose.model('Account', AccountSchema);
module.exports = AccountModel;

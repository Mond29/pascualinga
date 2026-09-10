require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const emailjs = require("@emailjs/nodejs");

// ✅ Import Account Routes (LOGIN + REQUEST + VERIFY)
const accountRoutes = require("./routes/account");

const app = express();

app.use(cors());
app.use(express.json());


// =====================================================
// ACCOUNT ROUTES
// =====================================================
app.use("/api/account", accountRoutes);


// =====================================================
// EmailJS OTP Endpoint
// (Frontend calls this after /request generates OTP)
// =====================================================
app.post("/api/send-otp", async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ message: "Email and OTP code are required" });
  }

  try {
    await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      {
        to_email: email,
        otp_code: code,
      },
      process.env.EMAILJS_PUBLIC_KEY
    );

    res.json({ message: "OTP sent successfully!" });
  } catch (err) {
    console.error("EmailJS Error:", err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});


// =====================================================
// MongoDB Connection
// =====================================================
mongoose
  .connect("mongodb://127.0.0.1:27017/pascualingaDB")
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));


// Root Route
app.get("/", (req, res) => {
  res.send("Pascualinga API Running");
});


const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

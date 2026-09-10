const nodemailer = require("nodemailer");

const sendEmail = async (toEmail, otpCode) => {
  // Use your email credentials
  const transporter = nodemailer.createTransport({
    service: "Gmail", // or your email provider
    auth: {
      user: "your_email@gmail.com",
      pass: "your_email_password_or_app_password"
    }
  });

  const mailOptions = {
    from: "your_email@gmail.com",
    to: toEmail,
    subject: "Your OTP Code",
    text: `Your OTP code is: ${otpCode}. It expires in 5 minutes.`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("OTP sent to:", toEmail);
  } catch (err) {
    console.error(err);
    throw new Error("Email sending failed");
  }
};

module.exports = sendEmail;

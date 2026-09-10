// src/utils/emailService.js
import emailjs from '@emailjs/browser';

export const sendOTPEmail = async (email, otp, username) => {
  try {
    const templateParams = {
      username: username,
      otp: otp,
      to_email: email,
    };

    const result = await emailjs.send(
      'service_abc123',     // Your Service ID
      'template_xyz456',    // Your Template ID
      templateParams,
      'user_123456'         // Your Public Key
    );

    console.log('OTP sent successfully:', result.text);
    return true;
  } catch (error) {
    console.error('Error sending OTP:', error);
    return false;
  }
};

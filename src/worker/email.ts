import { Worker } from "bullmq";
import { env } from "../config";
import * as nodemailer from "nodemailer";

export const emailWorker = new Worker(
  "email",
  async (job) => {
    switch (job.name) {
      case "password-reset-request":
        await sendPasswordResetEmail(job.data);
      default:
        return "unknown job name";
    }
  },
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
    },
  }
);

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const sendPasswordResetEmail = async (data: {
  email: string;
  token: string;
}) => {
  const resetLink = `${env.FRONTEND_URL}/resetpassword?token=${data.token}`;

  try {
    await transporter.sendMail({
      from: `Total Worker health support <${env.SMTP_USER}>`,
      to: data.email,
      subject: "รีเซ็ตรหัสผ่าน เว็บไซต์ EnvOcc_Card",
      text: `คลิกลิงก์เพื่อรีเซ็ตรหัสผ่าน: ${resetLink}`,
      html: ` <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
               <h2 style="color: #8753d5; font-size: 24px;">รีเซ็ตรหัสผ่านของคุณ</h2>
               <p>สวัสดีค่ะ</p>
               <p>คุณสามารถรีเซ็ตรหัสผ่านของคุณได้โดยคลิกที่ปุ่มด้านล่าง</p>
               <div style="text-align: center; margin: 20px 0;">
               <a href="${resetLink}" style="background-color: #8753d5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                   รีเซ็ตรหัสผ่าน
               </a>
               </div>
               <p style="font-size: 14px; color: #666;">หากคุณไม่ได้เป็นผู้ร้องขอ โปรดเพิกเฉยต่ออีเมลฉบับนี้</p>
               <p style="font-size: 12px; color: #999;">ลิงก์นี้จะหมดอายุใน 5 นาที</p>
               <hr style="margin-top: 30px; border: none; border-top: 1px solid #ccc;" />
               <p style="font-size: 12px; color: #999; text-align: center;">
               อีเมลฉบับนี้ถูกส่งโดยระบบอัตโนมัติจากระบบ กรุณาอย่าตอบกลับ<br/>
               หากมีคำถาม กรุณาติดต่อ 02-590-3867
               </p>
           </div>`,
    });
  } catch (error) {
    console.error("Failed to send email", error);
    throw error; // Let BullMQ retry
  }

  console.log(`Sending password reset email to ${data.email}`);
};

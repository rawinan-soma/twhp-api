import { Worker } from "bullmq";
import * as nodemailer from "nodemailer";
import { env } from "../config";
import { adminService } from "../service/admin";

export const emailWorker = new Worker(
  "email",
  async (job) => {
    switch (job.name) {
      case "password-reset-request":
        await sendPasswordResetEmail(job.data);
        break;
      case "factory-validation-reminder":
        await sendFactoryValidationReminderEmail();
        break;
      case "2fa-otp":
        await sendOtpEmail(job.data);
        break;
      case "verdict-result-finished":
        await sendVerdictResultFinishedEmail(job.data);
        break;
      case "verdict-result-in-progress":
        await sendVerdictResultInProgressEmail(job.data);
        break;
      default:
        return "unknown job name";
    }
  },
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
    },
  },
);

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const sendOtpEmail = async (data: { email: string; code: string }) => {
  try {
    await transporter.sendMail({
      from: `Total Worker health support <${env.SMTP_USER}>`,
      to: data.email,
      subject: "รหัส OTP สำหรับเข้าสู่ระบบ",
      text: `รหัส OTP ของท่านคือ: ${data.code}\n\nรหัสนี้จะหมดอายุใน 5 นาที\n\nหากท่านไม่ได้ร้องขอรหัสนี้ กรุณาติดต่อผู้ดูแลระบบ`,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
               <h2 style="color: #2E8B57; font-size: 24px;">รหัส OTP สำหรับเข้าสู่ระบบ</h2>
               <p>สวัสดีค่ะ</p>
               <p>รหัส OTP สำหรับเข้าสู่ระบบของท่านคือ</p>
               <div style="text-align: center; margin: 20px 0;">
                 <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2E8B57;">${data.code}</span>
               </div>
               <p style="font-size: 14px; color: #666;">รหัสนี้จะหมดอายุใน 5 นาที กรุณาอย่าเปิดเผยรหัสนี้แก่ผู้อื่น</p>
               <p style="font-size: 14px; color: #666;">หากท่านไม่ได้ร้องขอรหัสนี้ กรุณาติดต่อผู้ดูแลระบบทันที</p>
               <hr style="margin-top: 30px; border: none; border-top: 1px solid #ccc;" />
               <p style="font-size: 12px; color: #999; text-align: center;">
                 อีเมลฉบับนี้ถูกส่งโดยระบบอัตโนมัติจากระบบ กรุณาอย่าตอบกลับ<br/>
                 หากมีคำถาม กรุณาติดต่อ 02-590-3867
               </p>
             </div>`,
    });
  } catch (error) {
    console.error("Failed to send OTP email", error);
    throw error; // Let BullMQ retry
  }
};

const sendPasswordResetEmail = async (data: { email: string; token: string }) => {
  const resetLink = `${env.FRONTEND_URL}/resetpassword?token=${data.token}`;

  try {
    await transporter.sendMail({
      from: `Total Worker health support <${env.SMTP_USER}>`,
      to: data.email,
      subject: "รีเซ็ตรหัสผ่าน เว็บไซต์ โครงการพัฒนาสถานประกอบการปลอดโรค ปลอดภัย กายใจเป็นสุข",
      text: `คลิกลิงก์เพื่อรีเซ็ตรหัสผ่าน: ${resetLink}`,
      html: ` <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
               <h2 style="color: #2E8B57; font-size: 24px;">รีเซ็ตรหัสผ่านของคุณ</h2>
               <p>สวัสดีค่ะ</p>
               <p>คุณสามารถรีเซ็ตรหัสผ่านของคุณได้โดยคลิกที่ปุ่มด้านล่าง</p>
               <div style="text-align: center; margin: 20px 0;">
               <a href="${resetLink}" style="background-color: #2E8B57; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
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

const GRADE_LABEL: Record<string, string> = {
  gold: "รางวัลเชิดชูเกียรติและประกาศนียบัตรระดับประเทศ ประเภท โล่ทอง",
  silver: "รางวัลเชิดชูเกียรติและประกาศนียบัตรระดับประเทศ ประเภท โล่เงิน",
  certificate: "ใบประกาศเกียรติคุณระดับจังหวัด",
  joined: "ใบประกาศเกียรติคุณเข้าร่วมโครงการฯ",
};

const sendVerdictResultFinishedEmail = async (data: {
  email: string;
  grade: string | null;
  factoryNameTh: string;
}) => {
  const gradeLabel = data.grade ? (GRADE_LABEL[data.grade] ?? data.grade) : "-";
  try {
    await transporter.sendMail({
      from: `Total Worker health support <${env.SMTP_USER}>`,
      to: data.email,
      subject: "ผลการประเมินโครงการ พัฒนาสถานประกอบการปลอดโรค ปลอดภัย กายใจเป็นสุข",
      text: `เรียน คุณผู้รับผิดชอบ ${data.factoryNameTh}\n\nขอแจ้งให้ทราบว่าโรงงานของท่านผ่านการประเมินโครงการ พัฒนาสถานประกอบการปลอดโรค ปลอดภัย กายใจเป็นสุข เรียบร้อยแล้ว\nผลการประเมิน: ${gradeLabel}\n\nกรุณาเข้าสู่ระบบเพื่อดูผลการประเมินอย่างละเอียด`,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
               <h2 style="color: #2E8B57;">ผลการประเมินโครงการ พัฒนาสถานประกอบการปลอดโรค ปลอดภัย กายใจเป็นสุข</h2>
               <p>เรียน คุณผู้รับผิดชอบ ${data.factoryNameTh}</p>
               <p>ขอแจ้งให้ทราบว่าโรงงานของท่านได้รับการประเมินโครงการ พัฒนาสถานประกอบการปลอดโรค ปลอดภัย กายใจเป็นสุข เรียบร้อยแล้ว</p>
               <div style="background-color: #f0f9f0; border-left: 4px solid #2E8B57; padding: 16px; margin: 20px 0;">
                 <p style="margin: 0; font-size: 16px;"><strong>ผลการประเมิน:</strong> <span style="color: #2E8B57; font-size: 18px;">${gradeLabel}</span></p>
               </div>
               <p>กรุณาเข้าสู่ระบบเพื่อดูผลการประเมินและคะแนนอย่างละเอียด</p>
               <hr style="margin-top: 30px; border: none; border-top: 1px solid #ccc;" />
               <p style="font-size: 12px; color: #999; text-align: center;">
                 อีเมลฉบับนี้ถูกส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ<br/>
                 หากมีคำถาม กรุณาติดต่อ 02-590-3867
               </p>
             </div>`,
    });
  } catch (error) {
    console.error("Failed to send verdict-result-finished email", error);
    throw error;
  }
};

const sendVerdictResultInProgressEmail = async (data: { email: string; factoryNameTh: string }) => {
  try {
    await transporter.sendMail({
      from: `Total Worker health support <${env.SMTP_USER}>`,
      to: data.email,
      subject: "แจ้งผลการพิจารณา — โปรดดำเนินการปรับปรุงคำตอบ",
      text: `เรียน คุณผู้รับผิดชอบ ${data.factoryNameTh}\n\nขอแจ้งให้ทราบว่าผู้ประเมินได้ส่งคืนผลการประเมินของท่านเพื่อให้ดำเนินการปรับปรุงแก้ไข\nกรุณาเข้าสู่ระบบและตรวจสอบคำตอบที่ต้องแก้ไข จากนั้นส่งคำตอบกลับมาใหม่`,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
               <h2 style="color: #E07B39;">แจ้งผลการพิจารณา — โปรดดำเนินการปรับปรุงคำตอบ</h2>
               <p>เรียน คุณผู้รับผิดชอบ ${data.factoryNameTh}</p>
               <p>ขอแจ้งให้ทราบว่าผู้ประเมินได้ทำการพิจารณาแบบประเมินของท่านและส่งคืนเพื่อให้ดำเนินการปรับปรุงแก้ไขในบางรายการ</p>
               <div style="background-color: #fff8f0; border-left: 4px solid #E07B39; padding: 16px; margin: 20px 0;">
                 <p style="margin: 0; font-size: 16px;"><strong>สถานะ:</strong> <span style="color: #E07B39;">ต้องปรับปรุงแก้ไข</span></p>
               </div>
               <p>กรุณาเข้าสู่ระบบเพื่อตรวจสอบรายการที่ต้องแก้ไข และส่งคำตอบกลับมาใหม่หลังจากดำเนินการเสร็จสิ้น</p>
               <hr style="margin-top: 30px; border: none; border-top: 1px solid #ccc;" />
               <p style="font-size: 12px; color: #999; text-align: center;">
                 อีเมลฉบับนี้ถูกส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ<br/>
                 หากมีคำถาม กรุณาติดต่อ 02-590-3867
               </p>
             </div>`,
    });
  } catch (error) {
    console.error("Failed to send verdict-result-in-progress email", error);
    throw error;
  }
};

const sendFactoryValidationReminderEmail = async () => {
  const { doedAdmins, pendingFactories } = await adminService.getPendingValidationData();

  if (pendingFactories.length === 0) {
    console.log("No pending factories — skipping validation reminder email.");
    return;
  }

  const factoryRows = pendingFactories
    .map(
      (f) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${f.accountId}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${f.nameTh}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${f.nameEn}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${f.provinceName}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${f.phoneNumber}</td>
        </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: auto; padding: 20px;">
      <h2 style="color: #2E8B57;">แจ้งเตือน: โรงงานที่ยังไม่ได้รับการอนุมัติ</h2>
      <p>เรียน คุณ__ADMIN_NAME__</p>
      <p>ขณะนี้มีโรงงานที่ลงทะเบียนแล้วแต่ยังไม่ได้รับการอนุมัติจำนวน <strong>${pendingFactories.length} แห่ง</strong> กรุณาดำเนินการตรวจสอบและอนุมัติโรงงานดังกล่าว</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <thead>
          <tr style="background-color: #2E8B57; color: white;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">รหัส</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">ชื่อโรงงาน (ไทย)</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">ชื่อโรงงาน (อังกฤษ)</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">จังหวัด</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">เบอร์โทรศัพท์</th>
          </tr>
        </thead>
        <tbody>${factoryRows}</tbody>
      </table>
      <hr style="margin-top: 30px; border: none; border-top: 1px solid #ccc;" />
      <p style="font-size: 12px; color: #999; text-align: center;">
        อีเมลฉบับนี้ถูกส่งโดยระบบอัตโนมัติจากระบบ กรุณาอย่าตอบกลับ<br/>
        หากมีคำถาม กรุณาติดต่อ 02-590-3867
      </p>
    </div>`;

  for (const admin of doedAdmins) {
    const personalizedHtml = html.replace("__ADMIN_NAME__", `${admin.firstName} ${admin.lastName}`);
    try {
      await transporter.sendMail({
        from: `Total Worker health support <${env.SMTP_USER}>`,
        to: admin.email,
        subject: `แจ้งเตือน: โรงงานรอการอนุมัติ ${pendingFactories.length} แห่ง`,
        text: `เรียน คุณ${admin.firstName} ${admin.lastName}\n\nมีโรงงานที่ยังไม่ได้รับการอนุมัติจำนวน ${pendingFactories.length} แห่ง กรุณาเข้าสู่ระบบเพื่อดำเนินการ`,
        html: personalizedHtml,
      });
      console.log(`Sent validation reminder to ${admin.email}`);
    } catch (error) {
      console.error(`Failed to send validation reminder to ${admin.email}`, error);
      throw error;
    }
  }
};

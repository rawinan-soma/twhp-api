import { SpanStatusCode } from "@opentelemetry/api";
import { type ConnectionOptions, type Job, type Queue, Worker } from "bullmq";
import * as nodemailer from "nodemailer";
import { bullmqTelemetry } from "../bullmqTelemetry";
import { withClientSpan } from "../clientSpan";
import { env } from "../config";
import { createLogger, type Logger } from "../logger";
import { adminService } from "../service/admin";

const logger = createLogger("twhp-worker");

/** What every sender needs about the job it runs in: a job-scoped logger and the job name. */
type JobContext = { log: Logger; jobName: string };

export const processEmailJob = async (job: Pick<Job, "id" | "name" | "data">) => {
  const ctx: JobContext = {
    log: logger.child({ jobId: job.id, jobName: job.name }),
    jobName: job.name,
  };
  switch (job.name) {
    case "password-reset-request":
      await sendPasswordResetEmail(job.data, ctx);
      break;
    case "factory-validation-reminder":
      await sendFactoryValidationReminderEmail(ctx);
      break;
    case "2fa-otp":
      await sendOtpEmail(job.data, ctx);
      break;
    case "verdict-result-finished":
      await sendVerdictResultFinishedEmail(job.data, ctx);
      break;
    case "verdict-result-in-progress":
      await sendVerdictResultInProgressEmail(job.data, ctx);
      break;
    default:
      return "unknown job name";
  }
};

/**
 * The email worker, with BullMQ's telemetry: its `process` span continues the trace the producer
 * stored on the job, so the sender spans below join the API request that enqueued it.
 * `src/workers.ts` creates the production one on `email`; tests pass their own queue.
 */
export const createEmailWorker = (
  queueName = "email",
  connection: ConnectionOptions = { host: env.REDIS_HOST, port: env.REDIS_PORT },
) => new Worker(queueName, processEmailJob, { connection, telemetry: bullmqTelemetry() });

/**
 * Daily at 08:30 Bangkok time (the worker's local time, `TZ=Asia/Bangkok`). `omitContext` keeps the
 * scheduling call's trace off the job, so every run starts its own root trace rather than hanging
 * off the worker's startup for days.
 */
export const scheduleValidationReminder = (queue: Queue) =>
  queue.add(
    "factory-validation-reminder",
    {},
    {
      repeat: { pattern: "30 8 * * *" },
      jobId: "factory-validation-reminder",
      removeOnComplete: true,
      removeOnFail: { count: 10 },
      telemetry: { omitContext: true },
    },
  );

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

/** Recipients in a `to`/`cc`/`bcc` field: a string may hold a comma-separated list. */
const countAddresses = (field: nodemailer.SendMailOptions["to"]) =>
  (Array.isArray(field) ? field : field ? [field] : []).reduce<number>(
    (count, entry) =>
      count + (typeof entry === "string" ? entry.split(",").filter((p) => p.trim()).length : 1),
    0,
  );

/**
 * Every send is one `smtp.send` span carrying the same counts and `messageId` as the log line, and
 * the job name — never addresses, subject or body. It is an error when the relay throws or
 * accepts no recipient.
 *
 * `sendMail` resolves as long as the relay accepted *at least one* recipient — it reports the
 * rest in `info.rejected`. A verdict email addressed to the factory and cc'ing the safety
 * officer can therefore "succeed" with the cc silently dropped at RCPT time, which is
 * indistinguishable from never having been sent unless we log both counts. Every sender goes
 * through here so that distinction is always on the record.
 *
 * Only counts are logged, never the addresses. The `messageId` is logged without its
 * `@domain` part, which is enough to find the message in the relay's own logs.
 *
 * A partial rejection is logged, never thrown: throwing would make BullMQ retry the whole job
 * and re-deliver to the recipients the relay already accepted.
 */
const sendAndLog = ({ log, jobName }: JobContext, options: nodemailer.SendMailOptions) =>
  withClientSpan(
    "smtp.send",
    {
      "email.job.name": jobName,
      "email.recipients.count":
        countAddresses(options.to) + countAddresses(options.cc) + countAddresses(options.bcc),
    },
    async (span) => {
      const info = await transporter.sendMail(options);
      const fields = {
        accepted: info.accepted?.length ?? 0,
        rejected: info.rejected?.length ?? 0,
        messageId: info.messageId?.replace(/^<|@.*$/g, ""),
      };
      span.setAttributes({
        "email.accepted.count": fields.accepted,
        "email.rejected.count": fields.rejected,
        ...(fields.messageId ? { "email.message_id": fields.messageId } : {}),
      });

      if (fields.accepted === 0) span.setStatus({ code: SpanStatusCode.ERROR });
      if (fields.rejected > 0) {
        log.error(fields, "Relay rejected recipient(s)");
      } else {
        log.info(fields, "Email sent");
      }

      return info;
    },
  );

/**
 * Only the error's class and SMTP codes are logged: nodemailer messages and properties quote the
 * rejected addresses. BullMQ keeps the full message as the job's `failedReason`.
 */
const errorFields = (error: unknown) => {
  const e = error as { name?: string; code?: string; responseCode?: number; command?: string };
  return {
    err: { type: e?.name, code: e?.code, responseCode: e?.responseCode, command: e?.command },
  };
};

const sendOtpEmail = async (data: { email: string; code: string }, ctx: JobContext) => {
  const { log } = ctx;
  try {
    await sendAndLog(ctx, {
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
    log.error(errorFields(error), "Failed to send OTP email");
    throw error; // Let BullMQ retry
  }
};

const sendPasswordResetEmail = async (data: { email: string; token: string }, ctx: JobContext) => {
  const { log } = ctx;
  const resetLink = `${env.FRONTEND_URL}/resetpassword?token=${data.token}`;

  try {
    await sendAndLog(ctx, {
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
    log.error(errorFields(error), "Failed to send email");
    throw error; // Let BullMQ retry
  }
};

const GRADE_LABEL: Record<string, string> = {
  gold: "รางวัลเชิดชูเกียรติและประกาศนียบัตรระดับประเทศ ประเภท โล่ทอง",
  silver: "รางวัลเชิดชูเกียรติและประกาศนียบัตรระดับประเทศ ประเภท โล่เงิน",
  certificate: "ใบประกาศเกียรติคุณระดับจังหวัด",
  joined: "ใบประกาศเกียรติคุณเข้าร่วมโครงการฯ",
};

const sendVerdictResultFinishedEmail = async (
  data: {
    email: string;
    cc?: string;
    grade: string | null;
    factoryNameTh: string;
  },
  ctx: JobContext,
) => {
  const { log } = ctx;
  const gradeLabel = data.grade ? (GRADE_LABEL[data.grade] ?? data.grade) : "-";
  try {
    await sendAndLog(ctx, {
      from: `Total Worker health support <${env.SMTP_USER}>`,
      to: data.email,
      cc: data.cc,
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
    log.error(errorFields(error), "Failed to send verdict-result-finished email");
    throw error;
  }
};

const sendVerdictResultInProgressEmail = async (
  data: {
    email: string;
    cc?: string;
    factoryNameTh: string;
  },
  ctx: JobContext,
) => {
  const { log } = ctx;
  try {
    await sendAndLog(ctx, {
      from: `Total Worker health support <${env.SMTP_USER}>`,
      to: data.email,
      cc: data.cc,
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
    log.error(errorFields(error), "Failed to send verdict-result-in-progress email");
    throw error;
  }
};

const sendFactoryValidationReminderEmail = async (ctx: JobContext) => {
  const { log } = ctx;
  // One span for the reminder's reads: no `pg` spans exist in the compiled worker (ADR-0014).
  const { doedAdmins, pendingFactories } = await withClientSpan(
    "db.pending_factories",
    { "db.system.name": "postgresql" },
    async (span) => {
      const data = await adminService.getPendingValidationData();
      span.setAttributes({
        "twhp.doed_admins.count": data.doedAdmins.length,
        "twhp.pending_factories.count": data.pendingFactories.length,
      });
      return data;
    },
  );

  if (pendingFactories.length === 0) {
    log.info("No pending factories — skipping validation reminder email.");
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
      await sendAndLog(ctx, {
        from: `Total Worker health support <${env.SMTP_USER}>`,
        to: admin.email,
        subject: `แจ้งเตือน: โรงงานรอการอนุมัติ ${pendingFactories.length} แห่ง`,
        text: `เรียน คุณ${admin.firstName} ${admin.lastName}\n\nมีโรงงานที่ยังไม่ได้รับการอนุมัติจำนวน ${pendingFactories.length} แห่ง กรุณาเข้าสู่ระบบเพื่อดำเนินการ`,
        html: personalizedHtml,
      });
    } catch (error) {
      log.error(
        { ...errorFields(error), adminAccountId: admin.accountId },
        "Failed to send validation reminder",
      );
      throw error;
    }
  }
};

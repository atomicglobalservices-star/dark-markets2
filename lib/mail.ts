import nodemailer from "nodemailer";
export async function sendMail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST) throw new Error("Email delivery not configured");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_PORT === "465",
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
      : {}),
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM || "noreply@localhost",
    to,
    subject,
    text,
  });
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface NotificationPayload {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPort = this.config.get<number>('SMTP_PORT') ?? 587;
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    if (smtpHost && smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      this.logger.log('Email transporter initialized');
    } else {
      this.logger.warn('SMTP not configured — email notifications disabled');
    }
  }

  async sendEmail(payload: NotificationPayload): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Email not sent (SMTP not configured): ${payload.subject}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `"SmartServe QR" <${this.config.get<string>('SMTP_USER')}>`,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });
      this.logger.log(`Email sent to ${payload.to}: ${payload.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send email to ${payload.to}: ${(err as Error).message}`);
      return false;
    }
  }

  async sendTaskAssignmentNotification(
    employeeEmail: string,
    employeeName: string,
    requestId: string,
    serviceType: string,
    locationName: string,
  ): Promise<boolean> {
    return this.sendEmail({
      to: employeeEmail,
      subject: `New Task Assigned: ${serviceType}`,
      html: `
        <h2>New Task Assignment</h2>
        <p>Hi ${employeeName},</p>
        <p>You have been assigned a new task:</p>
        <ul>
          <li><strong>Request ID:</strong> ${requestId}</li>
          <li><strong>Service Type:</strong> ${serviceType}</li>
          <li><strong>Location:</strong> ${locationName}</li>
        </ul>
        <p>Please open your dashboard to view details.</p>
      `,
    });
  }

  async sendLowSatisfactionAlert(
    managerEmail: string,
    requestId: string,
    rating: number,
    locationName: string,
  ): Promise<boolean> {
    return this.sendEmail({
      to: managerEmail,
      subject: `Low Satisfaction Alert — Rating: ${rating}/5`,
      html: `
        <h2>Low Satisfaction Alert</h2>
        <p>A guest has submitted a low satisfaction rating:</p>
        <ul>
          <li><strong>Request ID:</strong> ${requestId}</li>
          <li><strong>Rating:</strong> ${rating}/5</li>
          <li><strong>Location:</strong> ${locationName}</li>
        </ul>
        <p>Please review the feedback and take appropriate action.</p>
      `,
    });
  }

  async sendEscalationNotification(
    managerEmail: string,
    requestId: string,
    elapsedMinutes: number,
    locationName: string,
  ): Promise<boolean> {
    return this.sendEmail({
      to: managerEmail,
      subject: `Request Escalation — ${elapsedMinutes} min pending`,
      html: `
        <h2>Request Escalation</h2>
        <p>A request has been pending for ${elapsedMinutes} minutes:</p>
        <ul>
          <li><strong>Request ID:</strong> ${requestId}</li>
          <li><strong>Elapsed:</strong> ${elapsedMinutes} minutes</li>
          <li><strong>Location:</strong> ${locationName}</li>
        </ul>
        <p>Please assign this request immediately.</p>
      `,
    });
  }
}
